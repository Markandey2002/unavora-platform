package com.unavora.platform;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.unavora.IntegrationTestBase;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

/**
 * Production visibility rules (include-sample-content=false) against the test database, which contains the
 * synthetic seed. These tests fail if a sample listing, project, article or testimonial ever becomes public, or if
 * a non-local deployment could start with synthetic data. Each test rolls back what it inserts (shared database).
 */
@Transactional
@TestPropertySource(properties = {"unavora.public.include-sample-content=false", "unavora.media.public-base-url=http://media.test/m"})
class ProductionVisibilityIT extends IntegrationTestBase {
    @Autowired JdbcClient jdbc;
    @Autowired PublicVisibility visibility;

    @Test
    void sampleRecordsAreNeverPublicWhileRealOnesAre() throws Exception {
        // a real (non-sample) published listing next to the synthetic seed
        UUID real = UUID.randomUUID();
        String slug = "real-listing-" + real.toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO properties (id, property_type_id, locality_id, status, availability, price_amount, published_at)
                SELECT :id, (SELECT id FROM property_types WHERE code = 'apartment'), (SELECT id FROM localities ORDER BY slug LIMIT 1),
                       'published', 'available', 5000000, now()""").param("id", real).update();
        jdbc.sql("INSERT INTO property_translations (property_id, language, title, slug) VALUES (:id, 'en', 'Real listing', :slug)")
                .param("id", real).param("slug", slug).update();
        assertTrue(jdbc.sql("SELECT count(*) FROM properties WHERE is_sample AND status = 'published'").query(Long.class).single() > 0,
                "seed must contain published samples for this test to mean anything");

        mvc.perform(get("/api/v1/public/properties?lang=en&limit=50"))
                .andExpect(jsonPath("$.items[*].slug", hasItem(slug)))
                .andExpect(jsonPath("$.items[*].title", not(hasItem(org.hamcrest.Matchers.startsWith("[SAMPLE]")))));
        mvc.perform(get("/api/v1/public/properties/sample-3bhk-apartment-sector-37-noida?lang=en")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/public/properties/" + slug + "?lang=en")).andExpect(status().isOk());
        for (String sort : new String[] {"price_asc", "price_desc", "featured"}) {
            mvc.perform(get("/api/v1/public/properties?lang=en&limit=50&sort=" + sort))
                    .andExpect(jsonPath("$.items[*].title", not(hasItem(org.hamcrest.Matchers.startsWith("[SAMPLE]")))));
        }
    }

    @Test
    void localDemoShowcaseItemsAreNeverPublicButApprovedOnesAre() throws Exception {
        UUID media = jdbc.sql("""
                INSERT INTO site_media (storage_key, kind, alt_en, licence, scan_status, processing_status, is_public, approved_at)
                VALUES ('site/test.jpg', 'representative', 'Towers', 'Unsplash License', 'clean', 'ready', true, now()) RETURNING id""")
                .query(UUID.class).single();
        for (Object[] row : new Object[][]{{"Demo sample card", true}, {"Approved showcase card", false}}) {
            jdbc.sql("""
                    INSERT INTO showcase_items (category, title_en, description_en, image_media_id, status, published_at, is_sample)
                    VALUES ('residential', :t, 'x', :m, 'published', now(), :s)""").param("t", row[0]).param("m", media).param("s", row[1]).update();
        }
        mvc.perform(get("/api/v1/public/showcase?lang=en"))
                .andExpect(jsonPath("$[*].title", hasItem("Approved showcase card")))
                .andExpect(jsonPath("$[*].title", not(hasItem("Demo sample card"))));
        UUID sample = jdbc.sql("SELECT id FROM showcase_items WHERE title_en = 'Demo sample card'").query(UUID.class).single();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/public/enquiries")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"X\",\"phone\":\"9811100001\",\"consent\":true,\"showcaseId\":\"" + sample + "\"}"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void sampleProjectsArticlesAndTestimonialsAreHidden() throws Exception {
        UUID project = UUID.randomUUID();
        jdbc.sql("INSERT INTO projects (id, status, published_at, is_sample) VALUES (:id, 'published', now(), true)").param("id", project).update();
        jdbc.sql("INSERT INTO project_translations (project_id, language, name, slug) VALUES (:id, 'en', '[SAMPLE] Hidden launch', :s)")
                .param("id", project).param("s", "hidden-launch-" + project.toString().substring(0, 8)).update();
        mvc.perform(get("/api/v1/public/projects?lang=en"))
                .andExpect(jsonPath("$.items[*].name", not(hasItem("[SAMPLE] Hidden launch"))));
        mvc.perform(get("/api/v1/public/projects/hidden-launch-" + project.toString().substring(0, 8) + "?lang=en")).andExpect(status().isNotFound());

        UUID article = UUID.randomUUID();
        jdbc.sql("INSERT INTO articles (id, kind, category, author_name, status, published_at, is_sample) VALUES (:id, 'article', 'guide', 'Test', 'published', now(), true)")
                .param("id", article).update();
        String aslug = "hidden-article-" + article.toString().substring(0, 8);
        jdbc.sql("INSERT INTO article_translations (article_id, language, title, slug, body) VALUES (:id, 'en', '[SAMPLE] Hidden article', :s, 'x')")
                .param("id", article).param("s", aslug).update();
        mvc.perform(get("/api/v1/public/articles?lang=en&limit=24")).andExpect(jsonPath("$.items[*].slug", not(hasItem(aslug))));
        mvc.perform(get("/api/v1/public/articles/" + aslug + "?lang=en")).andExpect(status().isNotFound());

        jdbc.sql("""
                INSERT INTO reviews (status, rating, body, display_name, display_consent_at, display_consent_note, is_sample)
                VALUES ('published', 5, 'Sample review text', 'Sample Person', now(), 'sample', true)""").update();
        mvc.perform(get("/api/v1/public/testimonials?lang=en")).andExpect(jsonPath("$[*].displayName", not(hasItem("Sample Person"))));
    }

    @Test
    void nonLocalDeploymentRefusesToStartWithSyntheticData() {
        // the test database holds sample rows: a production-like start must fail
        SyntheticDataGuard guard = new SyntheticDataGuard(new org.springframework.mock.env.MockEnvironment(), jdbc, visibility, "classpath:db/migration");
        IllegalStateException rows = assertThrows(IllegalStateException.class, () -> guard.check(false));
        assertTrue(rows.getMessage().contains("synthetic sample record"));
        // the local seed folder on the Flyway path is refused before any row check
        SyntheticDataGuard seeded = new SyntheticDataGuard(new org.springframework.mock.env.MockEnvironment(), jdbc, visibility,
                "classpath:db/migration,classpath:db/seed-local");
        assertTrue(assertThrows(IllegalStateException.class, () -> seeded.check(false)).getMessage().contains("seed-local"));
        // the sample switch itself is refused outside local/test
        SyntheticDataGuard switched = new SyntheticDataGuard(new org.springframework.mock.env.MockEnvironment(), jdbc,
                new PublicVisibility(true), "classpath:db/migration");
        assertTrue(assertThrows(IllegalStateException.class, () -> switched.check(false)).getMessage().contains("include-sample-content"));
        // local/test profiles are allowed
        guard.check(true);
    }
}
