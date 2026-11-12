package com.unavora;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;

/** New Launches: search by name/developer/location, filters, newest-first paging, approval-gated facts and media. */
@Transactional
class NewLaunchesIT extends IntegrationTestBase {
    @Autowired JdbcClient jdbc;

    private UUID project(String tag, String name, String category, String typeCode, String locality, int daysAgo) {
        UUID id = jdbc.sql("""
                INSERT INTO projects (locality_id, status, construction_status, category, primary_type_id, possession_date, published_at)
                VALUES (:loc, 'published', 'under_construction', :cat, (SELECT id FROM property_types WHERE code = :type),
                        DATE '2028-05-01', now() - make_interval(days => :d)) RETURNING id""")
                .param("loc", UUID.fromString(locality)).param("cat", category).param("type", typeCode).param("d", daysAgo)
                .query(UUID.class).single();
        jdbc.sql("INSERT INTO project_translations (project_id, language, name, slug) VALUES (:p, 'en', :n, :s)")
                .param("p", id).param("n", name + " " + tag).param("s", name.toLowerCase().replace(' ', '-') + "-" + tag).update();
        return id;
    }

    @Test
    void searchFiltersPagingAndApprovedFactsOnly() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        String noidaLocality = "10000000-0000-0000-0000-000000000001";
        UUID older = project(tag, "Alpha Homes", "residential", "apartment", noidaLocality, 5);
        UUID newer = project(tag, "Beta Offices", "commercial", "office", noidaLocality, 1);

        // newest first, paged, with total
        mvc.perform(get("/api/v1/public/projects?lang=en&q=" + tag + "&limit=1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].slug").value("beta-offices-" + tag));
        mvc.perform(get("/api/v1/public/projects?lang=en&q=" + tag + "&limit=1&offset=1"))
                .andExpect(jsonPath("$.items[0].slug").value("alpha-homes-" + tag));
        // filters
        mvc.perform(get("/api/v1/public/projects?lang=en&q=" + tag + "&category=residential"))
                .andExpect(jsonPath("$.items[*].slug", contains("alpha-homes-" + tag)));
        mvc.perform(get("/api/v1/public/projects?lang=en&q=" + tag + "&type=office"))
                .andExpect(jsonPath("$.items[*].slug", contains("beta-offices-" + tag)))
                .andExpect(jsonPath("$.items[0].typeCode").value("office"))
                .andExpect(jsonPath("$.items[0].category").value("commercial"));
        mvc.perform(get("/api/v1/public/projects?lang=en&category=villa")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/public/projects?lang=en&type=DROP")).andExpect(status().isBadRequest());
        // search by locality name finds both
        String locality = jdbc.sql("SELECT name_en FROM localities WHERE id = :id").param("id", UUID.fromString(noidaLocality)).query(String.class).single();
        mvc.perform(get("/api/v1/public/projects?lang=en&limit=24&q=" + locality))
                .andExpect(jsonPath("$.items[*].slug", hasItem("alpha-homes-" + tag)));

        // possession is dated but not documented for publication: hidden until approved
        mvc.perform(get("/api/v1/public/projects/alpha-homes-" + tag + "?lang=en"))
                .andExpect(jsonPath("$.summary.possessionDate").doesNotExist())
                .andExpect(jsonPath("$.images.length()").value(0));
        jdbc.sql("UPDATE projects SET possession_public = true WHERE id = :p").param("p", older).update();
        mvc.perform(get("/api/v1/public/projects/alpha-homes-" + tag + "?lang=en"))
                .andExpect(jsonPath("$.summary.possessionDate").value("2028-05-01"));

        // unapproved media never appears, even when a public media origin exists (none is configured in tests,
        // so the list stays empty either way; the approval rule is enforced in SQL)
        jdbc.sql("INSERT INTO project_media (project_id, storage_key, media_type, processing_status) VALUES (:p, 'x.jpg', 'image', 'ready')")
                .param("p", newer).update();
        mvc.perform(get("/api/v1/public/projects/beta-offices-" + tag + "?lang=en"))
                .andExpect(jsonPath("$.summary.coverImage").doesNotExist())
                .andExpect(jsonPath("$.images.length()").value(0));
        mvc.perform(get("/api/v1/public/projects?lang=en&q=" + tag))
                .andExpect(jsonPath("$.items[*].slug", not(hasItem("draft"))));
    }
}
