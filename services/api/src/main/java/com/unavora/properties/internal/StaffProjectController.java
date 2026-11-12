package com.unavora.properties.internal;

import com.unavora.identity.AccessService;
import com.unavora.platform.ApiException;
import com.unavora.platform.MediaLibrary;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
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

/**
 * Projects / new launches in the CRM. Reads: property.read_all. All changes: property.publish (director).
 * Each public fact has its own approval switch: developer_verified, price_public, possession_public and RERA
 * verification (rera_verified_at). Publishing needs a locality, a category and an English description.
 */
@RestController
class StaffProjectController {
    static final Set<String> STATUSES = Set.of("planned", "under_construction", "ready_to_move", "completed");
    static final Set<String> CATEGORIES = Set.of("residential", "commercial", "mixed_use", "land");

    private final JdbcClient jdbc;
    private final AccessService access;
    private final MediaLibrary media;

    StaffProjectController(JdbcClient jdbc, AccessService access, MediaLibrary media) {
        this.jdbc = jdbc;
        this.access = access;
        this.media = media;
    }

    record Translation(String name, String slug, String description) {}

    record Unit(String label, Short bedrooms, BigDecimal areaValue, String areaUnit, BigDecimal basePrice) {}

    record ProjectBody(UUID localityId, String constructionStatus, LocalDate possessionDate, Boolean possessionPublic,
                       String developerName, Boolean developerVerified, String category, String primaryTypeCode,
                       String reraNumber, Boolean reraVerified, Boolean pricePublic, List<Unit> units, Translation en, Translation hi) {}

    @GetMapping({"/api/v1/staff/projects", "/internal/v1/staff/projects"})
    @PreAuthorize("@access.has('property.read_all')")
    List<Map<String, Object>> list() {
        return jdbc.sql("""
                SELECT p.id, p.public_number, p.status, p.construction_status, p.is_sample, p.updated_at, t.name, t.slug, l.city, l.name_en,
                       (SELECT count(*) FROM project_media m WHERE m.project_id = p.id AND m.approved_at IS NOT NULL) AS approved_photos
                FROM projects p LEFT JOIN project_translations t ON t.project_id = p.id AND t.language = 'en'
                LEFT JOIN localities l ON l.id = p.locality_id ORDER BY p.updated_at DESC LIMIT 200""")
                .query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getObject("id", UUID.class)); m.put("number", rs.getLong("public_number")); m.put("status", rs.getString("status"));
                    m.put("constructionStatus", rs.getString("construction_status")); m.put("sample", rs.getBoolean("is_sample"));
                    m.put("name", rs.getString("name")); m.put("slug", rs.getString("slug")); m.put("city", rs.getString("city"));
                    m.put("locality", rs.getString("name_en")); m.put("approvedPhotos", rs.getInt("approved_photos"));
                    m.put("updatedAt", rs.getObject("updated_at", OffsetDateTime.class));
                    return m;
                }).list();
    }

    @GetMapping({"/api/v1/staff/projects/{id}", "/internal/v1/staff/projects/{id}"})
    @PreAuthorize("@access.has('property.read_all')")
    Map<String, Object> detail(@PathVariable UUID id) {
        Map<String, Object> d = jdbc.sql("""
                SELECT p.*, pt.code AS type_code FROM projects p LEFT JOIN property_types pt ON pt.id = p.primary_type_id WHERE p.id = :id""")
                .param("id", id).query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", id); m.put("number", rs.getLong("public_number")); m.put("status", rs.getString("status"));
                    m.put("localityId", rs.getObject("locality_id", UUID.class)); m.put("constructionStatus", rs.getString("construction_status"));
                    m.put("possessionDate", rs.getObject("possession_date", LocalDate.class)); m.put("possessionPublic", rs.getBoolean("possession_public"));
                    m.put("developerName", rs.getString("developer_name")); m.put("developerVerified", rs.getBoolean("developer_verified"));
                    m.put("category", rs.getString("category")); m.put("primaryTypeCode", rs.getString("type_code"));
                    m.put("reraNumber", rs.getString("rera_registration_number")); m.put("reraVerified", rs.getObject("rera_verified_at") != null);
                    m.put("pricePublic", rs.getBoolean("price_public")); m.put("sample", rs.getBoolean("is_sample"));
                    m.put("publishedAt", rs.getObject("published_at", OffsetDateTime.class));
                    return m;
                }).optional().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Project not found"));
        for (String lang : new String[]{"en", "hi"}) {
            d.put(lang, jdbc.sql("SELECT name, slug, description FROM project_translations WHERE project_id = :id AND language = :l")
                    .param("id", id).param("l", lang).query((rs, n) -> new Translation(rs.getString(1), rs.getString(2), rs.getString(3))).optional().orElse(null));
        }
        d.put("units", jdbc.sql("SELECT label, bedrooms, area_value, area_unit, base_price FROM project_units WHERE project_id = :id ORDER BY base_price NULLS LAST, label")
                .param("id", id).query((rs, n) -> new Unit(rs.getString(1), rs.getObject(2, Short.class), rs.getBigDecimal(3), rs.getString(4), rs.getBigDecimal(5))).list());
        d.put("media", media.list(MediaLibrary.Target.PROJECT, id));
        d.put("canEdit", access.has("property.publish"));
        return d;
    }

    @PostMapping({"/api/v1/staff/projects", "/internal/v1/staff/projects"})
    @PreAuthorize("@access.has('property.publish')")
    @Transactional
    ResponseEntity<Map<String, Object>> create(@RequestBody ProjectBody b) {
        validate(b);
        UUID id = jdbc.sql("INSERT INTO projects (status, created_by) VALUES ('draft', :me) RETURNING id").param("me", me()).query(UUID.class).single();
        write(id, b);
        audit("project.created", id);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @PutMapping({"/api/v1/staff/projects/{id}", "/internal/v1/staff/projects/{id}"})
    @PreAuthorize("@access.has('property.publish')")
    @Transactional
    Map<String, Object> update(@PathVariable UUID id, @RequestBody ProjectBody b) {
        exists(id);
        validate(b);
        write(id, b);
        audit("project.updated", id);
        return detail(id);
    }

    @PostMapping({"/api/v1/staff/projects/{id}/{action:publish|unpublish|archive}", "/internal/v1/staff/projects/{id}/{action:publish|unpublish|archive}"})
    @PreAuthorize("@access.has('property.publish')")
    @Transactional
    Map<String, Object> status(@PathVariable UUID id, @PathVariable String action) {
        String from = exists(id);
        String to = switch (action) { case "publish" -> "published"; case "archive" -> "archived"; default -> "draft"; };
        if ("published".equals(to)) {
            var ok = jdbc.sql("""
                    SELECT p.locality_id IS NOT NULL AND p.category IS NOT NULL AND length(coalesce(t.description, '')) >= 40
                    FROM projects p JOIN project_translations t ON t.project_id = p.id AND t.language = 'en' WHERE p.id = :id""")
                    .param("id", id).query(Boolean.class).optional().orElse(false);
            if (!ok) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "incomplete", "Add a locality, a category and an English description (40+ characters) first");
        }
        jdbc.sql("UPDATE projects SET status = :s, published_at = CASE WHEN :s = 'published' THEN coalesce(published_at, now()) ELSE published_at END WHERE id = :id")
                .param("s", to).param("id", id).update();
        jdbc.sql("INSERT INTO listing_status_history (project_id, from_status, to_status, changed_by) VALUES (:id, :f, :t, :me)")
                .param("id", id).param("f", from).param("t", to).param("me", me()).update();
        audit("project.status." + to, id);
        return detail(id);
    }

    @PostMapping(value = {"/api/v1/staff/projects/{id}/media", "/internal/v1/staff/projects/{id}/media"}, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("@access.has('property.publish')")
    @Transactional
    ResponseEntity<Map<String, Object>> upload(@PathVariable UUID id, @RequestParam("file") MultipartFile file,
                                               @RequestParam(required = false) String kind, @RequestParam(required = false) String captionEn,
                                               @RequestParam(required = false) String captionHi, @RequestParam(required = false) String altEn,
                                               @RequestParam(required = false) String altHi, @RequestParam(required = false) String credit,
                                               @RequestParam(required = false) String licence) throws java.io.IOException {
        exists(id);
        UUID mid = media.upload(MediaLibrary.Target.PROJECT, id, file.getBytes(),
                new MediaLibrary.Meta(kind, captionEn, captionHi, altEn, altHi, credit, licence, null), me(), null);
        audit("project.media.uploaded", id);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", mid));
    }

    @PutMapping({"/api/v1/staff/projects/{id}/media/{mid}", "/internal/v1/staff/projects/{id}/media/{mid}"})
    @PreAuthorize("@access.has('property.publish')")
    @Transactional
    Map<String, Object> updateMedia(@PathVariable UUID id, @PathVariable UUID mid, @RequestBody MediaLibrary.Meta meta) {
        exists(id);
        media.update(MediaLibrary.Target.PROJECT, id, mid, meta);
        return detail(id);
    }

    @PostMapping({"/api/v1/staff/projects/{id}/media/{mid}/{action:approve|unapprove|primary}",
                  "/internal/v1/staff/projects/{id}/media/{mid}/{action:approve|unapprove|primary}"})
    @PreAuthorize("@access.has('property.publish')")
    @Transactional
    Map<String, Object> mediaAction(@PathVariable UUID id, @PathVariable UUID mid, @PathVariable String action) {
        exists(id);
        switch (action) {
            case "approve" -> media.approve(MediaLibrary.Target.PROJECT, id, mid, me());
            case "unapprove" -> media.unapprove(MediaLibrary.Target.PROJECT, id, mid);
            default -> media.primary(MediaLibrary.Target.PROJECT, id, mid);
        }
        audit("project.media." + action, id);
        return detail(id);
    }

    @DeleteMapping({"/api/v1/staff/projects/{id}/media/{mid}", "/internal/v1/staff/projects/{id}/media/{mid}"})
    @PreAuthorize("@access.has('property.publish')")
    @Transactional
    ResponseEntity<Void> deleteMedia(@PathVariable UUID id, @PathVariable UUID mid) {
        exists(id);
        media.delete(MediaLibrary.Target.PROJECT, id, mid);
        audit("project.media.deleted", id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping({"/api/v1/staff/projects/{id}/media/{mid}/file", "/internal/v1/staff/projects/{id}/media/{mid}/file"})
    @PreAuthorize("@access.has('property.read_all')")
    ResponseEntity<byte[]> mediaFile(@PathVariable UUID id, @PathVariable UUID mid) {
        exists(id);
        Object[] f = media.original(MediaLibrary.Target.PROJECT, id, mid);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType((String) f[1]))
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store").header("X-Content-Type-Options", "nosniff").body((byte[]) f[0]);
    }

    private void validate(ProjectBody b) {
        if (b == null || b.en() == null || b.en().name() == null || b.en().name().isBlank() || b.en().name().length() > 200) throw bad("English project name is required (max 200)");
        if (b.en().slug() == null || !b.en().slug().matches("[a-z0-9]+(-[a-z0-9]+)*") || b.en().slug().length() > 200) throw bad("URL slug: lowercase letters, numbers and hyphens");
        if (b.hi() != null && b.hi().name() != null && !b.hi().name().isBlank() && (b.hi().slug() == null || !b.hi().slug().matches("[a-z0-9]+(-[a-z0-9]+)*"))) throw bad("Hindi URL slug: lowercase letters, numbers and hyphens");
        if (b.constructionStatus() != null && !b.constructionStatus().isBlank() && !STATUSES.contains(b.constructionStatus())) throw bad("Unknown construction status");
        if (b.category() != null && !b.category().isBlank() && !CATEGORIES.contains(b.category())) throw bad("Unknown category");
        if (Boolean.TRUE.equals(b.possessionPublic()) && b.possessionDate() == null) throw bad("A possession date is needed before it can be shown");
        if (Boolean.TRUE.equals(b.developerVerified()) && (b.developerName() == null || b.developerName().isBlank())) throw bad("Enter the developer before marking it verified");
        if (Boolean.TRUE.equals(b.reraVerified()) && (b.reraNumber() == null || b.reraNumber().isBlank())) throw bad("Enter the RERA number before marking it verified");
        if (b.units() != null) for (Unit u : b.units()) {
            if (u.label() == null || u.label().isBlank() || u.label().length() > 100) throw bad("Every unit needs a label");
            if (u.basePrice() != null && u.basePrice().signum() <= 0) throw bad("Unit prices must be positive");
            if (u.areaUnit() != null && !u.areaUnit().isBlank() && !Set.of("sq_ft", "sq_yd", "sq_m", "acre").contains(u.areaUnit())) throw bad("Unknown area unit");
        }
    }

    private void write(UUID id, ProjectBody b) {
        jdbc.sql("""
                UPDATE projects SET locality_id = :loc, construction_status = :cs, possession_date = :pd, possession_public = :pp,
                       developer_name = :dev, developer_verified = :dv, category = :cat,
                       primary_type_id = (SELECT id FROM property_types WHERE code = :type), rera_registration_number = :rera,
                       rera_verified_at = CASE WHEN :rv THEN coalesce(rera_verified_at, now()) END, price_public = :price
                WHERE id = :id""")
                .param("loc", b.localityId()).param("cs", blank(b.constructionStatus())).param("pd", b.possessionDate())
                .param("pp", Boolean.TRUE.equals(b.possessionPublic())).param("dev", blank(b.developerName()))
                .param("dv", Boolean.TRUE.equals(b.developerVerified())).param("cat", blank(b.category())).param("type", blank(b.primaryTypeCode()))
                .param("rera", blank(b.reraNumber())).param("rv", Boolean.TRUE.equals(b.reraVerified())).param("price", Boolean.TRUE.equals(b.pricePublic()))
                .param("id", id).update();
        try {
            upsert(id, "en", b.en());
            if (b.hi() != null && b.hi().name() != null && !b.hi().name().isBlank()) upsert(id, "hi", b.hi());
            else jdbc.sql("DELETE FROM project_translations WHERE project_id = :id AND language = 'hi'").param("id", id).update();
        } catch (DuplicateKeyException e) {
            throw new ApiException(HttpStatus.CONFLICT, "slug_taken", "This URL slug is already used by another project");
        }
        if (b.units() != null) {
            jdbc.sql("DELETE FROM project_units WHERE project_id = :id").param("id", id).update();
            for (Unit u : b.units()) {
                jdbc.sql("INSERT INTO project_units (project_id, label, bedrooms, area_value, area_unit, base_price) VALUES (:id, :l, :b, :a, :u, :p)")
                        .param("id", id).param("l", u.label().trim()).param("b", u.bedrooms()).param("a", u.areaValue())
                        .param("u", blank(u.areaUnit())).param("p", u.basePrice()).update();
            }
        }
    }

    private void upsert(UUID id, String lang, Translation t) {
        jdbc.sql("""
                INSERT INTO project_translations (project_id, language, name, slug, description) VALUES (:id, :l, :n, :s, :d)
                ON CONFLICT (project_id, language) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, description = EXCLUDED.description""")
                .param("id", id).param("l", lang).param("n", t.name().trim()).param("s", t.slug()).param("d", blank(t.description())).update();
    }

    private String exists(UUID id) {
        return jdbc.sql("SELECT status FROM projects WHERE id = :id").param("id", id).query(String.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Project not found"));
    }

    private void audit(String action, UUID id) {
        jdbc.sql("INSERT INTO audit_logs (actor_user_id, actor_label, action, entity_type, entity_id) VALUES (:me, 'staff', :a, 'project', :id)")
                .param("me", me()).param("a", action).param("id", id.toString()).update();
    }

    private UUID me() {
        return access.currentUserId().orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Not permitted"));
    }

    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }

    private static ApiException bad(String msg) { return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validation_failed", msg); }
}
