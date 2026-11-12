package com.unavora.content.internal;

import com.unavora.identity.AccessService;
import com.unavora.platform.ApiException;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
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
import org.springframework.web.bind.annotation.RestController;

/**
 * Director content management (CRM): Insights, testimonials, featured listings, city introductions and the company
 * facts the website may show. Every change is audited. Permissions: cms.manage (content), property.publish
 * (featured listings), settings.manage (company facts). Directors hold all of them; employees hold none.
 */
@RestController
class StaffContentController {
    private static final String BASE = "/internal/v1/staff/content";

    private final JdbcClient jdbc;
    private final AccessService access;

    StaffContentController(JdbcClient jdbc, AccessService access) {
        this.jdbc = jdbc;
        this.access = access;
    }

    // ---------------- Insights ----------------

    record Translation(String title, String slug, String excerpt, String body) {}

    record ArticleBody(String kind, String category, String authorName, String youtubeId, Translation en, Translation hi,
                       Boolean featured, UUID coverMediaId, String videoDescription) {}

    record ArticleRow(UUID id, String kind, String category, String status, String titleEn, String slugEn, boolean hasHindi,
                      String authorName, OffsetDateTime publishedAt, OffsetDateTime updatedAt) {}

    record ArticleFull(UUID id, String kind, String category, String status, String authorName, String youtubeId,
                       OffsetDateTime publishedAt, Translation en, Translation hi, boolean featured, UUID coverMediaId, String videoDescription) {}

    @GetMapping({BASE + "/articles", "/api/v1/staff/content/articles"})
    @PreAuthorize("@access.has('cms.manage')")
    List<ArticleRow> articles() {
        return jdbc.sql("""
                SELECT a.id, a.kind, a.category, a.status, en.title, en.slug, (hi.article_id IS NOT NULL), a.author_name, a.published_at, a.updated_at
                FROM articles a JOIN article_translations en ON en.article_id = a.id AND en.language = 'en'
                LEFT JOIN article_translations hi ON hi.article_id = a.id AND hi.language = 'hi'
                ORDER BY a.updated_at DESC LIMIT 200""")
                .query((rs, n) -> new ArticleRow(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getString(4),
                        rs.getString(5), rs.getString(6), rs.getBoolean(7), rs.getString(8), rs.getObject(9, OffsetDateTime.class),
                        rs.getObject(10, OffsetDateTime.class))).list();
    }

    @GetMapping({BASE + "/articles/{id}", "/api/v1/staff/content/articles/{id}"})
    @PreAuthorize("@access.has('cms.manage')")
    ArticleFull article(@PathVariable UUID id) {
        var a = jdbc.sql("SELECT kind, category, status, author_name, youtube_id, published_at, is_featured, cover_media_id, video_description FROM articles WHERE id = :id").param("id", id)
                .query((rs, n) -> new Object[]{rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5),
                        rs.getObject(6, OffsetDateTime.class), rs.getBoolean(7), rs.getObject(8, UUID.class), rs.getString(9)}).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Article not found"));
        return new ArticleFull(id, (String) a[0], (String) a[1], (String) a[2], (String) a[3], (String) a[4], (OffsetDateTime) a[5],
                translation(id, "en"), translation(id, "hi"), (Boolean) a[6], (UUID) a[7], (String) a[8]);
    }

    @PostMapping({BASE + "/articles", "/api/v1/staff/content/articles"})
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    ResponseEntity<Map<String, Object>> createArticle(@RequestBody ArticleBody b) {
        validate(b);
        UUID me = me();
        UUID id = jdbc.sql("""
                INSERT INTO articles (kind, category, author_name, youtube_id, created_by, updated_by)
                VALUES (:k, :c, :a, :y, :me, :me) RETURNING id""")
                .param("k", b.kind()).param("c", b.category()).param("a", b.authorName().trim()).param("y", blank(b.youtubeId()))
                .param("me", me).query(UUID.class).single();
        saveTranslations(id, b);
        saveExtras(id, b);
        audit(me, "article.created", "article", id.toString());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @PutMapping({BASE + "/articles/{id}", "/api/v1/staff/content/articles/{id}"})
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    ArticleFull updateArticle(@PathVariable UUID id, @RequestBody ArticleBody b) {
        validate(b);
        int n = jdbc.sql("UPDATE articles SET kind = :k, category = :c, author_name = :a, youtube_id = :y, updated_by = :me WHERE id = :id")
                .param("k", b.kind()).param("c", b.category()).param("a", b.authorName().trim()).param("y", blank(b.youtubeId()))
                .param("me", me()).param("id", id).update();
        if (n == 0) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Article not found");
        jdbc.sql("DELETE FROM article_translations WHERE article_id = :id").param("id", id).update();
        saveTranslations(id, b);
        saveExtras(id, b);
        audit(me(), "article.updated", "article", id.toString());
        return article(id);
    }

    record StatusBody(String status) {}

    @PostMapping({BASE + "/articles/{id}/status", "/api/v1/staff/content/articles/{id}/status"})
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    ArticleFull articleStatus(@PathVariable UUID id, @RequestBody StatusBody b) {
        String st = b == null ? null : b.status();
        if (!"published".equals(st) && !"draft".equals(st) && !"archived".equals(st)) throw bad("Choose published, draft or archived");
        int n = jdbc.sql("""
                UPDATE articles SET status = :st, updated_by = :me,
                       published_at = CASE WHEN :st = 'published' THEN coalesce(published_at, now()) ELSE published_at END
                WHERE id = :id""").param("st", st).param("me", me()).param("id", id).update();
        if (n == 0) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Article not found");
        audit(me(), "article." + st, "article", id.toString());
        return article(id);
    }

    private void validate(ArticleBody b) {
        if (b == null || !PublicContentController.KINDS.contains(b.kind())) throw bad("Choose article or video");
        if (!PublicContentController.CATEGORIES.contains(b.category())) throw bad("Choose a category");
        if (b.authorName() == null || b.authorName().isBlank() || b.authorName().length() > 120) throw bad("Author name is required");
        if ("video".equals(b.kind()) && (b.youtubeId() == null || !b.youtubeId().matches("[A-Za-z0-9_-]{11}"))) throw bad("Enter the 11-character YouTube video id");
        if (b.youtubeId() != null && !b.youtubeId().isBlank() && !b.youtubeId().matches("[A-Za-z0-9_-]{11}")) throw bad("Invalid YouTube video id");
        checkTranslation(b.en(), true);
        checkTranslation(b.hi(), false);
    }

    private static void checkTranslation(Translation t, boolean required) {
        if (t == null || (t.title() == null || t.title().isBlank())) {
            if (required) throw bad("English title and text are required");
            return;
        }
        if (t.title().length() > 200) throw bad("Title is too long");
        if (t.slug() == null || !t.slug().matches("[a-z0-9]+(-[a-z0-9]+)*") || t.slug().length() > 200) throw bad("Slug: lowercase letters, numbers and hyphens");
        if (t.excerpt() != null && t.excerpt().length() > 400) throw bad("Summary is too long (400)");
        if (t.body() == null || t.body().isBlank() || t.body().length() > 50000) throw bad("Article text is required");
    }

    private void saveTranslations(UUID id, ArticleBody b) {
        for (var e : Map.of("en", b.en(), "hi", b.hi() == null ? new Translation(null, null, null, null) : b.hi()).entrySet()) {
            Translation t = e.getValue();
            if (t == null || t.title() == null || t.title().isBlank()) continue;
            Integer clash = jdbc.sql("SELECT count(*) FROM article_translations WHERE language = :l AND slug = :s AND article_id <> :id")
                    .param("l", e.getKey()).param("s", t.slug()).param("id", id).query(Integer.class).single();
            if (clash > 0) throw new ApiException(HttpStatus.CONFLICT, "slug_taken", "This slug is already used");
            jdbc.sql("INSERT INTO article_translations (article_id, language, title, slug, excerpt, body) VALUES (:id, :l, :t, :s, :e, :b)")
                    .param("id", id).param("l", e.getKey()).param("t", t.title().trim()).param("s", t.slug())
                    .param("e", blank(t.excerpt())).param("b", t.body().trim()).update();
        }
    }

    /** Featured (only one article at a time), cover image from the site library, plain-text video description. */
    private void saveExtras(UUID id, ArticleBody b) {
        if (b.coverMediaId() != null && jdbc.sql("SELECT count(*) FROM site_media WHERE id = :m").param("m", b.coverMediaId()).query(Integer.class).single() == 0) {
            throw bad("Unknown cover image");
        }
        String vd = blank(b.videoDescription());
        if (vd != null && vd.length() > 2000) throw bad("Video description is too long (2000)");
        if (Boolean.TRUE.equals(b.featured())) jdbc.sql("UPDATE articles SET is_featured = false WHERE is_featured AND id <> :id").param("id", id).update();
        jdbc.sql("UPDATE articles SET is_featured = :f, cover_media_id = :c, video_description = :v WHERE id = :id")
                .param("f", Boolean.TRUE.equals(b.featured())).param("c", b.coverMediaId()).param("v", vd).param("id", id).update();
    }

    private Translation translation(UUID id, String lang) {
        return jdbc.sql("SELECT title, slug, excerpt, body FROM article_translations WHERE article_id = :id AND language = :l")
                .param("id", id).param("l", lang).query((rs, n) -> new Translation(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4)))
                .optional().orElse(null);
    }

    // ---------------- testimonials ----------------

    record TestimonialRow(UUID id, String displayName, Short rating, String body, String status, OffsetDateTime consentAt,
                          String consentNote, OffsetDateTime createdAt) {}

    record TestimonialBody(String displayName, Short rating, String body, boolean consentConfirmed, String consentNote, boolean publish) {}

    @GetMapping({BASE + "/testimonials", "/api/v1/staff/content/testimonials"})
    @PreAuthorize("@access.has('cms.manage')")
    List<TestimonialRow> testimonials() {
        return jdbc.sql("""
                SELECT id, display_name, rating, body, status, display_consent_at, display_consent_note, created_at FROM reviews
                ORDER BY created_at DESC LIMIT 200""")
                .query((rs, n) -> new TestimonialRow(rs.getObject(1, UUID.class), rs.getString(2), rs.getObject(3, Short.class), rs.getString(4),
                        rs.getString(5), rs.getObject(6, OffsetDateTime.class), rs.getString(7), rs.getObject(8, OffsetDateTime.class))).list();
    }

    /** A testimonial the director received (e.g. in writing). Publishing requires a recorded permission to display. */
    @PostMapping({BASE + "/testimonials", "/api/v1/staff/content/testimonials"})
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    ResponseEntity<Map<String, Object>> addTestimonial(@RequestBody TestimonialBody b) {
        if (b == null || b.displayName() == null || b.displayName().isBlank() || b.displayName().length() > 80) throw bad("Name to display is required");
        if (b.body() == null || b.body().isBlank() || b.body().length() > 2000) throw bad("Testimonial text is required");
        if (b.rating() != null && (b.rating() < 1 || b.rating() > 5)) throw bad("Rating 1 to 5, or leave empty");
        if (!b.consentConfirmed() || b.consentNote() == null || b.consentNote().isBlank() || b.consentNote().length() > 300) {
            throw bad("Record how the customer gave permission to display this testimonial");
        }
        // A rating is stored only when the customer actually gave one (V14 made it optional); it is never invented.
        UUID id = jdbc.sql("""
                INSERT INTO reviews (rating, body, status, display_name, display_consent_at, display_consent_note, moderated_by)
                VALUES (:r, :b, :st, :n, now(), :note, :me) RETURNING id""")
                .param("r", b.rating()).param("b", b.body().trim()).param("st", b.publish() ? "published" : "pending")
                .param("n", b.displayName().trim()).param("note", b.consentNote().trim()).param("me", me()).query(UUID.class).single();
        audit(me(), "testimonial.created", "review", id.toString());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @PostMapping({BASE + "/testimonials/{id}/status", "/api/v1/staff/content/testimonials/{id}/status"})
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    ResponseEntity<Void> testimonialStatus(@PathVariable UUID id, @RequestBody StatusBody b) {
        String st = b == null ? null : b.status();
        if (!"published".equals(st) && !"pending".equals(st) && !"rejected".equals(st)) throw bad("Choose published, pending or rejected");
        try {
            int n = jdbc.sql("UPDATE reviews SET status = :st, moderated_by = :me WHERE id = :id").param("st", st).param("me", me()).param("id", id).update();
            if (n == 0) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Testimonial not found");
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            throw new ApiException(HttpStatus.CONFLICT, "consent_required", "This review has no recorded permission to display");
        }
        audit(me(), "testimonial." + st, "review", id.toString());
        return ResponseEntity.noContent().build();
    }

    // ---------------- featured listings ----------------

    record FeaturedRow(UUID id, String title, String city, boolean featured) {}

    @GetMapping({BASE + "/featured", "/api/v1/staff/content/featured"})
    @PreAuthorize("@access.has('property.publish')")
    List<FeaturedRow> featured() {
        return jdbc.sql("""
                SELECT p.id, t.title, l.city, (p.featured_at IS NOT NULL) FROM properties p
                JOIN property_translations t ON t.property_id = p.id AND t.language = 'en' JOIN localities l ON l.id = p.locality_id
                WHERE p.status = 'published' AND p.availability IN ('available','under_offer')
                ORDER BY (p.featured_at IS NULL), p.featured_at DESC, p.published_at DESC LIMIT 200""")
                .query((rs, n) -> new FeaturedRow(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getBoolean(4))).list();
    }

    @PutMapping({BASE + "/featured/{propertyId}", "/api/v1/staff/content/featured/{propertyId}"})
    @PreAuthorize("@access.has('property.publish')")
    ResponseEntity<Void> feature(@PathVariable UUID propertyId) { return setFeatured(propertyId, true); }

    @DeleteMapping({BASE + "/featured/{propertyId}", "/api/v1/staff/content/featured/{propertyId}"})
    @PreAuthorize("@access.has('property.publish')")
    ResponseEntity<Void> unfeature(@PathVariable UUID propertyId) { return setFeatured(propertyId, false); }

    private ResponseEntity<Void> setFeatured(UUID id, boolean on) {
        int n = jdbc.sql("UPDATE properties SET featured_at = " + (on ? "coalesce(featured_at, now())" : "NULL")
                + " WHERE id = :id AND status = 'published'").param("id", id).update();
        if (n == 0) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Published property not found");
        audit(me(), on ? "property.featured" : "property.unfeatured", "property", id.toString());
        return ResponseEntity.noContent().build();
    }

    // ---------------- city introductions ----------------

    record LocationText(String title, String intro) {}

    record LocationBody(LocationText en, LocationText hi, boolean published) {}

    record LocationRow(String city, String slug, int listings, boolean hasContent, boolean published, LocationText en, LocationText hi) {}

    static String slug(String city) { return city.trim().toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", ""); }

    static String introOf(String json) {
        if (json == null) return null;
        var m = java.util.regex.Pattern.compile("\"intro\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(json);
        return m.find() ? m.group(1).replace("\\n", "\n").replace("\\\"", "\"").replace("\\\\", "\\") : null;
    }

    static String jsonOf(String intro) {
        return "{\"intro\":\"" + intro.replace("\\", "\\\\").replace("\"", "\\\"").replace("\r", "").replace("\n", "\\n") + "\"}";
    }

    @GetMapping({BASE + "/locations", "/api/v1/staff/content/locations"})
    @PreAuthorize("@access.has('cms.manage')")
    List<LocationRow> locations() {
        List<Map.Entry<String, Integer>> cities = jdbc.sql("""
                SELECT l.city, count(DISTINCT p.id) FROM localities l
                LEFT JOIN properties p ON p.locality_id = l.id AND p.status = 'published' AND p.availability IN ('available','under_offer')
                GROUP BY l.city ORDER BY l.city""").query((rs, n) -> Map.entry(rs.getString(1), rs.getInt(2))).list();
        return cities.stream().map(c -> {
            String key = "location-" + slug(c.getKey());
            var page = jdbc.sql("SELECT id, status FROM cms_pages WHERE page_key = :k").param("k", key)
                    .query((rs, n) -> new Object[]{rs.getObject(1, UUID.class), rs.getString(2)}).optional();
            LocationText en = page.flatMap(p -> text((UUID) p[0], "en")).orElse(null);
            LocationText hi = page.flatMap(p -> text((UUID) p[0], "hi")).orElse(null);
            return new LocationRow(c.getKey(), slug(c.getKey()), c.getValue(), page.isPresent(),
                    page.map(p -> "published".equals(p[1])).orElse(false), en, hi);
        }).toList();
    }

    private java.util.Optional<LocationText> text(UUID pageId, String lang) {
        return jdbc.sql("SELECT title, body_json FROM cms_page_translations WHERE page_id = :p AND language = :l").param("p", pageId).param("l", lang)
                .query((rs, n) -> new LocationText(rs.getString(1), introOf(rs.getString(2)))).optional();
    }

    @PutMapping({BASE + "/locations/{citySlug}", "/api/v1/staff/content/locations/{citySlug}"})
    @PreAuthorize("@access.has('cms.manage')")
    @Transactional
    ResponseEntity<Void> saveLocation(@PathVariable String citySlug, @RequestBody LocationBody b) {
        if (!citySlug.matches("[a-z0-9-]{2,60}")) throw bad("Unknown city");
        if (b == null || b.en() == null || b.en().title() == null || b.en().title().isBlank() || b.en().intro() == null || b.en().intro().isBlank()) {
            throw bad("English title and introduction are required");
        }
        String key = "location-" + citySlug;
        UUID pageId = jdbc.sql("""
                INSERT INTO cms_pages (page_key, status) VALUES (:k, :st)
                ON CONFLICT (page_key) DO UPDATE SET status = EXCLUDED.status, updated_at = now() RETURNING id""")
                .param("k", key).param("st", b.published() ? "published" : "draft").query(UUID.class).single();
        jdbc.sql("DELETE FROM cms_page_translations WHERE page_id = :p").param("p", pageId).update();
        for (var e : new LinkedHashMap<>(Map.of("en", b.en(), "hi", b.hi() == null ? new LocationText(null, null) : b.hi())).entrySet()) {
            LocationText t = e.getValue();
            if (t.title() == null || t.title().isBlank() || t.intro() == null || t.intro().isBlank()) continue;
            if (t.title().length() > 200 || t.intro().length() > 5000) throw bad("Title or introduction is too long");
            jdbc.sql("""
                    INSERT INTO cms_page_translations (page_id, language, slug, title, body_json, review_status, reviewed_by, reviewed_at)
                    VALUES (:p, :l, :s, :t, :j, 'approved', :me, now())""")
                    .param("p", pageId).param("l", e.getKey()).param("s", key).param("t", t.title().trim()).param("j", jsonOf(t.intro().trim()))
                    .param("me", me()).update();
        }
        audit(me(), "location_content.saved", "cms_page", key);
        return ResponseEntity.noContent().build();
    }

    // ---------------- company facts ----------------

    record SettingRow(String key, String value, boolean verified, boolean publicKey) {}

    record SettingBody(String value, boolean verified) {}

    record OfficeRow(UUID id, String kind, String city, String locality, String address, String pinCode, String phone, boolean verified,
                     String hours, String directionsUrl) {}

    record OfficeBody(String address, String pinCode, String phone, boolean verified, String hours, String directionsUrl) {}

    /** Official account hosts per network: a link to anything else is refused (no look-alike or personal pages). */
    static final Map<String, String> SOCIAL_HOSTS = Map.of(
            "instagram", "^https://(www\\.)?instagram\\.com/[A-Za-z0-9_.]{1,30}/?$",
            "facebook", "^https://(www\\.|m\\.)?facebook\\.com/[A-Za-z0-9_.\\-/?=]{1,100}$",
            "linkedin", "^https://(www\\.)?linkedin\\.com/(company|in)/[A-Za-z0-9_\\-%]{1,100}/?$",
            "youtube", "^https://(www\\.)?youtube\\.com/(@[A-Za-z0-9_.\\-]{1,100}|channel/[A-Za-z0-9_\\-]{10,40}|c/[A-Za-z0-9_\\-]{1,100})/?$",
            "x", "^https://(www\\.)?(x|twitter)\\.com/[A-Za-z0-9_]{1,15}/?$");

    @GetMapping({BASE + "/company", "/api/v1/staff/content/company"})
    @PreAuthorize("@access.has('settings.manage')")
    Map<String, Object> company() {
        List<SettingRow> settings = jdbc.sql("SELECT key, value, verified FROM site_settings ORDER BY key")
                .query((rs, n) -> new SettingRow(rs.getString(1), rs.getString(2), rs.getBoolean(3),
                        PublicCompanyController.PUBLIC_KEYS.contains(rs.getString(1)) || rs.getString(1).startsWith("social."))).list();
        List<OfficeRow> offices = jdbc.sql("SELECT id, kind, city, locality, full_address, pin_code, phone, verified, hours, directions_url FROM company_offices ORDER BY sort_order, city")
                .query((rs, n) -> new OfficeRow(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getString(4),
                        rs.getString(5), rs.getString(6), rs.getString(7), rs.getBoolean(8), rs.getString(9), rs.getString(10))).list();
        return Map.of("settings", settings, "offices", offices);
    }

    @PutMapping({BASE + "/company/settings/{key}", "/api/v1/staff/content/company/settings/{key}"})
    @PreAuthorize("@access.has('settings.manage')")
    @Transactional
    ResponseEntity<Void> saveSetting(@PathVariable String key, @RequestBody SettingBody b) {
        boolean social = key.matches("social\\.[a-z]{1,20}");
        if (!PublicCompanyController.PUBLIC_KEYS.contains(key) && !social && !key.startsWith("company.")) throw bad("Unknown setting");
        if (b == null) throw bad("Missing data");
        String v = blank(b.value());
        if (v != null && v.length() > 500) throw bad("Value is too long");
        if (v != null && key.matches("company\\.(phone|whatsapp)") && !v.matches("\\+[1-9]\\d{7,14}")) throw bad("Use international format, e.g. +91XXXXXXXXXX");
        if (v != null && key.equals("company.email") && !v.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) throw bad("Invalid email");
        if (v != null && social && !v.matches("^https://\\S+$")) throw bad("Social links must start with https://");
        if (v != null && social && SOCIAL_HOSTS.containsKey(key.substring(7)) && !v.matches(SOCIAL_HOSTS.get(key.substring(7)))) {
            throw bad("This does not look like an official " + key.substring(7) + " profile address");
        }
        if (v != null && key.equals("company.hours") && v.length() > 200) throw bad("Working hours are too long (200)");
        if (b.verified() && v == null) throw bad("A value is required before it can be marked verified");
        jdbc.sql("""
                INSERT INTO site_settings (key, value, verified, updated_by, updated_at) VALUES (:k, :v, :ver, :me, now())
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, verified = EXCLUDED.verified, updated_by = EXCLUDED.updated_by, updated_at = now()""")
                .param("k", key).param("v", v).param("ver", b.verified()).param("me", me()).update();
        audit(me(), "setting.saved", "site_setting", key);
        return ResponseEntity.noContent().build();
    }

    @PutMapping({BASE + "/company/offices/{id}", "/api/v1/staff/content/company/offices/{id}"})
    @PreAuthorize("@access.has('settings.manage')")
    @Transactional
    ResponseEntity<Void> saveOffice(@PathVariable UUID id, @RequestBody OfficeBody b) {
        if (b == null) throw bad("Missing data");
        String address = blank(b.address());
        if (address != null && address.length() > 500) throw bad("Address is too long");
        if (b.pinCode() != null && !b.pinCode().isBlank() && !b.pinCode().matches("\\d{6}")) throw bad("PIN code has 6 digits");
        if (b.phone() != null && !b.phone().isBlank() && !b.phone().matches("\\+[1-9]\\d{7,14}")) throw bad("Use international format, e.g. +91XXXXXXXXXX");
        if (b.verified() && address == null) throw bad("An address is required before the office can be marked verified");
        String hours = blank(b.hours());
        if (hours != null && hours.length() > 200) throw bad("Working hours are too long (200)");
        String directions = blank(b.directionsUrl());
        if (directions != null && !directions.matches("^https://(www\\.)?(google\\.[a-z.]+/maps|maps\\.google\\.[a-z.]+|maps\\.app\\.goo\\.gl|goo\\.gl/maps|www\\.openstreetmap\\.org)/\\S*$")) {
            throw bad("Directions must be a Google Maps or OpenStreetMap link");
        }
        int n = jdbc.sql("UPDATE company_offices SET full_address = :a, pin_code = :p, phone = :ph, verified = :v, hours = :h, directions_url = :d WHERE id = :id")
                .param("a", address).param("p", blank(b.pinCode())).param("ph", blank(b.phone())).param("v", b.verified())
                .param("h", hours).param("d", directions).param("id", id).update();
        if (n == 0) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Office not found");
        audit(me(), "office.saved", "company_office", id.toString());
        return ResponseEntity.noContent().build();
    }

    // ---------------- helpers ----------------

    private UUID me() {
        return access.currentUserId().orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Not permitted"));
    }

    private void audit(UUID me, String action, String entityType, String entityId) {
        jdbc.sql("INSERT INTO audit_logs (actor_user_id, actor_label, action, entity_type, entity_id) VALUES (:me, 'staff', :a, :t, :id)")
                .param("me", me).param("a", action).param("t", entityType).param("id", entityId).update();
    }

    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }

    private static ApiException bad(String msg) { return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validation_failed", msg); }
}
