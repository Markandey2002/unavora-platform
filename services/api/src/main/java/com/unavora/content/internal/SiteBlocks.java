package com.unavora.content.internal;

import com.unavora.platform.ApiException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Schemas of the editable website blocks. Every block is validated and normalised before it is stored: unknown
 * fields are dropped, lengths are capped, enumerations are checked, and only plain text is kept (the website renders
 * it as text, never as HTML). English is required; Hindi is optional and falls back to English on the site.
 */
final class SiteBlocks {
    static final JsonMapper JSON = JsonMapper.builder().build();
    static final List<String> SECTIONS = List.of("launches", "featured", "categories", "locations", "why", "about", "owner",
            "partner", "insights", "videos", "testimonials", "associations", "enquiry");
    static final Set<String> TILE_KEYS = Set.of("residential", "commercial", "land", "office");
    /** SEO override blocks: key "seo.<page>" -> public path. */
    static final Map<String, String> SEO_PAGES = Map.ofEntries(Map.entry("home", "/"), Map.entry("about", "/about"),
            Map.entry("properties", "/properties"), Map.entry("residential", "/residential"), Map.entry("commercial", "/commercial"),
            Map.entry("plots", "/plots"), Map.entry("projects", "/projects"), Map.entry("insights", "/insights"),
            Map.entry("channel-partner", "/channel-partner"), Map.entry("list-your-property", "/list-your-property"),
            Map.entry("contact", "/contact"), Map.entry("careers", "/careers"));
    static final Set<String> JOB_TYPES = Set.of("full_time", "part_time", "contract", "internship");

    private SiteBlocks() {}

    static boolean validKey(String key) {
        return Set.of("home.hero", "home.tiles", "home.sections", "careers.page").contains(key)
                || (key.startsWith("seo.") && SEO_PAGES.containsKey(key.substring(4)));
    }

    /** Returns the normalised content to store, or throws 422 with a readable message. */
    static Map<String, Object> normalise(String key, JsonNode in) {
        if (in == null || !in.isObject()) throw bad("Content must be an object");
        Map<String, Object> out = new LinkedHashMap<>();
        switch (key) {
            case "home.hero" -> {
                out.put("en", texts(in.get("en"), true, Map.of("eyebrow", 80, "title", 120, "sub", 300, "primaryLabel", 40, "secondaryLabel", 40), Set.of("title")));
                putOptional(out, "hi", texts(in.get("hi"), false, Map.of("eyebrow", 80, "title", 120, "sub", 300, "primaryLabel", 40, "secondaryLabel", 40), Set.of("title")));
                putOptional(out, "imageId", uuid(in.get("imageId")));
            }
            case "home.tiles" -> {
                JsonNode items = in.get("items");
                if (items == null || !items.isArray() || items.size() > 4) throw bad("Up to four category tiles");
                List<Map<String, Object>> list = new ArrayList<>();
                Set<String> seen = new LinkedHashSet<>();
                for (JsonNode it : items) {
                    String k = it.path("key").asString("");
                    if (!TILE_KEYS.contains(k) || !seen.add(k)) throw bad("Each tile needs a different category (residential, commercial, land, office)");
                    Map<String, Object> tile = new LinkedHashMap<>();
                    tile.put("key", k);
                    tile.put("visible", !it.has("visible") || it.get("visible").asBoolean(true));
                    tile.put("en", texts(it.get("en"), true, Map.of("title", 60, "body", 200), Set.of("title")));
                    putOptional(tile, "hi", texts(it.get("hi"), false, Map.of("title", 60, "body", 200), Set.of("title")));
                    putOptional(tile, "imageId", uuid(it.get("imageId")));
                    list.add(tile);
                }
                out.put("items", list);
            }
            case "home.sections" -> {
                List<String> order = new ArrayList<>();
                for (JsonNode n : iter(in.get("order"))) {
                    String s = n.asString("");
                    if (!SECTIONS.contains(s)) throw bad("Unknown section: " + s);
                    if (!order.contains(s)) order.add(s);
                }
                for (String s : SECTIONS) if (!order.contains(s)) order.add(s);   // nothing can be lost by omission
                List<String> hidden = new ArrayList<>();
                for (JsonNode n : iter(in.get("hidden"))) {
                    String s = n.asString("");
                    if (!SECTIONS.contains(s)) throw bad("Unknown section: " + s);
                    if (s.equals("enquiry")) throw bad("The enquiry section cannot be hidden");
                    if (!hidden.contains(s)) hidden.add(s);
                }
                out.put("order", order);
                out.put("hidden", hidden);
            }
            case "careers.page" -> {
                out.put("en", texts(in.get("en"), true, Map.of("title", 120, "intro", 2000), Set.of("title")));
                putOptional(out, "hi", texts(in.get("hi"), false, Map.of("title", 120, "intro", 2000), Set.of("title")));
                List<Map<String, Object>> jobs = new ArrayList<>();
                for (JsonNode j : iter(in.get("openings"))) {
                    if (jobs.size() >= 30) throw bad("Up to 30 openings");
                    Map<String, Object> job = texts(j, true, Map.of("title", 120, "location", 100, "description", 3000), Set.of("title", "location"));
                    String type = j.path("type").asString("full_time");
                    if (!JOB_TYPES.contains(type)) throw bad("Job type must be full_time, part_time, contract or internship");
                    job.put("type", type);
                    job.put("active", !j.has("active") || j.get("active").asBoolean(true));
                    job.put("id", j.hasNonNull("id") && j.get("id").asString("").matches("[0-9a-f-]{36}") ? j.get("id").asString() : UUID.randomUUID().toString());
                    jobs.add(job);
                }
                out.put("openings", jobs);
            }
            default -> {   // seo.<page>
                out.put("en", texts(in.get("en"), true, Map.of("title", 70, "description", 170), Set.of("title", "description")));
                putOptional(out, "hi", texts(in.get("hi"), false, Map.of("title", 70, "description", 170), Set.of("title", "description")));
            }
        }
        return out;
    }

    /** Text fields of one language; drops unknown keys, trims, enforces lengths and required fields. */
    private static Map<String, Object> texts(JsonNode n, boolean required, Map<String, Integer> fields, Set<String> mandatory) {
        if (n == null || n.isNull() || !n.isObject()) {
            if (required) throw bad("English text is required");
            return null;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        boolean any = false;
        for (var f : fields.entrySet()) {
            String v = n.path(f.getKey()).asString("").trim();
            if (v.length() > f.getValue()) throw bad(f.getKey() + " is too long (max " + f.getValue() + ")");
            if (!v.isEmpty()) { out.put(f.getKey(), v); any = true; }
        }
        if (!any && !required) return null;
        for (String m : mandatory) if (!out.containsKey(m)) throw bad(m + " is required");
        return out;
    }

    private static Iterable<JsonNode> iter(JsonNode n) {
        if (n == null || n.isNull()) return List.of();
        if (!n.isArray()) throw bad("A list was expected");
        List<JsonNode> out = new ArrayList<>();
        n.forEach(out::add);
        return out;
    }

    private static String uuid(JsonNode n) {
        if (n == null || n.isNull() || n.asString("").isBlank()) return null;
        String v = n.asString("");
        if (!v.matches("[0-9a-f-]{36}")) throw bad("Invalid image");
        return v;
    }

    private static void putOptional(Map<String, Object> m, String k, Object v) { if (v != null) m.put(k, v); }

    static ApiException bad(String msg) { return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validation_failed", msg); }
}
