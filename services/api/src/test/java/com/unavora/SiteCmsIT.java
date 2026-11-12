package com.unavora;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.annotation.Transactional;

/** Director CMS: draft vs live content, submit/publish permissions, preview, associations rules, image licences, social links. */
@Transactional
class SiteCmsIT extends IntegrationTestBase {
    static final String CMS = "/api/v1/staff/cms";
    static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H', 'D', 'R', 9};

    @Test
    void heroDraftIsInvisibleUntilPublishedAndEditsDoNotChangeTheLiveVersion() throws Exception {
        String v1 = "{\"en\":{\"title\":\"Homes you can trust\",\"sub\":\"Approved listings only\"},\"hi\":{\"title\":\"भरोसेमंद घर\"}}";
        mvc.perform(put(CMS + "/blocks/home.hero").with(bearer(EMPLOYEE_1)).contentType(MediaType.APPLICATION_JSON).content(v1)).andExpect(status().isForbidden());
        mvc.perform(put(CMS + "/blocks/home.hero").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content("{\"en\":{\"sub\":\"no title\"}}"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(put(CMS + "/blocks/home.hero").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"en\":{\"title\":\"<script>x</script>Title\",\"unknown\":\"dropped\"}}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.draft.en.unknown").doesNotExist());
        mvc.perform(put(CMS + "/blocks/home.hero").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content(v1))
                .andExpect(jsonPath("$.status").value("draft"));

        mvc.perform(get("/api/v1/public/site-blocks?lang=en")).andExpect(jsonPath("$.hero").doesNotExist());
        mvc.perform(get(CMS + "/preview?lang=en").with(bearer(DIRECTOR))).andExpect(jsonPath("$.hero.title").value("Homes you can trust"));
        mvc.perform(post(CMS + "/blocks/home.hero/submit").with(bearer(DIRECTOR))).andExpect(jsonPath("$.status").value("in_review"));
        mvc.perform(post(CMS + "/blocks/home.hero/publish").with(bearer(DIRECTOR))).andExpect(jsonPath("$.status").value("published"));
        mvc.perform(get("/api/v1/public/site-blocks?lang=hi")).andExpect(jsonPath("$.hero.title").value("भरोसेमंद घर"));

        mvc.perform(put(CMS + "/blocks/home.hero").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content("{\"en\":{\"title\":\"Changed draft\"}}"))
                .andExpect(jsonPath("$.published.en.title").value("Homes you can trust"));
        mvc.perform(get("/api/v1/public/site-blocks?lang=en")).andExpect(jsonPath("$.hero.title").value("Homes you can trust"));
        mvc.perform(post(CMS + "/blocks/home.hero/unpublish").with(bearer(DIRECTOR))).andExpect(jsonPath("$.status").value("unpublished"));
        mvc.perform(get("/api/v1/public/site-blocks?lang=en")).andExpect(jsonPath("$.hero").doesNotExist());
        mvc.perform(get(CMS + "/blocks/home.hero").with(bearer(DIRECTOR))).andExpect(jsonPath("$.history[*].action", hasItem("cms.block.publish")));
    }

    @Test
    void sectionsSeoAndCareersAreValidated() throws Exception {
        mvc.perform(put(CMS + "/blocks/home.sections").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content("{\"order\":[\"casino\"]}"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(put(CMS + "/blocks/home.sections").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content("{\"hidden\":[\"enquiry\"]}"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(put(CMS + "/blocks/home.sections").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"order\":[\"featured\",\"launches\"],\"hidden\":[\"videos\"]}"))
                .andExpect(jsonPath("$.draft.order[0]").value("featured")).andExpect(jsonPath("$.draft.order.length()").value(13));
        mvc.perform(put(CMS + "/blocks/seo.secret").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNotFound());
        mvc.perform(put(CMS + "/blocks/seo.about").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"en\":{\"title\":\"About UNAVORA ANANT INFRA\",\"description\":\"Who we are and how we work with buyers.\"}}")).andExpect(status().isOk());
        mvc.perform(post(CMS + "/blocks/seo.about/publish").with(bearer(DIRECTOR))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/public/site-blocks?lang=en")).andExpect(jsonPath("$.seo['/about'].title").value("About UNAVORA ANANT INFRA"));
        mvc.perform(put(CMS + "/blocks/careers.page").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"en\":{\"title\":\"Careers\"},\"openings\":[{\"title\":\"Sales executive\",\"location\":\"Noida\",\"type\":\"full_time\"},{\"title\":\"Old\",\"location\":\"Lucknow\",\"active\":false}]}"))
                .andExpect(status().isOk());
        mvc.perform(post(CMS + "/blocks/careers.page/publish").with(bearer(DIRECTOR))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/public/site-blocks?lang=en")).andExpect(jsonPath("$.careers.openings.length()").value(1));
    }

    @Test
    void associationsNeedConfirmationAndLogoPermission() throws Exception {
        String body = "{\"name\":\"Sample Builders\",\"relationship\":\"developer_partner\",\"relationshipConfirmed\":false,\"logoPermission\":false}";
        String list = mvc.perform(post(CMS + "/associations").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(list, "$[?(@.name=='Sample Builders')].id").toString().replaceAll("[\\[\\]\"]", "");
        mvc.perform(post(CMS + "/associations/" + id + "/publish").with(bearer(DIRECTOR))).andExpect(status().isConflict());
        mvc.perform(put(CMS + "/associations/" + id).with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Sample Builders\",\"relationship\":\"developer_partner\",\"relationshipConfirmed\":true,\"logoPermission\":false}"))
                .andExpect(status().isUnprocessableEntity());   // confirmation needs a note
        mvc.perform(put(CMS + "/associations/" + id).with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Sample Builders\",\"relationship\":\"developer_partner\",\"relationshipConfirmed\":true,\"relationshipNote\":\"Agreement on file\",\"logoPermission\":false}"))
                .andExpect(status().isOk());
        mvc.perform(post(CMS + "/associations/" + id + "/publish").with(bearer(EMPLOYEE_1))).andExpect(status().isForbidden());
        mvc.perform(post(CMS + "/associations/" + id + "/publish").with(bearer(DIRECTOR))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/public/associations")).andExpect(jsonPath("$[*].name", hasItem("Sample Builders")))
                .andExpect(jsonPath("$[?(@.name=='Sample Builders')].logo").value(org.hamcrest.Matchers.contains((Object) null)));
        mvc.perform(post(CMS + "/associations/" + id + "/unpublish").with(bearer(DIRECTOR))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/public/associations")).andExpect(jsonPath("$[*].name", not(hasItem("Sample Builders"))));
    }

    @Test
    void stockImagesNeedALicenceAndSocialLinksMustBeOfficialProfiles() throws Exception {
        String up = mvc.perform(multipart(CMS + "/media").file(new MockMultipartFile("file", "hero.png", "image/png", PNG))
                        .param("kind", "representative").param("altEn", "Modern apartment towers").with(bearer(DIRECTOR)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String mid = JsonPath.read(up, "$.id");
        mvc.perform(post(CMS + "/media/" + mid + "/approve").with(bearer(DIRECTOR))).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("licence_required"));
        mvc.perform(put(CMS + "/media/" + mid).with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"kind\":\"representative\",\"altEn\":\"Modern apartment towers\",\"licence\":\"Unsplash licence\",\"credit\":\"Photographer name\"}")).andExpect(status().isOk());
        mvc.perform(post(CMS + "/media/" + mid + "/approve").with(bearer(DIRECTOR))).andExpect(status().isOk());
        mvc.perform(multipart(CMS + "/media").file(new MockMultipartFile("file", "x.png", "image/png", PNG)).param("kind", "floor_plan").with(bearer(DIRECTOR)))
                .andExpect(status().isUnprocessableEntity());

        String setting = "/api/v1/staff/content/company/settings/";
        mvc.perform(put(setting + "social.instagram").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"value\":\"https://instagrarn.com/unavora\",\"verified\":true}")).andExpect(status().isUnprocessableEntity());
        mvc.perform(put(setting + "social.instagram").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"value\":\"https://www.instagram.com/unavora_test/\",\"verified\":true}")).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/public/company")).andExpect(jsonPath("$.social.instagram").value("https://www.instagram.com/unavora_test/"));
        mvc.perform(put(setting + "social.instagram").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"value\":\"https://www.instagram.com/unavora_test/\",\"verified\":false}")).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/public/company")).andExpect(jsonPath("$.social.instagram").doesNotExist());
        UUID.randomUUID();
    }
}
