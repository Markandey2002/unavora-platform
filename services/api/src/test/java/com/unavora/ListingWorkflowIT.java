package com.unavora;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.unavora.platform.RateLimiter;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;

/**
 * CRM listing workflow (draft -> review -> publish), photo pipeline (scan -> private -> approval -> public copy) and
 * the director's "Create Draft Listing" from an approved owner submission.
 */
class ListingWorkflowIT extends IntegrationTestBase {
    static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H', 'D', 'R', 1, 2, 3, 4};
    static final String LOCALITY = "10000000-0000-0000-0000-000000000001";

    @Autowired JdbcClient jdbc;
    @Autowired RateLimiter limiter;

    @BeforeEach
    void reset() { limiter.reset(); }

    private String body(String slug, String description) {
        return """
                {"typeCode":"apartment","localityId":"%s","purpose":"sale","priceAmount":7500000,"areaUnit":"sq_ft","builtUpArea":1200,
                 "bedrooms":2,"bathrooms":2,"amenityCodes":["lift"],"en":{"title":"Workflow test flat","slug":"%s","description":%s}}"""
                .formatted(LOCALITY, slug, description == null ? "null" : "\"" + description + "\"");
    }

    @Test
    void draftReviewPublishWithRolesAndPhotoApproval() throws Exception {
        String slug = "workflow-test-" + UUID.randomUUID().toString().substring(0, 8);
        String created = mvc.perform(post("/api/v1/staff/properties").with(bearer(EMPLOYEE_1)).contentType(MediaType.APPLICATION_JSON).content(body(slug, null)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(created, "$.id");
        String base = "/api/v1/staff/properties/" + id;

        // another employee cannot see it; the incomplete draft cannot be submitted
        mvc.perform(get(base).with(bearer(EMPLOYEE_2))).andExpect(status().isNotFound());
        mvc.perform(post(base + "/submit").with(bearer(EMPLOYEE_1))).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("incomplete"));
        mvc.perform(put(base).with(bearer(EMPLOYEE_1)).contentType(MediaType.APPLICATION_JSON)
                .content(body(slug, "A bright two-bedroom flat close to the metro station, with lift and parking."))).andExpect(status().isOk());
        mvc.perform(post(base + "/submit").with(bearer(EMPLOYEE_1))).andExpect(jsonPath("$.status").value("pending_review"));

        // employees cannot review or publish; rejection needs a reason; editing a rejected listing returns it to draft
        mvc.perform(post(base + "/review").with(bearer(EMPLOYEE_1)).contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"approved\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post(base + "/review").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"rejected\"}"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(post(base + "/review").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"rejected\",\"note\":\"Add the floor\"}"))
                .andExpect(jsonPath("$.status").value("rejected"));
        mvc.perform(put(base).with(bearer(EMPLOYEE_1)).contentType(MediaType.APPLICATION_JSON)
                .content(body(slug, "A bright two-bedroom flat on the 4th floor, close to the metro station, with lift."))).andExpect(jsonPath("$.status").value("draft"));
        mvc.perform(post(base + "/submit").with(bearer(EMPLOYEE_1))).andExpect(status().isOk());
        mvc.perform(post(base + "/review").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"approved\"}"))
                .andExpect(jsonPath("$.status").value("approved"));
        mvc.perform(get("/api/v1/public/properties/" + slug + "?lang=en")).andExpect(status().isNotFound());   // approved is not yet public
        mvc.perform(post(base + "/publish").with(bearer(EMPLOYEE_1))).andExpect(status().isForbidden());

        // photos: clean upload stays private until approved; approval needs alt text; infected files are refused
        String up = mvc.perform(multipart(base + "/media").file(new MockMultipartFile("file", "front.png", "image/png", PNG))
                        .param("kind", "actual_photo").with(bearer(EMPLOYEE_1)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String mid = JsonPath.read(up, "$.id");
        byte[] eicar = ("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*").getBytes(StandardCharsets.US_ASCII);
        byte[] infected = new byte[PNG.length + eicar.length];
        System.arraycopy(PNG, 0, infected, 0, PNG.length);
        System.arraycopy(eicar, 0, infected, PNG.length, eicar.length);
        mvc.perform(multipart(base + "/media").file(new MockMultipartFile("file", "bad.png", "image/png", infected)).with(bearer(EMPLOYEE_1)))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("file_rejected"));
        mvc.perform(post(base + "/media/" + mid + "/approve").with(bearer(EMPLOYEE_1))).andExpect(status().isForbidden());
        mvc.perform(post(base + "/media/" + mid + "/approve").with(bearer(DIRECTOR))).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("alt_required"));
        mvc.perform(put(base + "/media/" + mid).with(bearer(EMPLOYEE_1)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"kind\":\"actual_photo\",\"altEn\":\"Front of the building\",\"captionEn\":\"Entrance\"}")).andExpect(status().isOk());
        mvc.perform(post(base + "/media/" + mid + "/approve").with(bearer(DIRECTOR))).andExpect(status().isOk())
                .andExpect(jsonPath("$.media[0].public").value(true)).andExpect(jsonPath("$.media[0].scanStatus").value("clean"));
        var keys = jdbc.sql("SELECT storage_key, original_key FROM property_media WHERE id = :m").param("m", UUID.fromString(mid))
                .query((rs, n) -> new String[]{rs.getString(1), rs.getString(2)}).single();
        assertTrue(!keys[0].equals(keys[1]), "the public copy has its own key");
        mvc.perform(post(base + "/media/" + mid + "/primary").with(bearer(DIRECTOR))).andExpect(jsonPath("$.media[0].primary").value(true));

        mvc.perform(post(base + "/publish").with(bearer(DIRECTOR))).andExpect(jsonPath("$.status").value("published"));
        mvc.perform(get("/api/v1/public/properties/" + slug + "?lang=en")).andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.title").value("Workflow test flat"));
        mvc.perform(post(base + "/unpublish").with(bearer(DIRECTOR))).andExpect(jsonPath("$.status").value("withdrawn"));
        mvc.perform(get("/api/v1/public/properties/" + slug + "?lang=en")).andExpect(status().isNotFound());
        List<String> trail = jdbc.sql("SELECT to_status FROM listing_status_history WHERE property_id = :p ORDER BY changed_at, to_status")
                .param("p", UUID.fromString(id)).query(String.class).list();
        assertTrue(trail.containsAll(List.of("draft", "pending_review", "rejected", "approved", "published", "withdrawn")), trail.toString());
    }

    @Test
    void approvedOwnerSubmissionBecomesOneDraftListingWithOnlyCleanPhotos() throws Exception {
        String phone = "98" + String.format("%08d", java.util.concurrent.ThreadLocalRandom.current().nextInt(100_000_000));
        String res = mvc.perform(multipart("/api/v1/public/property-submissions")
                        .file(new MockMultipartFile("photos", "a.png", "image/png", PNG))
                        .param("name", "Owner Convert").param("phone", phone).param("city", "Noida").param("locality", "Sector 50")
                        .param("propertyType", "villa").param("purpose", "sale").param("expectedPrice", "21000000")
                        .param("area", "2400").param("areaUnit", "sq_ft").param("message", "Corner villa").param("consent", "true"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String ref = JsonPath.read(res, "$.reference");
        UUID sid = jdbc.sql("SELECT s.id FROM property_submissions s JOIN leads l ON l.id = s.lead_id WHERE l.public_ref = :r").param("r", ref).query(UUID.class).single();
        String sbase = "/api/v1/staff/submissions/" + sid;
        String detail = mvc.perform(get(sbase).with(bearer(DIRECTOR))).andReturn().getResponse().getContentAsString();
        String fileId = JsonPath.read(detail, "$.photos[0].id");
        assertEquals("clean", JsonPath.read(detail, "$.photos[0].scanStatus"));

        // not approved yet -> refused
        String convert = "{\"localityId\":\"" + LOCALITY + "\",\"fileIds\":[\"" + fileId + "\"]}";
        mvc.perform(post(sbase + "/create-listing").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content(convert))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("not_approved"));
        mvc.perform(post(sbase + "/review").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"Checked\"}")).andExpect(status().isOk());
        mvc.perform(post(sbase + "/decision").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"approved\",\"note\":\"Go\"}")).andExpect(status().isOk());

        // employees cannot convert; an unscanned photo cannot be carried over
        mvc.perform(post(sbase + "/create-listing").with(bearer(EMPLOYEE_1)).contentType(MediaType.APPLICATION_JSON).content(convert)).andExpect(status().isForbidden());
        UUID unscanned = jdbc.sql("""
                INSERT INTO property_submission_files (submission_id, storage_key, original_name, content_type, size_bytes, sha256, scan_status)
                VALUES (:s, :k, 'raw.png', 'image/png', 20, repeat('0', 64), 'not_scanned') RETURNING id""")
                .param("s", sid).param("k", UUID.randomUUID() + ".png").query(UUID.class).single();
        mvc.perform(post(sbase + "/create-listing").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"localityId\":\"" + LOCALITY + "\",\"fileIds\":[\"" + unscanned + "\"]}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("not_scanned"));

        String made = mvc.perform(post(sbase + "/create-listing").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content(convert))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.photos").value(1)).andReturn().getResponse().getContentAsString();
        String pid = JsonPath.read(made, "$.propertyId");
        mvc.perform(post(sbase + "/create-listing").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content(convert))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("already_converted"));

        mvc.perform(get("/api/v1/staff/properties/" + pid).with(bearer(DIRECTOR)))
                .andExpect(jsonPath("$.status").value("draft"))
                .andExpect(jsonPath("$.submissionRef").value(ref))
                .andExpect(jsonPath("$.typeCode").value("villa"))
                .andExpect(jsonPath("$.priceAmount").value(21000000))
                .andExpect(jsonPath("$.media.length()").value(1))
                .andExpect(jsonPath("$.media[0].public").value(false))
                .andExpect(jsonPath("$.media[0].approvedAt").doesNotExist());
        mvc.perform(get(sbase).with(bearer(DIRECTOR))).andExpect(jsonPath("$.propertyId").value(pid));
        assertEquals(0, jdbc.sql("SELECT count(*) FROM properties WHERE id = :p AND status = 'published'").param("p", UUID.fromString(pid)).query(Integer.class).single());
    }

    @Test
    @org.springframework.transaction.annotation.Transactional
    void mapsRespectHiddenExactLocationAndRatingsAreNeverInvented() throws Exception {
        String slug = "sample-3bhk-apartment-sector-37-noida";
        UUID pid = jdbc.sql("SELECT property_id FROM property_translations WHERE slug = :s").param("s", slug).query(UUID.class).single();
        UUID loc = jdbc.sql("SELECT locality_id FROM properties WHERE id = :p").param("p", pid).query(UUID.class).single();
        jdbc.sql("UPDATE localities SET latitude = NULL, longitude = NULL WHERE id = :l").param("l", loc).update();
        jdbc.sql("UPDATE properties SET latitude = 28.570001, longitude = 77.350002, hide_exact_location = true WHERE id = :p").param("p", pid).update();
        // exact coordinates exist but are hidden, and the locality has no area position: no map at all
        mvc.perform(get("/api/v1/public/properties/" + slug + "?lang=en")).andExpect(jsonPath("$.map").doesNotExist());
        mvc.perform(put("/api/v1/staff/localities/" + loc + "/position").with(bearer(EMPLOYEE_1)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"latitude\":28.57,\"longitude\":77.35}")).andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/staff/localities/" + loc + "/position").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"latitude\":28.57,\"longitude\":77.35}")).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/public/properties/" + slug + "?lang=en"))
                .andExpect(jsonPath("$.map.precision").value("approximate")).andExpect(jsonPath("$.map.latitude").value(28.57));
        jdbc.sql("UPDATE properties SET hide_exact_location = false WHERE id = :p").param("p", pid).update();
        mvc.perform(get("/api/v1/public/properties/" + slug + "?lang=en"))
                .andExpect(jsonPath("$.map.precision").value("exact")).andExpect(jsonPath("$.map.latitude").value(28.570001));

        // a testimonial without a rating is stored without one (never a default star rating)
        mvc.perform(post("/api/v1/staff/content/testimonials").with(bearer(DIRECTOR)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"displayName\":\"R. Verma\",\"rating\":null,\"body\":\"Helpful site visit\",\"consentConfirmed\":true,\"consentNote\":\"Email 9 Nov\",\"publish\":true}"))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/v1/public/testimonials?lang=en"))
                .andExpect(jsonPath("$[?(@.displayName=='R. Verma')].rating").value(org.hamcrest.Matchers.contains((Object) null)));
    }
}
