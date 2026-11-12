package com.unavora.content.internal;

import com.unavora.platform.ApiException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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

/** Public, read-only CMS content: Insights (articles and videos), testimonials, city introductions. Published only. */
@RestController
@RequestMapping("/api/v1/public")
class PublicContentController {
    static final Set<String> KINDS = Set.of("article", "video");
    static final Set<String> CATEGORIES = Set.of("market", "guide", "education", "investment", "location", "company");

    private final JdbcClient jdbc;
    private final com.unavora.platform.PublicVisibility visibility;
    /** Base article query with the sample rule applied once. */
    private final String select;

    private final String mediaBase;

    PublicContentController(JdbcClient jdbc, com.unavora.platform.PublicVisibility visibility,
                            @org.springframework.beans.factory.annotation.Value("${unavora.media.public-base-url:}") String mediaBase) {
        this.mediaBase = mediaBase == null ? "" : mediaBase.replaceAll("/+$", "");
        this.jdbc = jdbc;
        this.visibility = visibility;
        this.select = SELECT + visibility.samples("a");
    }

    record ArticleSummary(UUID id, String kind, String category, String title, String slug, String excerpt, String authorName,
                          OffsetDateTime publishedAt, String youtubeId, List<String> languages, boolean featured, String coverImage, String coverAlt) {}

    record ArticlePage(List<ArticleSummary> items, int total) {}

    record ArticleDetail(ArticleSummary article, String body, List<ArticleSummary> related, String videoDescription, Map<String, String> slugs) {}

    record Testimonial(String displayName, Short rating, String body, String propertyTitle) {}

    record LocationContent(String title, String intro) {}

    private static final String SELECT = """
            SELECT a.id, a.kind, a.category, t.title, t.slug, t.excerpt, a.author_name, a.published_at, a.youtube_id,
                   ARRAY(SELECT x.language FROM article_translations x WHERE x.article_id = a.id ORDER BY x.language) AS langs,
                   a.is_featured, cm.storage_key AS cover_key,
                   CASE WHEN t.language = 'hi' THEN coalesce(cm.alt_hi, cm.alt_en) ELSE cm.alt_en END AS cover_alt
            FROM articles a JOIN article_translations t ON t.article_id = a.id AND t.language = :lang
            LEFT JOIN site_media cm ON cm.id = a.cover_media_id AND cm.approved_at IS NOT NULL AND cm.is_public
            WHERE a.status = 'published' AND a.published_at <= now()
            """;

    private ArticleSummary summary(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new ArticleSummary(rs.getObject("id", UUID.class), rs.getString("kind"), rs.getString("category"), rs.getString("title"),
                rs.getString("slug"), rs.getString("excerpt"), rs.getString("author_name"), rs.getObject("published_at", OffsetDateTime.class),
                rs.getString("youtube_id"), List.of((String[]) rs.getArray("langs").getArray()), rs.getBoolean("is_featured"),
                mediaUrl(rs.getString("cover_key")), rs.getString("cover_key") == null || mediaBase.isEmpty() ? null : rs.getString("cover_alt"));
    }

    @GetMapping("/articles")
    ResponseEntity<ArticlePage> articles(@RequestParam(defaultValue = "en") String lang, @RequestParam(required = false) String kind,
                                         @RequestParam(required = false) String category, @RequestParam(required = false) String q,
                                         @RequestParam(required = false) Integer limit, @RequestParam(required = false) Integer offset,
                                         @RequestParam(required = false) Boolean featured) {
        String language = language(lang);
        StringBuilder where = new StringBuilder();
        Map<String, Object> p = new HashMap<>();
        p.put("lang", language);
        if (kind != null && !kind.isBlank()) {
            if (!KINDS.contains(kind)) throw new ApiException(HttpStatus.BAD_REQUEST, "bad_kind", "kind must be article or video");
            where.append(" AND a.kind = :kind"); p.put("kind", kind);
        }
        if (category != null && !category.isBlank()) {
            if (!CATEGORIES.contains(category)) throw new ApiException(HttpStatus.BAD_REQUEST, "bad_category", "Unknown category");
            where.append(" AND a.category = :cat"); p.put("cat", category);
        }
        if (q != null && !q.isBlank()) {
            where.append(" AND (t.title ILIKE :like OR t.excerpt ILIKE :like OR t.body ILIKE :like)");
            p.put("like", "%" + q.trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        if (Boolean.TRUE.equals(featured)) where.append(" AND a.is_featured");
        int lim = Math.max(1, Math.min(limit == null ? 12 : limit, 24));
        int off = Math.max(0, Math.min(offset == null ? 0 : offset, 10000));
        int total = jdbc.sql("SELECT count(*) FROM (" + select + where + ") x").params(p).query(Integer.class).single();
        p.put("lim", lim); p.put("off", off);
        List<ArticleSummary> items = jdbc.sql(select + where + " ORDER BY a.published_at DESC, a.id LIMIT :lim OFFSET :off")
                .params(p).query(this::summary).list();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic()).body(new ArticlePage(items, total));
    }

    @GetMapping("/articles/{slug}")
    ResponseEntity<ArticleDetail> article(@PathVariable String slug, @RequestParam(defaultValue = "en") String lang) {
        String language = language(lang);
        ArticleSummary a = jdbc.sql(select + " AND t.slug = :slug").param("lang", language).param("slug", slug)
                .query(this::summary).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Article not found"));
        String videoDescription = jdbc.sql("SELECT video_description FROM articles WHERE id = :id").param("id", a.id()).query(String.class).optional().orElse(null);
        String body = jdbc.sql("SELECT body FROM article_translations WHERE article_id = :id AND language = :lang")
                .param("id", a.id()).param("lang", language).query(String.class).single();
        List<ArticleSummary> related = jdbc.sql(select + " AND a.category = :cat AND a.id <> :id ORDER BY a.published_at DESC LIMIT 3")
                .param("lang", language).param("cat", a.category()).param("id", a.id()).query(this::summary).list();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic()).body(new ArticleDetail(a, body, related, videoDescription, slugs(a.id())));
    }

    private Map<String, String> slugs(UUID id) {
        Map<String, String> m = new java.util.LinkedHashMap<>();
        jdbc.sql("SELECT language, slug FROM article_translations WHERE article_id = :id ORDER BY language").param("id", id)
                .query((rs, n) -> m.put(rs.getString(1).trim(), rs.getString(2))).list();
        return m;
    }

    /** Slugs of a published Insight by ANY of its slugs. */
    @GetMapping("/articles/slugs/{slug}")
    ResponseEntity<Map<String, String>> slugsBySlug(@PathVariable String slug) {
        UUID id = jdbc.sql("SELECT a.id FROM articles a JOIN article_translations t ON t.article_id = a.id "
                        + "WHERE t.slug = :s AND a.status = 'published' AND a.published_at <= now()" + visibility.samples("a") + " LIMIT 1")
                .param("s", slug).query(UUID.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Article not found"));
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic()).body(slugs(id));
    }

    private String mediaUrl(String key) { return key == null || mediaBase.isEmpty() ? null : mediaBase + "/" + key; }

    /** Only reviews a moderator published AND for which the customer's permission to display was recorded. */
    @GetMapping("/testimonials")
    ResponseEntity<List<Testimonial>> testimonials(@RequestParam(defaultValue = "en") String lang) {
        List<Testimonial> items = jdbc.sql("""
                SELECT r.display_name, r.rating, r.body, t.title FROM reviews r
                LEFT JOIN property_translations t ON t.property_id = r.property_id AND t.language = :lang
                WHERE r.status = 'published' AND r.display_consent_at IS NOT NULL AND r.display_name IS NOT NULL
                  AND nullif(btrim(r.body), '') IS NOT NULL""" + visibility.samples("r") + " " + """
                ORDER BY r.created_at DESC LIMIT 12""")
                .param("lang", language(lang))
                .query((rs, n) -> new Testimonial(rs.getString(1), rs.getObject(2, Short.class), rs.getString(3), rs.getString(4))).list();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(300)).cachePublic()).body(items);
    }

    @GetMapping("/location-content/{citySlug}")
    ResponseEntity<LocationContent> location(@PathVariable String citySlug, @RequestParam(defaultValue = "en") String lang) {
        if (!citySlug.matches("[a-z0-9-]{2,60}")) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Not found");
        LocationContent c = jdbc.sql("""
                SELECT t.title, t.body_json FROM cms_pages p JOIN cms_page_translations t ON t.page_id = p.id AND t.language = :lang
                WHERE p.page_key = :k AND p.status = 'published'""")
                .param("k", "location-" + citySlug).param("lang", language(lang))
                .query((rs, n) -> new LocationContent(rs.getString(1), StaffContentController.introOf(rs.getString(2)))).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Not found"));
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(300)).cachePublic()).body(c);
    }

    static String language(String lang) {
        if (!"en".equals(lang) && !"hi".equals(lang)) throw new ApiException(HttpStatus.BAD_REQUEST, "bad_language", "lang must be en or hi");
        return lang;
    }
}
