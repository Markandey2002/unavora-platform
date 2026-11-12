package com.unavora.content.internal;

import com.unavora.identity.AccessService;
import com.unavora.platform.ApiException;
import com.unavora.platform.PublicVisibility;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Illustrative showcase items (V18). Representative examples of property STYLES used while real inventory is small.
 * They carry no price, area, possession, RERA, developer, address or availability (the table has no such columns),
 * are always labelled "Illustrative example" on the website, never appear in property/project search, and are never
 * converted into a property. Optionally linked to a PUBLISHED real property/project, whose page the CTA then opens.
 * Workflow as the rest of the CMS: cms.manage creates/edits/submits; cms.publish (director) publishes, unpublishes,
 * archives. An edit by someone without cms.publish takes a published item back to draft (off the site) until the
 * director publishes it again; a director's own edit stays live. Everything audited.
 */
@RestController
class ShowcaseController {
    private static final String BASE = "/internal/v1/staff/cms/showcase";
    private static final String API = "/api/v1/staff/cms/showcase";
    static final Set<String> CATEGORIES = Set.of("residential", "villa", "commercial", "office", "land", "project_style");
    static final Set<String> CTAS = Set.of("enquire", "register_interest", "browse", "view_record");

    private final JdbcClient jdbc;
    private final AccessService access;
    private final PublicVisibility visibility;
    private final String mediaBase;

    ShowcaseController(JdbcClient jdbc, AccessService access, PublicVisibility visibility,
                       @Value("${unavora.media.public-base-url:}") String mediaBase) {
        this.jdbc = jdbc;
        this.access = access;
        this.visibility = visibility;
        this.mediaBase = mediaBase == null ? "" : mediaBase.replaceAll("/+$", "");
    }

    record Body(String category, String titleEn, String titleHi, String descriptionEn, String descriptionHi, UUID imageMediaId,
                String cta, UUID linkedPropertyId, UUID linkedProjectId, Short sortOrder) {}

    // ======================= staff =======================

    @GetMapping({BASE, API})
    @PreAuthorize("@access.has('cms.manage')")
    List<Map<String, Object>> list() {
        return jdbc.sql(STAFF_SELECT + " ORDER BY (s.status = 'archived'), s.sort_order, s.created_at").query((rs, n) -> staffRow(rs)).list();
    }

    @GetMapping({BASE + "/{id}", API + "/{id}"})
    @PreAuthorize("@access.has('cms.manage')")
    Map<String, Object> one(@PathVariable UUID id) {
        Map<String, Object> m = jdbc.sql(STAFF_SELECT + " WHERE s.id = :id").param("id", id).query((rs, n) -> staffRow(rs)).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Showcase item not found"));
        m.put("history", jdbc.sql("""
                SELECT a.action, a.occurred_at, u.full_name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
                WHERE a.entity_type = 'showcase_item' AND a.entity_id = :id ORDER BY a.occurred_at DESC LIMIT 30""")
                .param("id", id.toString()).query((rs, n) -> Map.of("action", rs.getString(1), "at", rs.getObject(2, OffsetDateTime.class),
                        "by", rs.getString(3) == null ? "" : rs.getString(3))).list());
        m.put("canPublish", access.has("cms.publish"));
        return m;
    }

    @PostMapping({BASE, API})
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    ResponseEntity<Map<String, Object>> create(@RequestBody Body b) {
        validate(b);
        UUID id = jdbc.sql("INSERT INTO showcase_items (category, title_en, description_en, created_by, updated_by) VALUES (:c, :t, :d, :me, :me) RETURNING id")
                .param("c", b.category()).param("t", b.titleEn().trim()).param("d", b.descriptionEn().trim()).param("me", me())
                .query(UUID.class).single();
        write(id, b);
        audit("cms.showcase.created", id);
        return ResponseEntity.status(HttpStatus.CREATED).body(one(id));
    }

    @PutMapping({BASE + "/{id}", API + "/{id}"})
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    Map<String, Object> update(@PathVariable UUID id, @RequestBody Body b) {
        String status = status(id);
        if ("archived".equals(status)) throw new ApiException(HttpStatus.CONFLICT, "archived", "Archived items cannot be edited");
        validate(b);
        write(id, b);
        if ("published".equals(status)) {
            if (access.has("cms.publish")) checkPublishable(id);   // a director's edit stays live, so it must still qualify
            else jdbc.sql("UPDATE showcase_items SET status = 'draft' WHERE id = :id").param("id", id).update();
        } else if ("in_review".equals(status) || "unpublished".equals(status)) {
            jdbc.sql("UPDATE showcase_items SET status = 'draft' WHERE id = :id").param("id", id).update();
        }
        audit("cms.showcase.updated", id);
        return one(id);
    }

    @PostMapping({BASE + "/{id}/{action:submit|publish|unpublish|archive}", API + "/{id}/{action:submit|publish|unpublish|archive}"})
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    Map<String, Object> action(@PathVariable UUID id, @PathVariable String action) {
        if (!"submit".equals(action) && !access.has("cms.publish")) {
            throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Only the director can publish, unpublish or archive website content");
        }
        String status = status(id);
        switch (action) {
            case "submit" -> {
                if (!"draft".equals(status) && !"unpublished".equals(status)) throw new ApiException(HttpStatus.CONFLICT, "not_draft", "Only a draft can be submitted");
                jdbc.sql("UPDATE showcase_items SET status = 'in_review', submitted_by = :me, submitted_at = now() WHERE id = :id").param("me", me()).param("id", id).update();
            }
            case "publish" -> {
                if ("archived".equals(status)) throw new ApiException(HttpStatus.CONFLICT, "archived", "Archived items cannot be published");
                checkPublishable(id);
                jdbc.sql("UPDATE showcase_items SET status = 'published', published_by = :me, published_at = now() WHERE id = :id").param("me", me()).param("id", id).update();
            }
            case "unpublish" -> jdbc.sql("UPDATE showcase_items SET status = 'unpublished' WHERE id = :id").param("id", id).update();
            default -> jdbc.sql("UPDATE showcase_items SET status = 'archived' WHERE id = :id").param("id", id).update();
        }
        jdbc.sql("UPDATE showcase_items SET updated_by = :me, updated_at = now() WHERE id = :id").param("me", me()).param("id", id).update();
        audit("cms.showcase." + action, id);
        return one(id);
    }

    // ======================= public =======================

    /** Published showcase items with an approved public image. No price or property facts exist to return. */
    @GetMapping("/api/v1/public/showcase")
    ResponseEntity<List<Map<String, Object>>> published(@RequestParam(defaultValue = "en") String lang, @RequestParam(required = false) String category) {
        String l = "hi".equals(lang) ? "hi" : "en";
        if (category != null && !CATEGORIES.contains(category)) category = null;
        List<Map<String, Object>> items = jdbc.sql("""
                SELECT s.id, s.category, CASE WHEN :l = 'hi' THEN coalesce(s.title_hi, s.title_en) ELSE s.title_en END,
                       CASE WHEN :l = 'hi' THEN coalesce(s.description_hi, s.description_en) ELSE s.description_en END, s.cta,
                       m.storage_key, CASE WHEN :l = 'hi' THEN coalesce(m.alt_hi, m.alt_en) ELSE m.alt_en END, m.kind, m.credit,
                       (SELECT t.slug FROM properties p JOIN property_translations t ON t.property_id = p.id AND t.language = :l
                         WHERE p.id = s.linked_property_id AND p.status = 'published' AND p.availability IN ('available','under_offer')""" + visibility.samples("p") + """
                        LIMIT 1),
                       (SELECT t.slug FROM projects p JOIN project_translations t ON t.project_id = p.id AND t.language = :l
                         WHERE p.id = s.linked_project_id AND p.status = 'published'""" + visibility.samples("p") + """
                        LIMIT 1)
                FROM showcase_items s JOIN site_media m ON m.id = s.image_media_id AND m.approved_at IS NOT NULL AND m.is_public
                WHERE s.status = 'published' AND (CAST(:cat AS varchar) IS NULL OR s.category = :cat)""" + visibility.samples("s") + " ORDER BY s.sort_order, s.published_at")
                .param("l", l).param("cat", category)
                .query((rs, n) -> {
                    String url = url(rs.getString(6));
                    if (url == null) return null;
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getObject(1, UUID.class));
                    m.put("category", rs.getString(2));
                    m.put("title", rs.getString(3));
                    m.put("description", rs.getString(4));
                    m.put("illustrative", true);
                    m.put("image", Map.of("url", url, "alt", rs.getString(7) == null ? rs.getString(3) : rs.getString(7),
                            "kind", rs.getString(8), "credit", rs.getString(9) == null ? "" : rs.getString(9)));
                    String propertySlug = rs.getString(10), projectSlug = rs.getString(11);
                    String cta = rs.getString(5);
                    Map<String, Object> link = propertySlug != null ? Map.of("type", "property", "slug", propertySlug)
                            : projectSlug != null ? Map.of("type", "project", "slug", projectSlug) : null;
                    if ("view_record".equals(cta) && link == null) cta = "enquire";   // the real record went offline
                    m.put("cta", cta);
                    m.put("link", link);
                    return m;
                }).list().stream().filter(java.util.Objects::nonNull).toList();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic()).body(items);
    }

    // ======================= helpers =======================

    private static final String STAFF_SELECT = """
            SELECT s.id, s.category, s.title_en, s.title_hi, s.description_en, s.description_hi, s.image_media_id, s.cta,
                   s.linked_property_id, s.linked_project_id, s.sort_order, s.status, s.published_at, s.updated_at,
                   s.is_sample, m.storage_key, m.kind, m.approved_at IS NOT NULL AND m.is_public AS image_ok
            FROM showcase_items s LEFT JOIN site_media m ON m.id = s.image_media_id""";

    private Map<String, Object> staffRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", rs.getObject("id", UUID.class)); m.put("category", rs.getString("category"));
        m.put("titleEn", rs.getString("title_en")); m.put("titleHi", rs.getString("title_hi"));
        m.put("descriptionEn", rs.getString("description_en")); m.put("descriptionHi", rs.getString("description_hi"));
        m.put("imageMediaId", rs.getObject("image_media_id", UUID.class)); m.put("cta", rs.getString("cta"));
        m.put("linkedPropertyId", rs.getObject("linked_property_id", UUID.class)); m.put("linkedProjectId", rs.getObject("linked_project_id", UUID.class));
        m.put("sortOrder", rs.getInt("sort_order")); m.put("status", rs.getString("status"));
        m.put("publishedAt", rs.getObject("published_at", OffsetDateTime.class)); m.put("updatedAt", rs.getObject("updated_at", OffsetDateTime.class));
        m.put("imageUrl", rs.getBoolean("image_ok") ? url(rs.getString("storage_key")) : null);
        m.put("imageKind", rs.getString("kind")); m.put("imageApproved", rs.getBoolean("image_ok"));
        m.put("sample", rs.getBoolean("is_sample"));
        return m;
    }

    private void validate(Body b) {
        if (b == null || !CATEGORIES.contains(b.category())) throw SiteBlocks.bad("Choose a category");
        text(b.titleEn(), "Title (English)", 90, true);
        text(b.titleHi(), "Title (Hindi)", 90, false);
        text(b.descriptionEn(), "Description (English)", 300, true);
        text(b.descriptionHi(), "Description (Hindi)", 300, false);
        String cta = b.cta() == null ? "enquire" : b.cta();
        if (!CTAS.contains(cta)) throw SiteBlocks.bad("Choose a call to action");
        if (b.linkedPropertyId() != null && b.linkedProjectId() != null) throw SiteBlocks.bad("Link either a property or a project, not both");
        if ("view_record".equals(cta) && b.linkedPropertyId() == null && b.linkedProjectId() == null) throw SiteBlocks.bad("Link a published property or project for this call to action");
        if (b.imageMediaId() != null && jdbc.sql("SELECT count(*) FROM site_media WHERE id = :id").param("id", b.imageMediaId()).query(Integer.class).single() == 0) {
            throw SiteBlocks.bad("Unknown image");
        }
        if (b.linkedPropertyId() != null && jdbc.sql("SELECT count(*) FROM properties WHERE id = :id").param("id", b.linkedPropertyId()).query(Integer.class).single() == 0) {
            throw SiteBlocks.bad("Unknown property");
        }
        if (b.linkedProjectId() != null && jdbc.sql("SELECT count(*) FROM projects WHERE id = :id").param("id", b.linkedProjectId()).query(Integer.class).single() == 0) {
            throw SiteBlocks.bad("Unknown project");
        }
    }

    private static void text(String v, String name, int max, boolean required) {
        if (v == null || v.isBlank()) { if (required) throw SiteBlocks.bad(name + " is required"); return; }
        if (v.trim().length() > max) throw SiteBlocks.bad(name + " is too long (max " + max + ")");
        if (v.contains("<") || v.contains(">")) throw SiteBlocks.bad(name + " must be plain text");
    }

    private void write(UUID id, Body b) {
        jdbc.sql("""
                UPDATE showcase_items SET category = :c, title_en = :ten, title_hi = :thi, description_en = :den, description_hi = :dhi,
                       image_media_id = :img, cta = :cta, linked_property_id = :prop, linked_project_id = :proj,
                       sort_order = coalesce(:so, sort_order), updated_by = :me, updated_at = now() WHERE id = :id""")
                .param("c", b.category()).param("ten", b.titleEn().trim()).param("thi", blank(b.titleHi()))
                .param("den", b.descriptionEn().trim()).param("dhi", blank(b.descriptionHi())).param("img", b.imageMediaId())
                .param("cta", b.cta() == null ? "enquire" : b.cta()).param("prop", b.linkedPropertyId()).param("proj", b.linkedProjectId())
                .param("so", b.sortOrder()).param("me", me()).param("id", id).update();
    }

    /** Publishable: approved public image; a linked record must itself be published and public. */
    private void checkPublishable(UUID id) {
        Object[] r = jdbc.sql("""
                SELECT (SELECT approved_at IS NOT NULL AND is_public FROM site_media WHERE id = s.image_media_id),
                       s.linked_property_id IS NULL OR EXISTS (SELECT 1 FROM properties p WHERE p.id = s.linked_property_id AND p.status = 'published'""" + visibility.samples("p") + """
                       ),
                       s.linked_project_id IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = s.linked_project_id AND p.status = 'published'""" + visibility.samples("p") + """
                       )
                FROM showcase_items s WHERE s.id = :id""").param("id", id)
                .query((rs, n) -> new Object[]{rs.getObject(1), rs.getBoolean(2), rs.getBoolean(3)}).single();
        if (!Boolean.TRUE.equals(r[0])) throw new ApiException(HttpStatus.CONFLICT, "image_not_approved", "Choose an approved image from the library before publishing");
        if (!(Boolean) r[1] || !(Boolean) r[2]) throw new ApiException(HttpStatus.CONFLICT, "link_not_published", "The linked property or project is not published");
    }

    private String status(UUID id) {
        return jdbc.sql("SELECT status FROM showcase_items WHERE id = :id").param("id", id).query(String.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Showcase item not found"));
    }

    private String url(String key) { return key == null || mediaBase.isEmpty() ? null : mediaBase + "/" + key; }

    private void audit(String action, UUID id) {
        jdbc.sql("INSERT INTO audit_logs (actor_user_id, actor_label, action, entity_type, entity_id) VALUES (:me, 'staff', :a, 'showcase_item', :id)")
                .param("me", me()).param("a", action).param("id", id.toString()).update();
    }

    private UUID me() {
        return access.currentUserId().orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Not permitted"));
    }

    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
