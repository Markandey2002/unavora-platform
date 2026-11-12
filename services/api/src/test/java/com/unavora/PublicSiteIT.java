package com.unavora;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.unavora.platform.RateLimiter;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Public website support added with the 2026-11-08 redesign: company facts, projects, enquiry types, channel partners. */
class PublicSiteIT extends IntegrationTestBase {

    @Autowired JdbcClient jdbc;
    @Autowired RateLimiter limiter;

    @BeforeEach
    void reset() { limiter.reset(); }

    @Test
    void companyEndpointReturnsOnlyVerifiedFacts() throws Exception {
        // seed (V8): display name + tagline verified; phone, email, legal name, director, offices NOT verified
        mvc.perform(get("/api/v1/public/company"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.settings.display_name").value("UNAVORA ANANT INFRA"))
                .andExpect(jsonPath("$.settings.tagline").value("Building Trust. Creating Value."))
                .andExpect(jsonPath("$.settings.phone").doesNotExist())
                .andExpect(jsonPath("$.settings.email").doesNotExist())
                .andExpect(jsonPath("$.settings.legal_name").doesNotExist())
                .andExpect(jsonPath("$.offices.length()").value(0))
                .andExpect(content().string(not(containsString("director"))));
    }

    @Test
    void onlyPublishedProjectsAreListedAndReraNeedsVerification() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        UUID published = project("published", "Sample Project " + tag, "sample-project-" + tag, "UPRERAPRJ-" + tag);
        project("draft", "Draft Project " + tag, "draft-project-" + tag, null);
        jdbc.sql("INSERT INTO project_units (project_id, label, bedrooms, area_value, area_unit, base_price) VALUES (:p, '2 BHK', 2, 1100, 'sq_ft', 6500000), (:p, '3 BHK', 3, 1500, 'sq_ft', 9000000)")
                .param("p", published).update();

        mvc.perform(get("/api/v1/public/projects?lang=en&q=" + tag))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].slug", hasItem("sample-project-" + tag)))
                .andExpect(jsonPath("$.items[*].slug", not(hasItem("draft-project-" + tag))));
        mvc.perform(get("/api/v1/public/projects/sample-project-" + tag + "?lang=en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.name").value("Sample Project " + tag))
                .andExpect(jsonPath("$.summary.city").value("Noida"))
                .andExpect(jsonPath("$.summary.startingPrice").doesNotExist())   // price not approved for publication yet
                .andExpect(jsonPath("$.units[0].basePrice").doesNotExist())
                .andExpect(jsonPath("$.summary.unitTypes").value(2))
                .andExpect(jsonPath("$.summary.reraNumber").doesNotExist())           // declared but not verified
                .andExpect(jsonPath("$.units.length()").value(2));
        mvc.perform(get("/api/v1/public/projects/draft-project-" + tag + "?lang=en")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/public/projects/sample-project-" + tag + "?lang=hi")).andExpect(status().isNotFound()); // no hi translation

        jdbc.sql("UPDATE projects SET rera_verified_at = now(), price_public = true WHERE id = :p").param("p", published).update();
        mvc.perform(get("/api/v1/public/projects/sample-project-" + tag + "?lang=en"))
                .andExpect(jsonPath("$.summary.reraNumber").value("UPRERAPRJ-" + tag))
                .andExpect(jsonPath("$.summary.startingPrice").value(6500000))
                .andExpect(jsonPath("$.units[0].basePrice").value(6500000));
        mvc.perform(get("/api/v1/public/projects?lang=xx")).andExpect(status().isBadRequest());
    }

    @Test
    void visitorChosenEnquiryTypeIsStoredAndValidated() throws Exception {
        String ref = enquiry("""
                {"name":"Type Test","phone":"9876500401","consent":true,"enquiryType":"callback","language":"en"}""", 201);
        assertEquals("callback", jdbc.sql("SELECT enquiry_type FROM leads WHERE public_ref = :r").param("r", ref).query(String.class).single());
        // with a property the lead is always a property enquiry
        String ref2 = enquiry("""
                {"name":"Type Test","phone":"9876500401","consent":true,"enquiryType":"site_visit","propertyId":"%s"}""".formatted(PUBLISHED_PROPERTY), 201);
        assertEquals("property", jdbc.sql("SELECT enquiry_type FROM leads WHERE public_ref = :r").param("r", ref2).query(String.class).single());
        mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"X\",\"phone\":\"9876500402\",\"consent\":true,\"enquiryType\":\"won\"}"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void channelPartnerApplicationCreatesPartnerRowAndLead() throws Exception {
        String res = mvc.perform(post("/api/v1/public/channel-partners").contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .content("""
                                {"name":"Partner Test","phone":"9876500403","email":"partner@example.test","companyName":"Sample Realty",
                                 "city":"Lucknow","areasOfInterest":"Gomti Nagar","reraNumber":"UPRERAAGT-TEST","consent":true,"language":"en"}"""))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String ref = JsonPath.read(res, "$.reference");
        var lead = jdbc.sql("""
                SELECT l.enquiry_type, s.code, l.assigned_user_id::text AS assignee, l.message FROM leads l
                JOIN lead_sources s ON s.id = l.source_id WHERE l.public_ref = :r""").param("r", ref).query().singleRow();
        assertEquals("channel_partner", lead.get("enquiry_type"));
        assertEquals("website_channel_partner", lead.get("code"));
        assertNull(lead.get("assignee"));                                        // director assigns it
        assertEquals(true, ((String) lead.get("message")).contains("RERA (declared, not verified): UPRERAAGT-TEST"));
        assertEquals(1, jdbc.sql("""
                SELECT count(*) FROM channel_partners cp JOIN customers c ON c.id = cp.customer_id
                WHERE c.phone_e164 = '+919876500403' AND cp.status = 'applied' AND cp.rera_number_declared = 'UPRERAAGT-TEST'""")
                .query(Integer.class).single());

        mvc.perform(post("/api/v1/public/channel-partners").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"No Consent\",\"phone\":\"9876500404\",\"city\":\"Noida\",\"consent\":false}"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(post("/api/v1/public/channel-partners").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"No City\",\"phone\":\"9876500405\",\"consent\":true}"))
                .andExpect(status().isUnprocessableEntity());
    }

    private UUID project(String status, String name, String slug, String rera) {
        UUID id = jdbc.sql("""
                INSERT INTO projects (locality_id, status, construction_status, rera_registration_number, published_at)
                VALUES ('10000000-0000-0000-0000-000000000001', :s, 'under_construction', :r,
                        CASE WHEN :s = 'published' THEN now() END) RETURNING id""")
                .param("s", status).param("r", rera).query(UUID.class).single();
        jdbc.sql("INSERT INTO project_translations (project_id, language, name, slug, description) VALUES (:p, 'en', :n, :slug, 'Synthetic test project')")
                .param("p", id).param("n", name).param("slug", slug).update();
        return id;
    }

    private String enquiry(String json, int expected) throws Exception {
        String res = mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
        return JsonPath.read(res, "$.reference");
    }
}
