package com.unavora.properties.internal;

import com.unavora.platform.ApiException;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
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
 * Public, read-only projects ("new launches"). Only status = 'published' is ever returned. The RERA number is
 * returned only after the business has verified it (rera_verified_at set); otherwise it is null, never guessed.
 */
@RestController
@RequestMapping("/api/v1/public")
class PublicProjectController {
    private final JdbcClient jdbc;

    PublicProjectController(JdbcClient jdbc) { this.jdbc = jdbc; }

    record ProjectSummary(UUID id, long number, String name, String slug, String city, String locality,
                          String constructionStatus, LocalDate possessionDate, BigDecimal startingPrice,
                          int unitTypes, String reraNumber, String language) {}

    record ProjectList(List<ProjectSummary> items) {}

    record ProjectUnit(String label, Short bedrooms, BigDecimal areaValue, String areaUnit, BigDecimal basePrice) {}

    record ProjectDetail(ProjectSummary summary, String description, List<ProjectUnit> units) {}

    private static final String SELECT = """
            SELECT p.id, p.public_number, t.name, t.slug, t.language, l.city,
                   CASE WHEN t.language = 'hi' THEN coalesce(l.name_hi, l.name_en) ELSE l.name_en END AS locality,
                   p.construction_status, p.possession_date,
                   (SELECT min(u.base_price) FROM project_units u WHERE u.project_id = p.id) AS starting_price,
                   (SELECT count(*) FROM project_units u WHERE u.project_id = p.id) AS unit_types,
                   CASE WHEN p.rera_verified_at IS NOT NULL THEN p.rera_registration_number END AS rera
            FROM projects p
            JOIN project_translations t ON t.project_id = p.id
            LEFT JOIN localities l ON l.id = p.locality_id
            WHERE p.status = 'published' AND t.language = :lang
            """;

    private static ProjectSummary map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new ProjectSummary(rs.getObject("id", UUID.class), rs.getLong("public_number"), rs.getString("name"),
                rs.getString("slug"), rs.getString("city"), rs.getString("locality"), rs.getString("construction_status"),
                rs.getObject("possession_date", LocalDate.class), rs.getBigDecimal("starting_price"),
                rs.getInt("unit_types"), rs.getString("rera"), rs.getString("language"));
    }

    @GetMapping("/projects")
    ResponseEntity<ProjectList> list(@RequestParam(defaultValue = "en") String lang) {
        List<ProjectSummary> items = jdbc.sql(SELECT + " ORDER BY p.published_at DESC, p.id DESC LIMIT 50")
                .param("lang", language(lang)).query(PublicProjectController::map).list();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic()).body(new ProjectList(items));
    }

    @GetMapping("/projects/{slug}")
    ResponseEntity<ProjectDetail> detail(@PathVariable String slug, @RequestParam(defaultValue = "en") String lang) {
        String language = language(lang);
        ProjectSummary s = jdbc.sql(SELECT + " AND t.slug = :slug").param("lang", language).param("slug", slug)
                .query(PublicProjectController::map).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Project not found"));
        String description = jdbc.sql("SELECT description FROM project_translations WHERE project_id = :id AND language = :lang")
                .param("id", s.id()).param("lang", language).query(String.class).optional().orElse(null);
        List<ProjectUnit> units = jdbc.sql("""
                SELECT label, bedrooms, area_value, area_unit, base_price FROM project_units
                WHERE project_id = :id ORDER BY base_price NULLS LAST, label""")
                .param("id", s.id())
                .query((rs, n) -> new ProjectUnit(rs.getString("label"), rs.getObject("bedrooms", Short.class),
                        rs.getBigDecimal("area_value"), rs.getString("area_unit"), rs.getBigDecimal("base_price"))).list();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(new ProjectDetail(s, description, units));
    }

    private static String language(String lang) {
        if (!"en".equals(lang) && !"hi".equals(lang)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "bad_language", "lang must be en or hi");
        }
        return lang;
    }
}
