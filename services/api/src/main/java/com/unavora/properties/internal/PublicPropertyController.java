package com.unavora.properties.internal;

import com.unavora.platform.ApiException;
import com.unavora.platform.Cursor;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
import java.time.Duration;

/**
 * Public, unauthenticated, read-only. Only published + available/under-offer listings are ever returned.
 * Private fields (exact address, owner, internal notes) are not selected at all, so they cannot leak.
 */
@RestController
@RequestMapping("/api/v1/public")
class PublicPropertyController {
    private final JdbcClient jdbc;

    PublicPropertyController(JdbcClient jdbc) { this.jdbc = jdbc; }

    record PropertySummary(UUID id, long number, String title, String slug, String city, String locality,
                           String propertyType, BigDecimal price, boolean priceOnRequest, boolean priceNegotiable,
                           Short bedrooms, Short bathrooms, BigDecimal builtUpArea, BigDecimal plotArea, String areaUnit,
                           String availability, boolean verified, String language) {}

    record PropertyPage(List<PropertySummary> items, String nextCursor) {}

    record PropertyDetail(PropertySummary summary, String description, List<String> amenities,
                          List<String> availableLanguages) {}

    private static final String SELECT = """
            SELECT p.id, p.public_number, t.title, t.slug, t.language, p.published_at,
                   l.city, CASE WHEN t.language = 'hi' THEN coalesce(l.name_hi, l.name_en) ELSE l.name_en END AS locality,
                   CASE WHEN t.language = 'hi' THEN coalesce(pt.name_hi, pt.name_en) ELSE pt.name_en END AS property_type,
                   p.price_amount, p.price_on_request, p.price_negotiable, p.bedrooms, p.bathrooms,
                   p.built_up_area, p.plot_area, p.area_unit, p.availability,
                   (p.verification_status = 'verified') AS verified
            FROM properties p
            JOIN property_translations t ON t.property_id = p.id
            JOIN localities l ON l.id = p.locality_id
            JOIN property_types pt ON pt.id = p.property_type_id
            WHERE p.status = 'published' AND p.availability IN ('available','under_offer')
            """;

    private static PropertySummary map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new PropertySummary(rs.getObject("id", UUID.class), rs.getLong("public_number"), rs.getString("title"),
                rs.getString("slug"), rs.getString("city"), rs.getString("locality"), rs.getString("property_type"),
                rs.getBigDecimal("price_amount"), rs.getBoolean("price_on_request"), rs.getBoolean("price_negotiable"),
                rs.getObject("bedrooms", Short.class), rs.getObject("bathrooms", Short.class),
                rs.getBigDecimal("built_up_area"), rs.getBigDecimal("plot_area"), rs.getString("area_unit"),
                rs.getString("availability"), rs.getBoolean("verified"), rs.getString("language"));
    }

    @GetMapping("/properties")
    ResponseEntity<PropertyPage> search(@RequestParam(defaultValue = "en") String lang,
                                        @RequestParam(required = false) String city,
                                        @RequestParam(required = false) String type,
                                        @RequestParam(required = false) BigDecimal minPrice,
                                        @RequestParam(required = false) BigDecimal maxPrice,
                                        @RequestParam(required = false) Integer bedrooms,
                                        @RequestParam(required = false) String q,
                                        @RequestParam(required = false) Integer limit,
                                        @RequestParam(required = false) String cursor) {
        String language = requireLanguage(lang);
        int pageSize = Cursor.clampLimit(limit);
        StringBuilder sql = new StringBuilder(SELECT).append(" AND t.language = :lang");
        Map<String, Object> params = new HashMap<>();
        params.put("lang", language);
        if (city != null && !city.isBlank()) { sql.append(" AND lower(l.city) = lower(:city)"); params.put("city", city.trim()); }
        if (type != null && !type.isBlank()) { sql.append(" AND pt.code = :type"); params.put("type", type.trim()); }
        if (minPrice != null) { sql.append(" AND p.price_amount >= :minPrice"); params.put("minPrice", minPrice); }
        if (maxPrice != null) { sql.append(" AND p.price_amount <= :maxPrice"); params.put("maxPrice", maxPrice); }
        if (bedrooms != null) { sql.append(" AND p.bedrooms >= :bedrooms"); params.put("bedrooms", bedrooms.shortValue()); }
        if (q != null && !q.isBlank()) {
            sql.append(" AND (t.search_vector @@ plainto_tsquery('simple', :q) OR l.name_en ILIKE :like OR t.title ILIKE :like)");
            params.put("q", q.trim());
            params.put("like", "%" + escapeLike(q.trim()) + "%");
        }
        if (cursor != null && !cursor.isBlank()) {
            Cursor c = Cursor.decode(cursor);
            sql.append(" AND (p.published_at, p.id) < (CAST(:cAt AS timestamptz), CAST(:cId AS uuid))");
            params.put("cAt", c.at()); params.put("cId", c.id().toString());
        }
        sql.append(" ORDER BY p.published_at DESC, p.id DESC LIMIT :lim");
        params.put("lim", pageSize + 1);

        List<Map.Entry<PropertySummary, java.time.OffsetDateTime>> rows = new ArrayList<>(
                jdbc.sql(sql.toString()).params(params).query((rs, n) ->
                        Map.entry(map(rs, n), rs.getObject("published_at", java.time.OffsetDateTime.class))).list());

        String next = null;
        if (rows.size() > pageSize) {
            var last = rows.get(pageSize - 1);
            next = new Cursor(last.getValue(), last.getKey().id()).encode();
            rows = rows.subList(0, pageSize);
        }
        List<PropertySummary> items = rows.stream().map(Map.Entry::getKey).toList();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(new PropertyPage(items, next));
    }

    @GetMapping("/properties/{slug}")
    ResponseEntity<PropertyDetail> detail(@PathVariable String slug, @RequestParam(defaultValue = "en") String lang) {
        String language = requireLanguage(lang);
        PropertySummary s = jdbc.sql(SELECT + " AND t.language = :lang AND t.slug = :slug")
                .param("lang", language).param("slug", slug).query(PublicPropertyController::map).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Property not found"));
        String description = jdbc.sql("SELECT description FROM property_translations WHERE property_id = :id AND language = :lang")
                .param("id", s.id()).param("lang", language).query(String.class).optional().orElse(null);
        List<String> amenities = jdbc.sql("""
                SELECT CASE WHEN CAST(:lang AS text) = 'hi' THEN coalesce(a.name_hi, a.name_en) ELSE a.name_en END
                FROM property_amenities pa JOIN amenities a ON a.id = pa.amenity_id
                WHERE pa.property_id = :id ORDER BY a.name_en""")
                .param("id", s.id()).param("lang", language).query(String.class).list();
        List<String> languages = jdbc.sql("SELECT language FROM property_translations WHERE property_id = :id ORDER BY language")
                .param("id", s.id()).query(String.class).list();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(new PropertyDetail(s, description, amenities, languages));
    }

    private static String requireLanguage(String lang) {
        if (!"en".equals(lang) && !"hi".equals(lang)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "bad_language", "lang must be en or hi");
        }
        return lang;
    }

    private static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
