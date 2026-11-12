package com.unavora;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.unavora.platform.RateLimiter;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Website programme Phases B-D: discovery, owner submissions, customer favourites/activity, CMS content. */
class PublicSiteContentIT extends IntegrationTestBase {
    static final String TOKEN = "test-internal-token";
    static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H', 'D', 'R'};

    @Autowired JdbcClient jdbc;
    @Autowired RateLimiter limiter;

    @BeforeEach
    void reset() { limiter.reset(); }

    @Test
    void listingSortsByPriceAndPagesByOffset() throws Exception {
        String asc = mvc.perform(get("/api/v1/public/properties?lang=en&sort=price_asc&limit=50")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<Number> prices = JsonPath.read(asc, "$.items[*].price");
        for (int i = 1; i < prices.size(); i++) assertTrue(prices.get(i - 1).doubleValue() <= prices.get(i).doubleValue(), "ascending");
        String page1 = mvc.perform(get("/api/v1/public/properties?lang=en&sort=price_desc&limit=2")).andExpect(jsonPath("$.nextCursor").value("o2"))
                .andReturn().getResponse().getContentAsString();
        String page2 = mvc.perform(get("/api/v1/public/properties?lang=en&sort=price_desc&limit=2&cursor=o2")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertTrue(((Number) JsonPath.read(page1, "$.items[1].price")).doubleValue() >= ((Number) JsonPath.read(page2, "$.items[0].price")).doubleValue());
        mvc.perform(get("/api/v1/public/properties?lang=en&sort=random")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/public/properties?lang=en&sort=price_asc&cursor=xyz")).andExpect(status().isBadRequest());
        // no public media store configured in tests: no image URLs are ever invented
        mvc.perform(get("/api/v1/public/properties/sample-3bhk-apartment-sector-37-noida?lang=en"))
                .andExpect(jsonPath("$.images.length()").value(0)).andExpect(jsonPath("$.summary.coverImage").doesNotExist());
    }

    @Test
    void featuredListingsComeFirstAndOnlyDirectorsChooseThem() throws Exception {
        String villa = "20000000-0000-0000-0000-000000000003";
        mvc.perform(put("/api/v1/staff/content/featured/" + villa).with(bearer(EMPLOYEE_1))).andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/staff/content/featured/" + villa).with(bearer(DIRECTOR))).andExpect(status().isNoContent());
        try {
            mvc.perform(get("/api/v1/public/properties?lang=en&sort=featured"))
                    .andExpect(jsonPath("$.items[0].id").value(villa)).andExpect(jsonPath("$.items[0].featured").value(true));
            mvc.perform(put("/api/v1/staff/content/featured/" + DRAFT_PROPERTY).with(bearer(DIRECTOR))).andExpect(status().isNotFound());
        } finally {
            mvc.perform(delete("/api/v1/staff/content/featured/" + villa).with(bearer(DIRECTOR))).andExpect(status().isNoContent());
        }
    }

    @Test
    void projectsFilterByStatusAndShowDeveloper() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        UUID id = jdbc.sql("""
                INSERT INTO projects (locality_id, status, construction_status, developer_name, published_at)
                VALUES ('10000000-0000-0000-0000-000000000002', 'published', 'ready_to_move', 'Sample Developer Pvt Ltd', now()) RETURNING id""")
                .query(UUID.class).single();
        jdbc.sql("INSERT INTO project_translations (project_id, language, name, slug) VALUES (:p, 'en', :n, :s)")
                .param("p", id).param("n", "Status Project " + tag).param("s", "status-project-" + tag).update();
        // the developer is shown (and searchable) only after the business verified the relationship
        mvc.perform(get("/api/v1/public/projects?lang=en&status=ready_to_move&q=" + tag))
                .andExpect(jsonPath("$.items[*].slug", hasItem("status-project-" + tag)))
                .andExpect(jsonPath("$.items[0].developerName").doesNotExist());
        mvc.perform(get("/api/v1/public/projects?lang=en&q=Sample Developer")).andExpect(jsonPath("$.items[*].slug", not(hasItem("status-project-" + tag))));
        jdbc.sql("UPDATE projects SET developer_verified = true WHERE id = :p").param("p", id).update();
        mvc.perform(get("/api/v1/public/projects?lang=en&status=ready_to_move&q=" + tag))
                .andExpect(jsonPath("$.items[?(@.slug=='status-project-" + tag + "')].developerName", contains("Sample Developer Pvt Ltd")));
        mvc.perform(get("/api/v1/public/projects?lang=en&q=Sample Developer&limit=24")).andExpect(jsonPath("$.items[*].slug", hasItem("status-project-" + tag)));
        mvc.perform(get("/api/v1/public/projects?lang=en&status=under_construction&q=" + tag))
                .andExpect(jsonPath("$.items[*].slug", not(hasItem("status-project-" + tag))));
        mvc.perform(get("/api/v1/public/projects?lang=en&status=sold_out")).andExpect(status().isBadRequest());
    }

    org.springframework.test.web.servlet.RequestBuilder ownerForm(String phone, byte[] photo, boolean consent) {
        var m = multipart("/api/v1/public/property-submissions");
        if (photo != null) m.file(new MockMultipartFile("photos", "front.png", "image/png", photo));
        return m.param("name", "Owner Test").param("phone", phone).param("email", "owner@example.test")
                .param("city", "Lucknow").param("locality", "Gomti Nagar").param("propertyType", "apartment").param("purpose", "sale")
                .param("expectedPrice", "6500000").param("area", "1100").param("areaUnit", "sq_ft").param("message", "Corner flat")
                .param("consent", String.valueOf(consent));
    }

    @Test
    void ownerSubmissionBecomesCrmLeadAndNeedsReviewThenDirectorDecision() throws Exception {
        int propertiesBefore = jdbc.sql("SELECT count(*) FROM properties").query(Integer.class).single();
        String res = mvc.perform(ownerForm("9876500601", PNG, true)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String ref = JsonPath.read(res, "$.reference");
        var lead = jdbc.sql("""
                SELECT l.enquiry_type, s.code, l.assigned_user_id::text AS a, sub.id::text AS sid, sub.status,
                       (SELECT count(*) FROM property_submission_files f WHERE f.submission_id = sub.id) AS files
                FROM leads l JOIN lead_sources s ON s.id = l.source_id JOIN property_submissions sub ON sub.lead_id = l.id
                WHERE l.public_ref = :r""").param("r", ref).query().singleRow();
        assertEquals("property_owner", lead.get("enquiry_type"));
        assertEquals("website_owner", lead.get("code"));
        assertEquals(null, lead.get("a"));
        assertEquals("submitted", lead.get("status"));
        assertEquals(1L, ((Number) lead.get("files")).longValue());
        String sid = (String) lead.get("sid");
        // no listing is created or published by a submission
        assertEquals(propertiesBefore, jdbc.sql("SELECT count(*) FROM properties").query(Integer.class).single());

        mvc.perform(ownerForm("9876500602", "not an image".getBytes(), true)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("file_type"));
        mvc.perform(ownerForm("9876500603", null, false)).andExpect(status().isUnprocessableEntity());

        // visibility: unassigned -> director only
        mvc.perform(get("/api/v1/staff/submissions/" + sid).with(bearer(EMPLOYEE_1))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/staff/submissions").with(bearer(DIRECTOR))).andExpect(jsonPath("$[*].id", hasItem(sid)));
        String fileId = JsonPath.read(mvc.perform(get("/api/v1/staff/submissions/" + sid).with(bearer(DIRECTOR)))
                .andExpect(jsonPath("$.photos[0].scanStatus").value("clean"))
                .andReturn().getResponse().getContentAsString(), "$.photos[0].id");
        mvc.perform(get("/api/v1/staff/submissions/" + sid + "/files/" + fileId).with(bearer(DIRECTOR)))
                .andExpect(status().isOk()).andExpect(content().contentType("image/png")).andExpect(content().bytes(PNG));
        mvc.perform(get("/api/v1/staff/submissions/" + sid + "/files/" + fileId).with(bearer(EMPLOYEE_1))).andExpect(status().isNotFound());

        // decision only after review; employees never decide
        mvc.perform(post("/api/v1/staff/submissions/" + sid + "/decision").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"approved\",\"note\":\"ok\"}")).andExpect(status().isConflict());
        mvc.perform(post("/api/v1/staff/submissions/" + sid + "/review").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"note\":\"\"}")).andExpect(status().isUnprocessableEntity());
        mvc.perform(post("/api/v1/staff/submissions/" + sid + "/review").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"note\":\"Documents look complete\"}")).andExpect(jsonPath("$.submission.status").value("reviewed"));
        mvc.perform(post("/api/v1/staff/submissions/" + sid + "/decision").with(bearer(EMPLOYEE_1)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"approved\",\"note\":\"x\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/staff/submissions/" + sid + "/decision").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"approved\",\"note\":\"Proceed to listing preparation\"}"))
                .andExpect(jsonPath("$.submission.status").value("approved")).andExpect(jsonPath("$.decidedBy").exists());
        assertEquals(1, jdbc.sql("SELECT count(*) FROM audit_logs WHERE action = 'submission.approved' AND entity_id = :id").param("id", sid).query(Integer.class).single());
    }

    String customerSession(String sub) throws Exception {
        String res = mvc.perform(post("/internal/v1/customer-auth/google").header("X-Internal-Service-Token", TOKEN).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"credential\":\"" + CustomerIdentityIT.mockCredential(sub, sub + "@example.test", "Fav Customer") + "\",\"language\":\"en\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(res, "$.sessionToken");
    }

    @Test
    void customerFavouritesAndActivityAreOwnOnly() throws Exception {
        String a = customerSession("mock-fav-a-" + UUID.randomUUID());
        String b = customerSession("mock-fav-b-" + UUID.randomUUID());
        var internal = (java.util.function.Function<MockHttpServletRequestBuilder, MockHttpServletRequestBuilder>) r -> r.header("X-Internal-Service-Token", TOKEN);
        mvc.perform(internal.apply(put("/internal/v1/customer/favourites/" + PUBLISHED_PROPERTY)).header("X-Customer-Session", a)).andExpect(status().isNoContent());
        mvc.perform(internal.apply(put("/internal/v1/customer/favourites/" + PUBLISHED_PROPERTY)).header("X-Customer-Session", a)).andExpect(status().isNoContent());
        mvc.perform(internal.apply(put("/internal/v1/customer/favourites/" + DRAFT_PROPERTY)).header("X-Customer-Session", a)).andExpect(status().isUnprocessableEntity());
        mvc.perform(internal.apply(get("/internal/v1/customer/favourites?lang=en")).header("X-Customer-Session", a))
                .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].propertyId").value(PUBLISHED_PROPERTY));
        mvc.perform(internal.apply(get("/internal/v1/customer/favourites?lang=en")).header("X-Customer-Session", b)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(internal.apply(delete("/internal/v1/customer/favourites/" + PUBLISHED_PROPERTY)).header("X-Customer-Session", a)).andExpect(status().isNoContent());
        mvc.perform(internal.apply(get("/internal/v1/customer/favourites")).header("X-Customer-Session", a)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(internal.apply(get("/internal/v1/customer/favourites"))).andExpect(status().isUnauthorized());
        mvc.perform(internal.apply(get("/internal/v1/customer/activity?lang=en")).header("X-Customer-Session", b))
                .andExpect(jsonPath("$.requests.length()").value(0)).andExpect(jsonPath("$.visits.length()").value(0));
    }

    @Test
    void insightsArePublishedByDirectorsOnly() throws Exception {
        String slug = "guide-" + UUID.randomUUID().toString().substring(0, 8);
        String body = """
                {"kind":"article","category":"guide","authorName":"UNAVORA team","en":{"title":"Buying guide %s","slug":"%s","excerpt":"Steps","body":"Para one.\\n\\nPara two."}}"""
                .formatted(slug, slug);
        mvc.perform(post("/api/v1/staff/content/articles").with(bearer(EMPLOYEE_1)).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        String id = JsonPath.read(mvc.perform(post("/api/v1/staff/content/articles").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(get("/api/v1/public/articles/" + slug + "?lang=en")).andExpect(status().isNotFound());   // draft
        mvc.perform(post("/api/v1/staff/content/articles/" + id + "/status").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"published\"}")).andExpect(jsonPath("$.status").value("published"));
        mvc.perform(get("/api/v1/public/articles/" + slug + "?lang=en")).andExpect(jsonPath("$.body").value("Para one.\n\nPara two."))
                .andExpect(jsonPath("$.article.authorName").value("UNAVORA team"));
        mvc.perform(get("/api/v1/public/articles?lang=en&category=guide&q=" + slug)).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/v1/public/articles/" + slug + "?lang=hi")).andExpect(status().isNotFound());   // no Hindi translation
        mvc.perform(post("/api/v1/staff/content/articles").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"kind\":\"video\",\"category\":\"company\",\"authorName\":\"x\",\"en\":{\"title\":\"V\",\"slug\":\"v-" + slug + "\",\"body\":\"b\"}}"))
                .andExpect(status().isUnprocessableEntity());   // video needs a YouTube id
        mvc.perform(post("/api/v1/staff/content/articles").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());   // slug taken
        mvc.perform(get("/api/v1/public/articles?lang=en&category=gossip")).andExpect(status().isBadRequest());
    }

    @Test
    void testimonialsNeedRecordedPermissionToDisplay() throws Exception {
        mvc.perform(post("/api/v1/staff/content/testimonials").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"displayName\":\"R. S.\",\"rating\":5,\"body\":\"Helpful team\",\"consentConfirmed\":false,\"publish\":true}"))
                .andExpect(status().isUnprocessableEntity());
        String name = "Customer " + UUID.randomUUID().toString().substring(0, 6);
        mvc.perform(post("/api/v1/staff/content/testimonials").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"displayName\":\"" + name + "\",\"rating\":5,\"body\":\"Clear answers and a good site visit.\",\"consentConfirmed\":true,"
                        + "\"consentNote\":\"Email permission 2026-11-09\",\"publish\":true}")).andExpect(status().isCreated());
        mvc.perform(get("/api/v1/public/testimonials?lang=en")).andExpect(jsonPath("$[*].displayName", hasItem(name)));
        // a review without recorded permission can never be published (DB check)
        UUID raw = jdbc.sql("INSERT INTO reviews (rating, body) VALUES (4, 'no consent') RETURNING id").query(UUID.class).single();
        mvc.perform(post("/api/v1/staff/content/testimonials/" + raw + "/status").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"published\"}")).andExpect(status().isConflict());
    }

    @Test
    void cityIntroductionsAndCompanyFactsAreDirectorManaged() throws Exception {
        mvc.perform(put("/api/v1/staff/content/locations/prayagraj").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"en\":{\"title\":\"Property in Prayagraj\",\"intro\":\"Line one.\\nLine \\\"two\\\".\"},\"published\":true}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/public/location-content/prayagraj?lang=en")).andExpect(jsonPath("$.intro").value("Line one.\nLine \"two\"."));
        mvc.perform(put("/api/v1/staff/content/locations/prayagraj").with(bearer(EMPLOYEE_1)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"en\":{\"title\":\"x\",\"intro\":\"y\"},\"published\":true}")).andExpect(status().isForbidden());

        mvc.perform(put("/api/v1/staff/content/company/settings/social.example").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"value\":\"http://insecure.example\",\"verified\":true}")).andExpect(status().isUnprocessableEntity());
        mvc.perform(put("/api/v1/staff/content/company/settings/social.example").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"value\":\"https://example.test/unavora\",\"verified\":true}")).andExpect(status().isNoContent());
        try {
            mvc.perform(get("/api/v1/public/company")).andExpect(jsonPath("$.social.example").value("https://example.test/unavora"));
        } finally {
            mvc.perform(put("/api/v1/staff/content/company/settings/social.example").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"value\":\"https://example.test/unavora\",\"verified\":false}")).andExpect(status().isNoContent());
        }
        mvc.perform(get("/api/v1/public/company")).andExpect(jsonPath("$.social.example").doesNotExist());
        mvc.perform(put("/api/v1/staff/content/company/settings/company.phone").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"value\":\"12345\",\"verified\":false}")).andExpect(status().isUnprocessableEntity());
        mvc.perform(get("/api/v1/staff/content/company").with(bearer(EMPLOYEE_1))).andExpect(status().isForbidden());
    }
}
