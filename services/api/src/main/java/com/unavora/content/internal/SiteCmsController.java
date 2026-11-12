package com.unavora.content.internal;

import com.unavora.identity.AccessService;
import com.unavora.platform.ApiException;
import com.unavora.platform.MediaLibrary;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.JsonNode;

/**
 * Director CMS: editable website blocks (hero, category tiles, homepage section order, SEO overrides, careers),
 * the site image library and associations.
 * Workflow: cms.manage edits the DRAFT and submits it; cms.publish (director) publishes it (draft becomes live) or
 * unpublishes it (the website falls back to built-in defaults / hides the section). The live content is never
 * changed by editing. Drafts are visible only to staff, including through the preview endpoint. Everything audited.
 */
@RestController
class SiteCmsController {
    private static final String BASE = "/internal/v1/staff/cms";
    private final JdbcClient jdbc;
    private final AccessService access;
    private final MediaLibrary media;
    private final String mediaBase;

    SiteCmsController(JdbcClient jdbc, AccessService access, MediaLibrary media, @Value("${unavora.media.public-base-url:}") String mediaBase) {
        this.jdbc = jdbc;
        this.access = access;
        this.media = media;
        this.mediaBase = mediaBase == null ? "" : mediaBase.replaceAll("/+$", "");
    }

    // ======================= staff: blocks =======================

    @GetMapping({BASE + "/blocks", "/api/v1/staff/cms/blocks"})
    @PreAuthorize("@access.has('cms.manage')")
    List<Map<String, Object>> blocks() {
        Map<String, Map<String, Object>> rows = new LinkedHashMap<>();
        for (String k : List.of("home.hero", "home.tiles", "home.sections", "careers.page")) rows.put(k, row(k, null, null, null, null));
        SiteBlocks.SEO_PAGES.keySet().stream().sorted().forEach(p -> rows.put("seo." + p, row("seo." + p, null, null, null, null)));
        jdbc.sql("SELECT block_key, status, updated_at, published_at, published_json IS NOT NULL FROM site_blocks").query((rs, n) -> {
            rows.put(rs.getString(1), row(rs.getString(1), rs.getString(2), rs.getObject(3, OffsetDateTime.class), rs.getObject(4, OffsetDateTime.class), rs.getBoolean(5)));
            return null;
        }).list();
        return new ArrayList<>(rows.values());
    }

    private static Map<String, Object> row(String key, String status, OffsetDateTime updated, OffsetDateTime published, Boolean live) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("key", key); m.put("status", status == null ? "not_started" : status); m.put("live", Boolean.TRUE.equals(live));
        m.put("updatedAt", updated); m.put("publishedAt", published);
        return m;
    }

    @GetMapping({BASE + "/blocks/{key}", "/api/v1/staff/cms/blocks/{key}"})
    @PreAuthorize("@access.has('cms.manage')")
    Map<String, Object> block(@PathVariable String key) {
        requireKey(key);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("key", key);
        var r = jdbc.sql("SELECT status, draft_json, published_json, updated_at, published_at FROM site_blocks WHERE block_key = :k").param("k", key)
                .query((rs, n) -> new Object[]{rs.getString(1), rs.getString(2), rs.getString(3), rs.getObject(4, OffsetDateTime.class), rs.getObject(5, OffsetDateTime.class)})
                .optional();
        m.put("status", r.map(x -> x[0]).orElse("not_started"));
        m.put("draft", r.map(x -> parse((String) x[1])).orElse(null));
        m.put("published", r.map(x -> parse((String) x[2])).orElse(null));
        m.put("updatedAt", r.map(x -> x[3]).orElse(null));
        m.put("publishedAt", r.map(x -> x[4]).orElse(null));
        m.put("history", history("site_block", key));
        m.put("canPublish", access.has("cms.publish"));
        return m;
    }

    @PutMapping({BASE + "/blocks/{key}", "/api/v1/staff/cms/blocks/{key}"})
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    Map<String, Object> saveDraft(@PathVariable String key, @RequestBody JsonNode content) {
        requireKey(key);
        Map<String, Object> normalised = SiteBlocks.normalise(key, content);
        checkImages(normalised);
        String json = SiteBlocks.JSON.writeValueAsString(normalised);
        jdbc.sql("""
                INSERT INTO site_blocks (block_key, draft_json, status, updated_by, updated_at) VALUES (:k, :j, 'draft', :me, now())
                ON CONFLICT (block_key) DO UPDATE SET draft_json = EXCLUDED.draft_json, status = 'draft', updated_by = EXCLUDED.updated_by, updated_at = now()""")
                .param("k", key).param("j", json).param("me", me()).update();
        audit("cms.block.saved", "site_block", key);
        return block(key);
    }

    @PostMapping({BASE + "/blocks/{key}/{action:submit|publish|unpublish}", "/api/v1/staff/cms/blocks/{key}/{action:submit|publish|unpublish}"})
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    Map<String, Object> blockAction(@PathVariable String key, @PathVariable String action) {
        requireKey(key);
        if (!"submit".equals(action) && !access.has("cms.publish")) throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Only the director can publish website content");
        String status = jdbc.sql("SELECT status FROM site_blocks WHERE block_key = :k").param("k", key).query(String.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "nothing_to_publish", "Save a draft first"));
        switch (action) {
            case "submit" -> {
                if (!"draft".equals(status)) throw new ApiException(HttpStatus.CONFLICT, "not_draft", "Only an edited draft can be submitted");
                jdbc.sql("UPDATE site_blocks SET status = 'in_review', submitted_by = :me, submitted_at = now() WHERE block_key = :k").param("me", me()).param("k", key).update();
            }
            case "publish" -> {
                int n = jdbc.sql("UPDATE site_blocks SET published_json = draft_json, status = 'published', published_by = :me, published_at = now() "
                        + "WHERE block_key = :k AND draft_json IS NOT NULL").param("me", me()).param("k", key).update();
                if (n == 0) throw new ApiException(HttpStatus.CONFLICT, "nothing_to_publish", "Save a draft first");
                checkImages(parse(jdbc.sql("SELECT published_json FROM site_blocks WHERE block_key = :k").param("k", key).query(String.class).single()));
            }
            default -> jdbc.sql("UPDATE site_blocks SET published_json = NULL, status = 'unpublished' WHERE block_key = :k").param("k", key).update();
        }
        audit("cms.block." + action, "site_block", key);
        return block(key);
    }

    /** Staff-only preview of the website blocks as they WOULD look with the current drafts. */
    @GetMapping({BASE + "/preview", "/api/v1/staff/cms/preview"})
    @PreAuthorize("@access.has('cms.manage')")
    Map<String, Object> preview(@RequestParam(defaultValue = "en") String lang) {
        return render(lang, true);
    }

    // ======================= staff: image library =======================

    @GetMapping({BASE + "/media", "/api/v1/staff/cms/media"})
    @PreAuthorize("@access.has('cms.manage')")
    List<Map<String, Object>> library() { return media.list(MediaLibrary.Target.SITE, MediaLibrary.SITE_LIBRARY); }

    @PostMapping(value = {BASE + "/media", "/api/v1/staff/cms/media"}, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    ResponseEntity<Map<String, Object>> uploadImage(@RequestParam("file") MultipartFile file, @RequestParam(required = false) String kind,
                                                    @RequestParam(required = false) String captionEn, @RequestParam(required = false) String altEn,
                                                    @RequestParam(required = false) String altHi, @RequestParam(required = false) String credit,
                                                    @RequestParam(required = false) String licence) throws java.io.IOException {
        UUID id = media.upload(MediaLibrary.Target.SITE, MediaLibrary.SITE_LIBRARY, file.getBytes(),
                new MediaLibrary.Meta(kind, captionEn, null, altEn, altHi, credit, licence, null), me(), null);
        audit("cms.media.uploaded", "site_media", id.toString());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @PutMapping({BASE + "/media/{id}", "/api/v1/staff/cms/media/{id}"})
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    List<Map<String, Object>> updateImage(@PathVariable UUID id, @RequestBody MediaLibrary.Meta meta) {
        media.update(MediaLibrary.Target.SITE, MediaLibrary.SITE_LIBRARY, id, meta);
        audit("cms.media.updated", "site_media", id.toString());
        return library();
    }

    @PostMapping({BASE + "/media/{id}/{action:approve|unapprove}", "/api/v1/staff/cms/media/{id}/{action:approve|unapprove}"})
    @PreAuthorize("@access.has('cms.publish')")
    @Transactional
    List<Map<String, Object>> imageAction(@PathVariable UUID id, @PathVariable String action) {
        if ("approve".equals(action)) media.approve(MediaLibrary.Target.SITE, MediaLibrary.SITE_LIBRARY, id, me());
        else media.unapprove(MediaLibrary.Target.SITE, MediaLibrary.SITE_LIBRARY, id);
        audit("cms.media." + action, "site_media", id.toString());
        return library();
    }

    @DeleteMapping({BASE + "/media/{id}", "/api/v1/staff/cms/media/{id}"})
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    ResponseEntity<Void> deleteImage(@PathVariable UUID id) {
        int used = jdbc.sql("SELECT count(*) FROM site_blocks WHERE coalesce(draft_json, '') LIKE :p OR coalesce(published_json, '') LIKE :p")
                .param("p", "%" + id + "%").query(Integer.class).single()
                + jdbc.sql("SELECT count(*) FROM associations WHERE logo_media_id = :id").param("id", id).query(Integer.class).single()
                + jdbc.sql("SELECT count(*) FROM articles WHERE cover_media_id = :id").param("id", id).query(Integer.class).single();
        if (used > 0) throw new ApiException(HttpStatus.CONFLICT, "in_use", "This image is used on the website; replace it first");
        media.delete(MediaLibrary.Target.SITE, MediaLibrary.SITE_LIBRARY, id);
        audit("cms.media.deleted", "site_media", id.toString());
        return ResponseEntity.noContent().build();
    }

    @GetMapping({BASE + "/media/{id}/file", "/api/v1/staff/cms/media/{id}/file"})
    @PreAuthorize("@access.has('cms.manage')")
    ResponseEntity<byte[]> imageFile(@PathVariable UUID id) {
        Object[] f = media.original(MediaLibrary.Target.SITE, MediaLibrary.SITE_LIBRARY, id);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType((String) f[1]))
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store").header("X-Content-Type-Options", "nosniff").body((byte[]) f[0]);
    }

    // ======================= staff: associations =======================

    record AssociationBody(String name, String relationship, String websiteUrl, UUID logoMediaId, boolean relationshipConfirmed,
                           String relationshipNote, boolean logoPermission, String logoPermissionNote, Short sortOrder) {}

    static final Set<String> RELATIONSHIPS = Set.of("developer_partner", "channel_partner", "banking_partner", "industry_body", "other");

    @GetMapping({BASE + "/associations", "/api/v1/staff/cms/associations"})
    @PreAuthorize("@access.has('cms.manage')")
    List<Map<String, Object>> associations() {
        return jdbc.sql("""
                SELECT id, name, relationship, website_url, logo_media_id, relationship_confirmed_at, relationship_note, logo_permission_at,
                       logo_permission_note, status, sort_order FROM associations ORDER BY sort_order, name""")
                .query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getObject("id", UUID.class)); m.put("name", rs.getString("name")); m.put("relationship", rs.getString("relationship"));
                    m.put("websiteUrl", rs.getString("website_url")); m.put("logoMediaId", rs.getObject("logo_media_id", UUID.class));
                    m.put("relationshipConfirmedAt", rs.getObject("relationship_confirmed_at", OffsetDateTime.class));
                    m.put("relationshipNote", rs.getString("relationship_note"));
                    m.put("logoPermissionAt", rs.getObject("logo_permission_at", OffsetDateTime.class));
                    m.put("logoPermissionNote", rs.getString("logo_permission_note")); m.put("status", rs.getString("status"));
                    m.put("sortOrder", rs.getInt("sort_order"));
                    return m;
                }).list();
    }

    @PostMapping({BASE + "/associations", "/api/v1/staff/cms/associations"})
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    List<Map<String, Object>> addAssociation(@RequestBody AssociationBody b) {
        validate(b);
        UUID id = jdbc.sql("INSERT INTO associations (name, relationship, updated_by) VALUES (:n, :r, :me) RETURNING id")
                .param("n", b.name().trim()).param("r", b.relationship()).param("me", me()).query(UUID.class).single();
        writeAssociation(id, b);
        audit("cms.association.created", "association", id.toString());
        return associations();
    }

    @PutMapping({BASE + "/associations/{id}", "/api/v1/staff/cms/associations/{id}"})
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    List<Map<String, Object>> updateAssociation(@PathVariable UUID id, @RequestBody AssociationBody b) {
        validate(b);
        writeAssociation(id, b);
        // an edit takes a published association back to draft until it is published again
        jdbc.sql("UPDATE associations SET status = CASE WHEN status = 'published' THEN 'draft' ELSE status END WHERE id = :id").param("id", id).update();
        audit("cms.association.updated", "association", id.toString());
        return associations();
    }

    @PostMapping({BASE + "/associations/{id}/{action:submit|publish|unpublish}", "/api/v1/staff/cms/associations/{id}/{action:submit|publish|unpublish}"})
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    List<Map<String, Object>> associationAction(@PathVariable UUID id, @PathVariable String action) {
        if (!"submit".equals(action) && !access.has("cms.publish")) throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Only the director can publish website content");
        String to = switch (action) { case "submit" -> "in_review"; case "publish" -> "published"; default -> "unpublished"; };
        Boolean ready = jdbc.sql("SELECT relationship_confirmed_at IS NOT NULL AND (logo_media_id IS NULL OR logo_permission_at IS NOT NULL) FROM associations WHERE id = :id")
                .param("id", id).query(Boolean.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Association not found"));
        if ("published".equals(to) && !ready) {
            throw new ApiException(HttpStatus.CONFLICT, "not_confirmed", "Record the confirmed relationship (and the logo permission, if a logo is set) before publishing");
        }
        jdbc.sql("UPDATE associations SET status = :s, updated_by = :me, updated_at = now() WHERE id = :id").param("s", to).param("me", me()).param("id", id).update();
        audit("cms.association." + action, "association", id.toString());
        return associations();
    }

    private void validate(AssociationBody b) {
        if (b == null || b.name() == null || b.name().isBlank() || b.name().length() > 150) throw SiteBlocks.bad("Name is required (max 150)");
        if (!RELATIONSHIPS.contains(b.relationship())) throw SiteBlocks.bad("Choose the type of relationship");
        if (b.websiteUrl() != null && !b.websiteUrl().isBlank() && !b.websiteUrl().matches("^https://\\S{4,290}$")) throw SiteBlocks.bad("Website must start with https://");
        if (b.relationshipConfirmed() && (b.relationshipNote() == null || b.relationshipNote().isBlank())) throw SiteBlocks.bad("Say how the relationship was confirmed");
        if (b.logoPermission() && (b.logoPermissionNote() == null || b.logoPermissionNote().isBlank())) throw SiteBlocks.bad("Say how logo permission was given");
        if (b.logoMediaId() != null) checkImage(b.logoMediaId().toString());
    }

    private void writeAssociation(UUID id, AssociationBody b) {
        jdbc.sql("""
                UPDATE associations SET name = :n, relationship = :r, website_url = :u, logo_media_id = :logo,
                       relationship_confirmed_at = CASE WHEN :rc THEN coalesce(relationship_confirmed_at, now()) END, relationship_note = :rn,
                       logo_permission_at = CASE WHEN :lp THEN coalesce(logo_permission_at, now()) END, logo_permission_note = :ln,
                       sort_order = coalesce(:so, sort_order), updated_by = :me, updated_at = now() WHERE id = :id""")
                .param("n", b.name().trim()).param("r", b.relationship()).param("u", blank(b.websiteUrl())).param("logo", b.logoMediaId())
                .param("rc", b.relationshipConfirmed()).param("rn", blank(b.relationshipNote())).param("lp", b.logoPermission())
                .param("ln", blank(b.logoPermissionNote())).param("so", b.sortOrder()).param("me", me()).param("id", id).update();
    }

    // ======================= public =======================

    /** Published website blocks for one language (hero, tiles, section order, careers, SEO overrides). */
    @GetMapping("/api/v1/public/site-blocks")
    ResponseEntity<Map<String, Object>> publicBlocks(@RequestParam(defaultValue = "en") String lang) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic()).body(render(lang, false));
    }

    /** Published associations whose relationship is confirmed; a logo only with recorded permission and an approved image. */
    @GetMapping("/api/v1/public/associations")
    ResponseEntity<List<Map<String, Object>>> publicAssociations() {
        List<Map<String, Object>> list = jdbc.sql("""
                SELECT a.name, a.relationship, a.website_url, m.storage_key, m.alt_en FROM associations a
                LEFT JOIN site_media m ON m.id = a.logo_media_id AND a.logo_permission_at IS NOT NULL AND m.approved_at IS NOT NULL AND m.is_public
                WHERE a.status = 'published' AND a.relationship_confirmed_at IS NOT NULL ORDER BY a.sort_order, a.name""")
                .query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("name", rs.getString(1)); m.put("relationship", rs.getString(2)); m.put("websiteUrl", rs.getString(3));
                    String url = url(rs.getString(4));
                    m.put("logo", url == null ? null : Map.of("url", url, "alt", rs.getString(5) == null ? rs.getString(1) : rs.getString(5)));
                    return m;
                }).list();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(300)).cachePublic()).body(list);
    }

    // ======================= helpers =======================

    /** Builds the website view of the blocks: published content (or drafts for preview), images resolved. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> render(String lang, boolean draft) {
        String l = "hi".equals(lang) ? "hi" : "en";
        Map<String, Map<String, Object>> content = new LinkedHashMap<>();
        jdbc.sql("SELECT block_key, " + (draft ? "coalesce(draft_json, published_json)" : "published_json") + " FROM site_blocks").query((rs, n) -> {
            if (rs.getString(2) != null) content.put(rs.getString(1), parse(rs.getString(2)));
            return null;
        }).list();
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Object> hero = content.get("home.hero");
        if (hero != null) {
            Map<String, Object> h = new LinkedHashMap<>(pick(hero, l));
            h.put("image", image((String) hero.get("imageId"), l));
            out.put("hero", h);
        }
        Map<String, Object> tiles = content.get("home.tiles");
        if (tiles != null) {
            List<Map<String, Object>> items = new ArrayList<>();
            for (Map<String, Object> t : (List<Map<String, Object>>) tiles.get("items")) {
                Map<String, Object> m = new LinkedHashMap<>(pick(t, l));
                m.put("key", t.get("key")); m.put("visible", t.get("visible")); m.put("image", image((String) t.get("imageId"), l));
                items.add(m);
            }
            out.put("tiles", items);
        }
        if (content.containsKey("home.sections")) out.put("sections", content.get("home.sections"));
        Map<String, Object> careers = content.get("careers.page");
        if (careers != null) {
            Map<String, Object> c = new LinkedHashMap<>(pick(careers, l));
            c.put("openings", ((List<Map<String, Object>>) careers.get("openings")).stream().filter(j -> Boolean.TRUE.equals(j.get("active"))).toList());
            out.put("careers", c);
        }
        Map<String, Object> seo = new LinkedHashMap<>();
        content.forEach((k, v) -> { if (k.startsWith("seo.") && SiteBlocks.SEO_PAGES.containsKey(k.substring(4))) seo.put(SiteBlocks.SEO_PAGES.get(k.substring(4)), pick(v, l)); });
        out.put("seo", seo);
        return out;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> pick(Map<String, Object> block, String lang) {
        Object v = block.get(lang);
        if (v == null) v = block.get("en");
        return v == null ? Map.of() : (Map<String, Object>) v;
    }

    /** Approved, public image of the library, or null. Representative stock carries kind so the site labels it. */
    private Map<String, Object> image(String id, String lang) {
        if (id == null) return null;
        return jdbc.sql("""
                SELECT storage_key, CASE WHEN :l = 'hi' THEN coalesce(alt_hi, alt_en) ELSE alt_en END, kind, credit FROM site_media
                WHERE id = :id AND approved_at IS NOT NULL AND is_public""")
                .param("id", UUID.fromString(id)).param("l", lang)
                .query((rs, n) -> {
                    String url = url(rs.getString(1));
                    if (url == null) return null;
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("url", url); m.put("alt", rs.getString(2)); m.put("kind", rs.getString(3)); m.put("credit", rs.getString(4));
                    return m;
                }).optional().orElse(null);
    }

    /** Images referenced by a block must exist in the library (approval is checked again when the site renders). */
    @SuppressWarnings("unchecked")
    private void checkImages(Map<String, Object> block) {
        if (block == null) return;
        if (block.get("imageId") != null) checkImage((String) block.get("imageId"));
        if (block.get("items") instanceof List<?> items) for (Object it : items) {
            Object img = ((Map<String, Object>) it).get("imageId");
            if (img != null) checkImage((String) img);
        }
    }

    private void checkImage(String id) {
        int n = jdbc.sql("SELECT count(*) FROM site_media WHERE id = :id").param("id", UUID.fromString(id)).query(Integer.class).single();
        if (n == 0) throw SiteBlocks.bad("Unknown image");
    }

    private String url(String key) { return key == null || mediaBase.isEmpty() ? null : mediaBase + "/" + key; }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> parse(String json) {
        return json == null ? null : SiteBlocks.JSON.readValue(json, Map.class);
    }

    private static void requireKey(String key) {
        if (key == null || !SiteBlocks.validKey(key)) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Unknown block");
    }

    private List<Map<String, Object>> history(String type, String id) {
        return jdbc.sql("""
                SELECT a.action, a.occurred_at, u.full_name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
                WHERE a.entity_type = :t AND a.entity_id = :id ORDER BY a.occurred_at DESC LIMIT 30""")
                .param("t", type).param("id", id).query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("action", rs.getString(1)); m.put("at", rs.getObject(2, OffsetDateTime.class)); m.put("by", rs.getString(3));
                    return m;
                }).list();
    }

    private void audit(String action, String type, String id) {
        jdbc.sql("INSERT INTO audit_logs (actor_user_id, actor_label, action, entity_type, entity_id) VALUES (:me, 'staff', :a, :t, :id)")
                .param("me", me()).param("a", action).param("t", type).param("id", id).update();
    }

    private UUID me() {
        return access.currentUserId().orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Not permitted"));
    }

    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
