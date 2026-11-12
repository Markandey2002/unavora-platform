package com.unavora;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

/**
 * Illustrative showcase items (V18): drafts hidden, director-only publishing, approved image required, no price or
 * property facts in the public payload, never in property search, and enquiries become general CRM leads WITHOUT a
 * property or project id (real listing enquiries keep the real id).
 */
@Transactional
@TestPropertySource(properties = "unavora.media.public-base-url=http://media.test/m")
class ShowcaseIT extends IntegrationTestBase {
    static final String SC = "/api/v1/staff/cms/showcase";
    static final byte[] PNG = SiteCmsIT.PNG;

    @Autowired JdbcClient jdbc;

    private String approvedImage() throws Exception {
        String up = mvc.perform(multipart("/api/v1/staff/cms/media").file(new MockMultipartFile("file", "villa.png", "image/png", PNG))
                        .param("kind", "representative").param("altEn", "Contemporary villa with a garden")
                        .param("licence", "Unsplash License").param("credit", "Unsplash photo-test").with(bearer(DIRECTOR)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(up, "$.id");
        mvc.perform(post("/api/v1/staff/cms/media/" + id + "/approve").with(bearer(DIRECTOR))).andExpect(status().isOk());
        return id;
    }

    private String create(String json) throws Exception {
        String r = mvc.perform(post(SC).with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(r, "$.id");
    }

    @Test
    void showcaseIsHiddenUntilPublishedAndCarriesNoPropertyFacts() throws Exception {
        mvc.perform(post(SC).with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content("{\"category\":\"castle\",\"titleEn\":\"x\",\"descriptionEn\":\"y\"}"))
                .andExpect(status().isUnprocessableEntity());
        String id = create("{\"category\":\"villa\",\"titleEn\":\"Garden villa living\",\"titleHi\":\"बगीचे वाला विला\","
                + "\"descriptionEn\":\"Independent homes with private gardens.\",\"cta\":\"enquire\"}");
        mvc.perform(get("/api/v1/public/showcase?lang=en")).andExpect(jsonPath("$[*].title", not(hasItem("Garden villa living"))));

        // publishing needs the director and an approved image
        mvc.perform(post(SC + "/" + id + "/submit").with(bearer(EMPLOYEE_1))).andExpect(status().isForbidden());   // employee lacks cms.manage
        mvc.perform(post(SC + "/" + id + "/publish").with(bearer(DIRECTOR))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("image_not_approved"));
        String img = approvedImage();
        mvc.perform(put(SC + "/" + id).with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"category\":\"villa\",\"titleEn\":\"Garden villa living\",\"titleHi\":\"बगीचे वाला विला\",\"descriptionEn\":\"Independent homes with private gardens.\",\"imageMediaId\":\"" + img + "\"}"))
                .andExpect(status().isOk());
        mvc.perform(post(SC + "/" + id + "/submit").with(bearer(DIRECTOR))).andExpect(jsonPath("$.status").value("in_review"));
        mvc.perform(get("/api/v1/public/showcase?lang=en")).andExpect(jsonPath("$[*].title", not(hasItem("Garden villa living"))));
        mvc.perform(post(SC + "/" + id + "/publish").with(bearer(DIRECTOR))).andExpect(jsonPath("$.status").value("published"));

        String pub = mvc.perform(get("/api/v1/public/showcase?lang=hi&category=villa")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("बगीचे वाला विला"))
                .andExpect(jsonPath("$[0].illustrative").value(true))
                .andExpect(jsonPath("$[0].image.kind").value("representative"))
                .andReturn().getResponse().getContentAsString();
        Map<String, Object> item = JsonPath.read(pub, "$[0]");
        for (String forbidden : new String[]{"price", "priceAmount", "area", "possession", "rera", "developer", "address", "availability", "slug"}) {
            assertNull(item.get(forbidden), "showcase must not expose " + forbidden);
        }
        // never in real property search
        mvc.perform(get("/api/v1/public/properties?lang=en&limit=50")).andExpect(jsonPath("$.items[*].title", not(hasItem("Garden villa living"))));
        mvc.perform(get("/api/v1/public/properties?lang=en&q=Garden%20villa")).andExpect(jsonPath("$.items[*].id", not(hasItem(id))));

        // archive removes it from the site and is audited
        mvc.perform(post(SC + "/" + id + "/archive").with(bearer(DIRECTOR))).andExpect(jsonPath("$.status").value("archived"))
                .andExpect(jsonPath("$.history[*].action", hasItem("cms.showcase.publish")));
        mvc.perform(get("/api/v1/public/showcase?lang=en")).andExpect(jsonPath("$[*].title", not(hasItem("Garden villa living"))));
        mvc.perform(post(SC + "/" + id + "/publish").with(bearer(DIRECTOR))).andExpect(status().isConflict());
    }

    @Test
    void linkToARealRecordMustBePublished() throws Exception {
        String img = approvedImage();
        mvc.perform(post(SC).with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"category\":\"residential\",\"titleEn\":\"x\",\"descriptionEn\":\"y\",\"cta\":\"view_record\"}"))
                .andExpect(status().isUnprocessableEntity());
        String draftLinked = create("{\"category\":\"residential\",\"titleEn\":\"Linked draft\",\"descriptionEn\":\"y\",\"cta\":\"view_record\",\"imageMediaId\":\"" + img
                + "\",\"linkedPropertyId\":\"" + DRAFT_PROPERTY + "\"}");
        mvc.perform(post(SC + "/" + draftLinked + "/publish").with(bearer(DIRECTOR))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("link_not_published"));
        String linked = create("{\"category\":\"residential\",\"titleEn\":\"See the real flat\",\"descriptionEn\":\"y\",\"cta\":\"view_record\",\"imageMediaId\":\"" + img
                + "\",\"linkedPropertyId\":\"" + PUBLISHED_PROPERTY + "\"}");
        mvc.perform(post(SC + "/" + linked + "/publish").with(bearer(DIRECTOR))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/public/showcase?lang=en&category=residential"))
                .andExpect(jsonPath("$[?(@.title=='See the real flat')].link.type").value(hasItem("property")))
                .andExpect(jsonPath("$[?(@.title=='See the real flat')].cta").value(hasItem("view_record")));
    }

    @Test
    void showcaseEnquiryCreatesAGeneralLeadWithoutAPropertyId() throws Exception {
        String img = approvedImage();
        String id = create("{\"category\":\"office\",\"titleEn\":\"Office floors\",\"descriptionEn\":\"Workspaces for growing teams.\",\"imageMediaId\":\"" + img + "\"}");
        String body = "{\"name\":\"Showcase Visitor\",\"phone\":\"9811122233\",\"consent\":true,\"marketingConsent\":false,"
                + "\"showcaseId\":\"" + id + "\",\"preferredLocation\":\"Noida Sector 62\"}";
        mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("showcase_unavailable"));   // still a draft
        mvc.perform(post(SC + "/" + id + "/publish").with(bearer(DIRECTOR))).andExpect(status().isOk());
        String res = mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String ref = JsonPath.read(res, "$.reference");
        Map<String, Object> lead = jdbc.sql("""
                SELECT l.interested_property_id, l.interested_project_id, l.enquiry_type, l.campaign, l.preferred_location, s.code AS source
                FROM leads l JOIN lead_sources s ON s.id = l.source_id WHERE l.public_ref = :r""").param("r", ref).query().singleRow();
        assertNull(lead.get("interested_property_id"));
        assertNull(lead.get("interested_project_id"));
        assertEquals("commercial", lead.get("enquiry_type"));
        assertEquals("showcase:office", lead.get("campaign"));
        assertEquals("Noida Sector 62", lead.get("preferred_location"));
        assertEquals("website_showcase", lead.get("source"));
        // service consent recorded; marketing consent recorded separately as declined
        assertEquals(1, jdbc.sql("""
                SELECT count(*) FROM customer_consents cc JOIN customers c ON c.id = cc.customer_id
                WHERE c.phone_e164 = '+919811122233' AND cc.purpose = 'service_contact' AND cc.granted""").query(Integer.class).single());
        assertEquals(1, jdbc.sql("""
                SELECT count(*) FROM customer_consents cc JOIN customers c ON c.id = cc.customer_id
                WHERE c.phone_e164 = '+919811122233' AND cc.purpose = 'marketing_whatsapp' AND NOT cc.granted""").query(Integer.class).single());

        // property + showcase together is refused; a real listing enquiry keeps the real property id
        mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"A\",\"phone\":\"9811122244\",\"consent\":true,\"showcaseId\":\"" + id + "\",\"propertyId\":\"" + PUBLISHED_PROPERTY + "\"}"))
                .andExpect(status().isUnprocessableEntity());
        String real = mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"B\",\"phone\":\"9811122255\",\"consent\":true,\"propertyId\":\"" + PUBLISHED_PROPERTY + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        assertEquals(PUBLISHED_PROPERTY, jdbc.sql("SELECT interested_property_id::text FROM leads WHERE public_ref = :r")
                .param("r", (String) JsonPath.read(real, "$.reference")).query(String.class).single());
    }

    @Test
    void newLaunchInterestIsAProjectLeadWithoutAProjectId() throws Exception {
        String res = mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Launch Visitor\",\"phone\":\"9811122266\",\"consent\":true,\"context\":\"new_launches\",\"preferredLocation\":\"Lucknow\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Map<String, Object> lead = jdbc.sql("""
                SELECT l.interested_project_id, l.enquiry_type, l.campaign, s.code AS source FROM leads l JOIN lead_sources s ON s.id = l.source_id
                WHERE l.public_ref = :r""").param("r", (String) JsonPath.read(res, "$.reference")).query().singleRow();
        assertNull(lead.get("interested_project_id"));
        assertEquals("project", lead.get("enquiry_type"));
        assertEquals("new-launches-interest", lead.get("campaign"));
        assertEquals("website_showcase", lead.get("source"));
        mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"X\",\"phone\":\"9811122277\",\"consent\":true,\"context\":\"anything\"}"))
                .andExpect(status().isUnprocessableEntity());
    }
}
