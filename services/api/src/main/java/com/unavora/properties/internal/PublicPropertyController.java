package com.unavora.properties.internal;

import com.unavora.platform.ApiException;
import com.unavora.platform.Cursor;
import com.unavora.platform.PublicVisibility;
import java.math.BigDecimal;
import java.util.ArrayList;
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
import java.time.Duration;

/**
 * Public, unauthenticated, read-only. Only published + available/under-offer listings are ever returned.
 * Private fields (exact address, owner, internal notes) are not selected at all, so they cannot leak.
 */
@RestController
@RequestMapping("/api/v1/public")
class PublicPropertyController {
    private final JdbcClient jdbc;
    /** Public origin of approved, scanned media (CDN/bucket). Empty = no public media store configured: no images. */
    private final String mediaBase;
    private final PublicVisibility visibility;

    PublicPropertyController(JdbcClient jdbc, PublicVisibility visibility, @Value("${unavora.media.public-base-url:}") String mediaBase) {
        this.jdbc = jdbc;
        this.visibility = visibility;
        this.mediaBase = mediaBase == null ? "" : mediaBase.replaceAll("/+$", "");
    }

    /** Only public, ready (scanned) media is ever exposed, and only when a public media origin is configured. */
    String mediaUrl(String key) { return key == null || mediaBase.isEmpty() ? null : mediaBase + "/" + key; }

    record PropertySummary(UUID id, long number, String title, String slug, String city, String locality,
                           String propertyType, BigDecimal price, boolean priceOnRequest, boolean priceNegotiable,
                           Short bedrooms, Short bathrooms, BigDecimal builtUpArea, BigDecimal plotArea, String areaUnit,
                           String availability, boolean verified, String language,
                           String typeCode, String category,   // typeCode/category: stable codes for filters and UI
                           boolean featured, String coverImage,
                           boolean sample) {}   // true only where the deployment shows synthetic records (local/test)

    record PropertyPage(List<PropertySummary> items, String nextCursor) {}

    /** kind: actual_photo | render | floor_plan. Representative stock never belongs to a listing. */
    record Media(String url, String alt, String caption, String kind, boolean primary) {}

    /** precision: "exact" only when the business approved showing the exact position; otherwise "approximate" (locality). */
    record MapPoint(BigDecimal latitude, BigDecimal longitude, String precision) {}

    record PropertyDetail(PropertySummary summary, String description, List<String> amenities,
                          List<String> availableLanguages, List<Media> images, List<Media> floorPlans, MapPoint map,
                          Map<String, String> slugs) {}   // slug per language, for language switching and hreflang

    static final Set<String> SORTS = Set.of("newest", "price_asc", "price_desc", "featured");

    /** A place with at least one public listing in the requested language. Counts come from live data only. */
    record LocationRow(String city, String locality, long publishedCount) {}

    record LocationList(List<LocationRow> items) {}

    static final Set<String> CATEGORIES = Set.of("residential", "commercial", "land");

    private static final String SELECT = """
            SELECT p.id, p.public_number, t.title, t.slug, t.language, p.published_at,
                   l.city, CASE WHEN t.language = 'hi' THEN coalesce(l.name_hi, l.name_en) ELSE l.name_en END AS locality,
                   CASE WHEN t.language = 'hi' THEN coalesce(pt.name_hi, pt.name_en) ELSE pt.name_en END AS property_type,
                   p.price_amount, p.price_on_request, p.price_negotiable, p.bedrooms, p.bathrooms,
                   p.built_up_area, p.plot_area, p.area_unit, p.availability,
                   (p.verification_status = 'verified') AS verified, pt.code AS type_code, pt.category,
                   (p.featured_at IS NOT NULL) AS featured, p.is_sample,
                   (SELECT m.storage_key FROM property_media m WHERE m.property_id = p.id AND m.media_type = 'image'
                      AND m.is_public AND m.processing_status = 'ready' AND m.approved_at IS NOT NULL
                    ORDER BY m.is_primary DESC, m.sort_order, m.created_at LIMIT 1) AS cover_key
            FROM properties p
            JOIN property_translations t ON t.property_id = p.id
            JOIN localities l ON l.id = p.locality_id
            JOIN property_types pt ON pt.id = p.property_type_id
            WHERE p.status = 'published' AND p.availability IN ('available','under_offer')
            """;

    private PropertySummary map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new PropertySummary(rs.getObject("id", UUID.class), rs.getLong("public_number"), rs.getString("title"),
                rs.getString("slug"), rs.getString("city"), rs.getString("locality"), rs.getString("property_type"),
                rs.getBigDecimal("price_amount"), rs.getBoolean("price_on_request"), rs.getBoolean("price_negotiable"),
                rs.getObject("bedrooms", Short.class), rs.getObject("bathrooms", Short.class),
                rs.getBigDecimal("built_up_area"), rs.getBigDecimal("plot_area"), rs.getString("area_unit"),
                rs.getString("availability"), rs.getBoolean("verified"), rs.getString("language"),
                rs.getString("type_code"), rs.getString("category"),
                rs.getBoolean("featured"), mediaUrl(rs.getString("cover_key")), rs.getBoolean("is_sample"));
    }

    @GetMapping("/properties")
    ResponseEntity<PropertyPage> search(@RequestParam(defaultValue = "en") String lang,
                                        @RequestParam(required = false) String city,
                                        @RequestParam(required = false) String type,
                                        @RequestParam(required = false) String category,
                                        @RequestParam(required = false) BigDecimal minPrice,
                                        @RequestParam(required = false) BigDecimal maxPrice,
                                        @RequestParam(required = false) Integer bedrooms,
                                        @RequestParam(required = false) String q,
                                        @RequestParam(required = false) String sort,
                                        @RequestParam(required = false) Integer limit,
                                        @RequestParam(required = false) String cursor) {
        String language = requireLanguage(lang);
        int pageSize = Cursor.clampLimit(limit);
        StringBuilder sql = new StringBuilder(SELECT).append(visibility.samples("p")).append(" AND t.language = :lang");
        Map<String, Object> params = new HashMap<>();
        params.put("lang", language);
        if (city != null && !city.isBlank()) { sql.append(" AND lower(l.city) = lower(:city)"); params.put("city", city.trim()); }
        if (type != null && !type.isBlank()) { sql.append(" AND pt.code = :type"); params.put("type", type.trim()); }
        if (category != null && !category.isBlank()) {
            if (!CATEGORIES.contains(category.trim())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "bad_category", "category must be residential, commercial or land");
            }
            sql.append(" AND pt.category = :category");
            params.put("category", category.trim());
        }
        if (minPrice != null) { sql.append(" AND p.price_amount >= :minPrice"); params.put("minPrice", minPrice); }
        if (maxPrice != null) { sql.append(" AND p.price_amount <= :maxPrice"); params.put("maxPrice", maxPrice); }
        if (bedrooms != null) { sql.append(" AND p.bedrooms >= :bedrooms"); params.put("bedrooms", bedrooms.shortValue()); }
        if (q != null && !q.isBlank()) {
            sql.append(" AND (t.search_vector @@ plainto_tsquery('simple', :q) OR l.name_en ILIKE :like OR t.title ILIKE :like)");
            params.put("q", q.trim());
            params.put("like", "%" + escapeLike(q.trim()) + "%");
        }
        String order = sort == null || sort.isBlank() ? "newest" : sort.trim();
        if (!SORTS.contains(order)) throw new ApiException(HttpStatus.BAD_REQUEST, "bad_sort", "sort must be newest, price_asc, price_desc or featured");
        if (!"newest".equals(order)) {
            // Other orders page by offset (cursor "o<offset>"); inventories are small and the order is stable (id tiebreak).
            int offset = 0;
            if (cursor != null && !cursor.isBlank()) {
                if (!cursor.matches("o\\d{1,6}")) throw new ApiException(HttpStatus.BAD_REQUEST, "bad_cursor", "Invalid cursor");
                offset = Integer.parseInt(cursor.substring(1));
            }
            sql.append(switch (order) {
                case "price_asc" -> " ORDER BY p.price_amount ASC NULLS LAST, p.id";
                case "price_desc" -> " ORDER BY p.price_amount DESC NULLS LAST, p.id";
                default -> " ORDER BY (p.featured_at IS NULL), p.featured_at DESC, p.published_at DESC, p.id";
            }).append(" LIMIT :lim OFFSET :off");
            params.put("lim", pageSize + 1);
            params.put("off", offset);
            List<PropertySummary> found = jdbc.sql(sql.toString()).params(params).query(this::map).list();
            String nextOffset = found.size() > pageSize ? "o" + (offset + pageSize) : null;
            return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                    .body(new PropertyPage(found.size() > pageSize ? found.subList(0, pageSize) : found, nextOffset));
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

    /** Cities and localities that currently have public listings (same visibility rules as search). */
    @GetMapping("/locations")
    ResponseEntity<LocationList> locations(@RequestParam(defaultValue = "en") String lang) {
        String language = requireLanguage(lang);
        List<LocationRow> rows = jdbc.sql("""
                SELECT l.city, CASE WHEN CAST(:lang AS text) = 'hi' THEN coalesce(l.name_hi, l.name_en) ELSE l.name_en END AS locality,
                       count(DISTINCT p.id) AS n
                FROM properties p
                JOIN property_translations t ON t.property_id = p.id AND t.language = :lang
                JOIN localities l ON l.id = p.locality_id
                WHERE p.status = 'published' AND p.availability IN ('available','under_offer')""" + visibility.samples("p") + " " + """
                GROUP BY l.city, 2 ORDER BY l.city, 2""")
                .param("lang", language)
                .query((rs, n) -> new LocationRow(rs.getString("city"), rs.getString("locality"), rs.getLong("n"))).list();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(new LocationList(rows));
    }

    @GetMapping("/properties/{slug}")
    ResponseEntity<PropertyDetail> detail(@PathVariable String slug, @RequestParam(defaultValue = "en") String lang) {
        String language = requireLanguage(lang);
        PropertySummary s = jdbc.sql(SELECT + visibility.samples("p") + " AND t.language = :lang AND t.slug = :slug")
                .param("lang", language).param("slug", slug).query(this::map).optional()
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
        List<Map.Entry<String, Media>> media = jdbc.sql("""
                SELECT media_type, storage_key, kind, is_primary,
                       CASE WHEN CAST(:lang AS text) = 'hi' THEN coalesce(alt_hi, alt_en) ELSE alt_en END AS alt,
                       CASE WHEN CAST(:lang AS text) = 'hi' THEN coalesce(caption_hi, caption_en) ELSE caption_en END AS caption
                FROM property_media WHERE property_id = :id AND is_public AND processing_status = 'ready' AND approved_at IS NOT NULL
                  AND media_type IN ('image','floorplan') ORDER BY is_primary DESC, sort_order, created_at""")
                .param("id", s.id()).param("lang", language)
                .query((rs, n) -> Map.entry(rs.getString("media_type"), new Media(mediaUrl(rs.getString("storage_key")), rs.getString("alt"),
                        rs.getString("caption"), "floorplan".equals(rs.getString("media_type")) ? "floor_plan" : rs.getString("kind"),
                        rs.getBoolean("is_primary")))).list();
        List<Media> images = media.stream().filter(e -> e.getKey().equals("image") && e.getValue().url() != null).map(Map.Entry::getValue).toList();
        List<Media> plans = media.stream().filter(e -> e.getKey().equals("floorplan") && e.getValue().url() != null).map(Map.Entry::getValue).toList();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(new PropertyDetail(s, description, amenities, languages, images, plans, mapPoint(s.id()), slugs(s.id())));
    }

    private Map<String, String> slugs(UUID id) {
        Map<String, String> m = new java.util.LinkedHashMap<>();
        jdbc.sql("SELECT language, slug FROM property_translations WHERE property_id = :id ORDER BY language").param("id", id)
                .query((rs, n) -> m.put(rs.getString(1).trim(), rs.getString(2))).list();
        return m;
    }

    /** Slugs of a publicly visible listing by ANY of its slugs (a link in the other language resolves to the right page). */
    @GetMapping("/properties/slugs/{slug}")
    ResponseEntity<Map<String, String>> slugsBySlug(@PathVariable String slug) {
        UUID id = jdbc.sql("SELECT p.id FROM properties p JOIN property_translations t ON t.property_id = p.id "
                        + "WHERE t.slug = :s AND p.status = 'published' AND p.availability IN ('available','under_offer')" + visibility.samples("p") + " LIMIT 1")
                .param("s", slug).query(UUID.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Property not found"));
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic()).body(slugs(id));
    }

    /** Exact position only when coordinates exist AND hide_exact_location is false; else the locality's approximate position; else none. */
    MapPoint mapPoint(UUID propertyId) {
        return jdbc.sql("""
                SELECT CASE WHEN NOT p.hide_exact_location AND p.latitude IS NOT NULL THEN p.latitude ELSE l.latitude END,
                       CASE WHEN NOT p.hide_exact_location AND p.latitude IS NOT NULL THEN p.longitude ELSE l.longitude END,
                       CASE WHEN NOT p.hide_exact_location AND p.latitude IS NOT NULL THEN 'exact' ELSE 'approximate' END
                FROM properties p JOIN localities l ON l.id = p.locality_id WHERE p.id = :id""")
                .param("id", propertyId).query((rs, n) -> rs.getBigDecimal(1) == null ? null : new MapPoint(rs.getBigDecimal(1), rs.getBigDecimal(2), rs.getString(3)))
                .optional().orElse(null);
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
