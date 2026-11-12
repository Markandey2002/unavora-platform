package com.unavora.properties.internal;

import com.unavora.platform.ApiException;
import com.unavora.platform.PublicVisibility;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public, read-only projects ("new launches"). Only published, non-sample projects are returned (samples only where
 * the deployment allows them). Each fact is shown only when the business approved it: the developer only when
 * verified, the starting/unit prices only when price_public, possession only when possession_public (and dated), the
 * RERA number only when rera_verified_at is set, images only when public, scanned and approved. Nothing is guessed.
 */
@RestController
@RequestMapping("/api/v1/public")
class PublicProjectController {
    private final JdbcClient jdbc;
    private final PublicVisibility visibility;
    private final String mediaBase;

    PublicProjectController(JdbcClient jdbc, PublicVisibility visibility, @Value("${unavora.media.public-base-url:}") String mediaBase) {
        this.jdbc = jdbc;
        this.visibility = visibility;
        this.mediaBase = mediaBase == null ? "" : mediaBase.replaceAll("/+$", "");
    }

    static final Set<String> STATUSES = Set.of("planned", "under_construction", "ready_to_move", "completed");
    static final Set<String> CATEGORIES = Set.of("residential", "commercial", "mixed_use", "land");

    record ProjectSummary(UUID id, long number, String name, String slug, String city, String locality,
                          String constructionStatus, LocalDate possessionDate, BigDecimal startingPrice,
                          int unitTypes, String reraNumber, String language, String developerName,
                          String category, String typeCode, String typeName, String coverImage, String coverAlt,
                          OffsetDateTime publishedAt, boolean sample, String coverKind) {}

    record ProjectPage(List<ProjectSummary> items, int total) {}

    record ProjectUnit(String label, Short bedrooms, BigDecimal areaValue, String areaUnit, BigDecimal basePrice) {}

    /** kind: actual_photo | render | floor_plan (stock never belongs to a project). */
    record Media(String url, String alt, String caption, String kind, boolean primary) {}

    /** Projects have no private coordinates: only the locality's approximate position, when staff recorded one. */
    record MapPoint(BigDecimal latitude, BigDecimal longitude, String precision) {}

    record ProjectDetail(ProjectSummary summary, String description, List<ProjectUnit> units, List<Media> images, List<Media> floorPlans, MapPoint map,
                         Map<String, String> slugs) {}

    private static final String SELECT = """
            SELECT p.id, p.public_number, t.name, t.slug, t.language, l.city, p.published_at, p.is_sample,
                   CASE WHEN t.language = 'hi' THEN coalesce(l.name_hi, l.name_en) ELSE l.name_en END AS locality,
                   p.construction_status,
                   CASE WHEN p.possession_public THEN p.possession_date END AS possession_date,
                   CASE WHEN p.price_public THEN (SELECT min(u.base_price) FROM project_units u WHERE u.project_id = p.id) END AS starting_price,
                   (SELECT count(*) FROM project_units u WHERE u.project_id = p.id) AS unit_types,
                   CASE WHEN p.rera_verified_at IS NOT NULL THEN p.rera_registration_number END AS rera,
                   CASE WHEN p.developer_verified THEN p.developer_name END AS developer_name,
                   p.category, pt.code AS type_code,
                   CASE WHEN t.language = 'hi' THEN coalesce(pt.name_hi, pt.name_en) ELSE pt.name_en END AS type_name,
                   cover.storage_key AS cover_key, cover.kind AS cover_kind,
                   CASE WHEN t.language = 'hi' THEN coalesce(cover.alt_hi, cover.alt_en) ELSE cover.alt_en END AS cover_alt
            FROM projects p
            JOIN project_translations t ON t.project_id = p.id
            LEFT JOIN localities l ON l.id = p.locality_id
            LEFT JOIN property_types pt ON pt.id = p.primary_type_id
            LEFT JOIN LATERAL (
                SELECT m.storage_key, m.alt_en, m.alt_hi, m.kind FROM project_media m
                WHERE m.project_id = p.id AND m.media_type = 'image' AND m.is_public AND m.processing_status = 'ready'
                  AND m.approved_at IS NOT NULL
                ORDER BY m.is_primary DESC, m.sort_order, m.created_at LIMIT 1) cover ON true
            WHERE p.status = 'published' AND t.language = :lang
            """;

    private String mediaUrl(String key) { return key == null || mediaBase.isEmpty() ? null : mediaBase + "/" + key; }

    private ProjectSummary map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        String cover = mediaUrl(rs.getString("cover_key"));
        return new ProjectSummary(rs.getObject("id", UUID.class), rs.getLong("public_number"), rs.getString("name"),
                rs.getString("slug"), rs.getString("city"), rs.getString("locality"), rs.getString("construction_status"),
                rs.getObject("possession_date", LocalDate.class), rs.getBigDecimal("starting_price"),
                rs.getInt("unit_types"), rs.getString("rera"), rs.getString("language"), rs.getString("developer_name"),
                rs.getString("category"), rs.getString("type_code"), rs.getString("type_name"),
                cover, cover == null ? null : rs.getString("cover_alt"), rs.getObject("published_at", OffsetDateTime.class), rs.getBoolean("is_sample"),
                cover == null ? null : rs.getString("cover_kind"));
    }

    /**
     * New launches, newest first. q matches the project name, a verified developer, the locality or the city.
     * Paged by offset (limit max 24); total is the number of matching projects.
     */
    @GetMapping("/projects")
    ResponseEntity<ProjectPage> list(@RequestParam(defaultValue = "en") String lang,
                                     @RequestParam(required = false) String status,
                                     @RequestParam(required = false) String category,
                                     @RequestParam(required = false) String type,
                                     @RequestParam(required = false) String city,
                                     @RequestParam(required = false) String q,
                                     @RequestParam(required = false) Integer limit,
                                     @RequestParam(required = false) Integer offset) {
        StringBuilder where = new StringBuilder(visibility.samples("p"));
        Map<String, Object> params = new HashMap<>();
        params.put("lang", language(lang));
        if (status != null && !status.isBlank()) {
            if (!STATUSES.contains(status)) throw new ApiException(HttpStatus.BAD_REQUEST, "bad_status", "Unknown project status");
            where.append(" AND p.construction_status = :status"); params.put("status", status);
        }
        if (category != null && !category.isBlank()) {
            if (!CATEGORIES.contains(category)) throw new ApiException(HttpStatus.BAD_REQUEST, "bad_category", "Unknown project category");
            where.append(" AND p.category = :category"); params.put("category", category);
        }
        if (type != null && !type.isBlank()) {
            if (!type.matches("[a-z_]{2,50}")) throw new ApiException(HttpStatus.BAD_REQUEST, "bad_type", "Unknown property type");
            where.append(" AND pt.code = :type"); params.put("type", type);
        }
        if (city != null && !city.isBlank()) { where.append(" AND lower(l.city) = lower(:city)"); params.put("city", city.trim()); }
        if (q != null && !q.isBlank()) {
            if (q.length() > 80) throw new ApiException(HttpStatus.BAD_REQUEST, "bad_query", "Search text is too long");
            where.append(" AND (t.name ILIKE :like OR (p.developer_verified AND p.developer_name ILIKE :like)"
                    + " OR l.name_en ILIKE :like OR coalesce(l.name_hi, '') ILIKE :like OR l.city ILIKE :like)");
            params.put("like", "%" + q.trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        int lim = Math.max(1, Math.min(limit == null ? 12 : limit, 24));
        int off = Math.max(0, Math.min(offset == null ? 0 : offset, 10000));
        int total = jdbc.sql("SELECT count(*) FROM (" + SELECT + where + ") x").params(params).query(Integer.class).single();
        params.put("lim", lim);
        params.put("off", off);
        List<ProjectSummary> items = jdbc.sql(SELECT + where + " ORDER BY p.published_at DESC, p.id DESC LIMIT :lim OFFSET :off")
                .params(params).query(this::map).list();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic()).body(new ProjectPage(items, total));
    }

    @GetMapping("/projects/{slug}")
    ResponseEntity<ProjectDetail> detail(@PathVariable String slug, @RequestParam(defaultValue = "en") String lang) {
        String language = language(lang);
        ProjectSummary s = jdbc.sql(SELECT + visibility.samples("p") + " AND t.slug = :slug").param("lang", language).param("slug", slug)
                .query(this::map).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Project not found"));
        String description = jdbc.sql("SELECT description FROM project_translations WHERE project_id = :id AND language = :lang")
                .param("id", s.id()).param("lang", language).query(String.class).optional().orElse(null);
        List<ProjectUnit> units = jdbc.sql("""
                SELECT u.label, u.bedrooms, u.area_value, u.area_unit, CASE WHEN p.price_public THEN u.base_price END AS price
                FROM project_units u JOIN projects p ON p.id = u.project_id
                WHERE u.project_id = :id ORDER BY u.base_price NULLS LAST, u.label""")
                .param("id", s.id())
                .query((rs, n) -> new ProjectUnit(rs.getString("label"), rs.getObject("bedrooms", Short.class),
                        rs.getBigDecimal("area_value"), rs.getString("area_unit"), rs.getBigDecimal("price"))).list();
        List<Media> media = jdbc.sql("""
                SELECT storage_key, kind, is_primary, media_type,
                       CASE WHEN CAST(:lang AS text) = 'hi' THEN coalesce(alt_hi, alt_en) ELSE alt_en END AS alt,
                       CASE WHEN CAST(:lang AS text) = 'hi' THEN coalesce(caption_hi, caption_en) ELSE caption_en END AS caption
                FROM project_media WHERE project_id = :id AND is_public AND processing_status = 'ready' AND approved_at IS NOT NULL
                  AND media_type IN ('image','floorplan') ORDER BY is_primary DESC, sort_order, created_at""")
                .param("id", s.id()).param("lang", language)
                .query((rs, n) -> new Media(mediaUrl(rs.getString("storage_key")), rs.getString("alt"), rs.getString("caption"),
                        "floorplan".equals(rs.getString("media_type")) ? "floor_plan" : rs.getString("kind"), rs.getBoolean("is_primary"))).list()
                .stream().filter(m -> m.url() != null).toList();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(new ProjectDetail(s, description, units,
                        media.stream().filter(m -> !"floor_plan".equals(m.kind())).toList(),
                        media.stream().filter(m -> "floor_plan".equals(m.kind())).toList(),
                        jdbc.sql("SELECT l.latitude, l.longitude FROM projects p JOIN localities l ON l.id = p.locality_id WHERE p.id = :id AND l.latitude IS NOT NULL")
                                .param("id", s.id()).query((rs, n) -> new MapPoint(rs.getBigDecimal(1), rs.getBigDecimal(2), "approximate")).optional().orElse(null),
                        slugs(s.id())));
    }

    private Map<String, String> slugs(UUID id) {
        Map<String, String> m = new java.util.LinkedHashMap<>();
        jdbc.sql("SELECT language, slug FROM project_translations WHERE project_id = :id ORDER BY language").param("id", id)
                .query((rs, n) -> m.put(rs.getString(1).trim(), rs.getString(2))).list();
        return m;
    }

    /** Slugs of a published project by ANY of its slugs. */
    @GetMapping("/projects/slugs/{slug}")
    ResponseEntity<Map<String, String>> slugsBySlug(@PathVariable String slug) {
        UUID id = jdbc.sql("SELECT p.id FROM projects p JOIN project_translations t ON t.project_id = p.id WHERE t.slug = :s AND p.status = 'published'"
                        + visibility.samples("p") + " LIMIT 1")
                .param("s", slug).query(UUID.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Project not found"));
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic()).body(slugs(id));
    }

    private static String language(String lang) {
        if (!"en".equals(lang) && !"hi".equals(lang)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "bad_language", "lang must be en or hi");
        }
        return lang;
    }
}
