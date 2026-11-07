package com.unavora;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** The first vertical slice: customer enquires -> lead stored -> employee sees it -> director sees totals. */
class EnquiryAndLeadFlowIT extends IntegrationTestBase {

    @Autowired JdbcClient jdbc;
    @Autowired RateLimiter limiter;

    @BeforeEach
    void reset() { limiter.reset(); }

    static RequestPostProcessor as(String userId) { return IntegrationTestBase.bearer(userId); }

    static String body(String phone, String propertyId, boolean consent) {
        return """
            {"name":"Test Buyer","phone":"%s","email":"buyer@example.test","message":"Interested",
             "propertyId":%s,"language":"en","consent":%s}""".formatted(phone, propertyId == null ? "null" : "\"" + propertyId + "\"", consent);
    }

    @Test
    void propertyEnquiryCreatesAssignedLeadAndSideEffects() throws Exception {
        String res = mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON)
                        .content(body("9876543210", PUBLISHED_PROPERTY, true)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.reference", startsWith("LEAD-")))
                .andReturn().getResponse().getContentAsString();
        String ref = JsonPath.read(res, "$.reference");

        var assigned = jdbc.sql("SELECT assigned_user_id::text FROM leads WHERE public_ref = :r").param("r", ref).query(String.class).single();
        org.junit.jupiter.api.Assertions.assertEquals(EMPLOYEE_1, assigned);
        org.junit.jupiter.api.Assertions.assertEquals(1, jdbc.sql("SELECT count(*) FROM customers WHERE phone_e164 = '+919876543210'").query(Integer.class).single());
        org.junit.jupiter.api.Assertions.assertEquals(1, jdbc.sql("SELECT count(*) FROM outbox_events o JOIN leads l ON l.id::text = o.aggregate_id WHERE l.public_ref = :r").param("r", ref).query(Integer.class).single());
        org.junit.jupiter.api.Assertions.assertEquals(1, jdbc.sql("""
                SELECT count(*) FROM audit_logs a JOIN leads l ON l.id::text = a.entity_id
                WHERE a.action = 'lead.created_public' AND l.public_ref = :r""").param("r", ref).query(Integer.class).single());
        // Enquiry consent is recorded with the notice version, against the same customer.
        org.junit.jupiter.api.Assertions.assertEquals(1, jdbc.sql("""
                SELECT count(*) FROM customer_consents cc JOIN customers c ON c.id = cc.customer_id
                WHERE c.phone_e164 = '+919876543210' AND cc.purpose = 'service_contact' AND cc.granted
                  AND cc.notice_version IS NOT NULL""").query(Integer.class).single());
    }

    @Test
    void repeatedSubmissionWithSameIdempotencyKeyReturnsSameLead() throws Exception {
        String key = UUID.randomUUID().toString();
        String first = mvc.perform(post("/api/v1/public/enquiries").header("Idempotency-Key", key)
                .contentType(MediaType.APPLICATION_JSON).content(body("9876500001", null, true)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String second = mvc.perform(post("/api/v1/public/enquiries").header("Idempotency-Key", key)
                .contentType(MediaType.APPLICATION_JSON).content(body("9876500001", null, true)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        org.junit.jupiter.api.Assertions.assertEquals(JsonPath.<String>read(first, "$.reference"), JsonPath.<String>read(second, "$.reference"));
    }

    @Test
    void sameSharedPhoneReusesCustomer() throws Exception {
        for (int i = 0; i < 2; i++) {
            mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON)
                    .content(body("+919876500002", null, true))).andExpect(status().isCreated());
        }
        org.junit.jupiter.api.Assertions.assertEquals(1, jdbc.sql("SELECT count(*) FROM customers WHERE phone_e164 = '+919876500002'").query(Integer.class).single());
        org.junit.jupiter.api.Assertions.assertEquals(2, jdbc.sql("SELECT count(*) FROM leads l JOIN customers c ON c.id = l.customer_id WHERE c.phone_e164 = '+919876500002'").query(Integer.class).single());
    }

    @Test
    void validationAndAvailabilityRulesAreEnforced() throws Exception {
        mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON)
                .content(body("12345", null, true))).andExpect(status().isUnprocessableEntity());
        mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON)
                .content(body("9876500003", null, false))).andExpect(status().isUnprocessableEntity());
        mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON)
                .content(body("9876500004", DRAFT_PROPERTY, true))).andExpect(status().isUnprocessableEntity());
        mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON)
                .content(body("9876500005", SOLD_PROPERTY, true))).andExpect(status().isUnprocessableEntity());
    }

    @Test
    void publicEnquiryIsRateLimitedPerIp() throws Exception {
        for (int i = 0; i < 10; i++) {
            mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON)
                    .content(body("98765001" + String.format("%02d", i), null, true))).andExpect(status().isCreated());
        }
        mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON)
                .content(body("9876500199", null, true))).andExpect(status().isTooManyRequests());
    }

    @Test
    void rateLimitIsPerVisitorWhenForwardedByTheWebServer() throws Exception {
        // The Next.js server forwards the visitor IP; one busy visitor must not block everyone else.
        for (int i = 0; i < 10; i++) {
            mvc.perform(post("/api/v1/public/enquiries").header("X-Forwarded-For", "203.0.113.10")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body("98765002" + String.format("%02d", i), null, true))).andExpect(status().isCreated());
        }
        mvc.perform(post("/api/v1/public/enquiries").header("X-Forwarded-For", "203.0.113.10")
                .contentType(MediaType.APPLICATION_JSON).content(body("9876500299", null, true)))
                .andExpect(status().isTooManyRequests());
        mvc.perform(post("/api/v1/public/enquiries").header("X-Forwarded-For", "203.0.113.11")
                .contentType(MediaType.APPLICATION_JSON).content(body("9876500298", null, true)))
                .andExpect(status().isCreated());
    }

    @Test
    void staffEndpointsRequireAuthentication() throws Exception {
        mvc.perform(get("/api/v1/staff/leads")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/director/overview")).andExpect(status().isUnauthorized());
    }

    @Test
    void employeeSeesOnlyOwnLeads() throws Exception {
        mvc.perform(get("/api/v1/staff/leads").with(as(EMPLOYEE_1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.reference=='LEAD-LOCAL-1')]", hasSize(1)))
                .andExpect(jsonPath("$.items[?(@.reference=='LEAD-LOCAL-2')]", hasSize(0)));
    }

    @Test
    void employeeCannotOpenAnotherEmployeesLead() throws Exception {
        String lead2 = "40000000-0000-0000-0000-000000000002";
        mvc.perform(get("/api/v1/staff/leads/" + lead2).with(as(EMPLOYEE_1))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/staff/leads/" + lead2).with(as(EMPLOYEE_2))).andExpect(status().isOk());
    }

    @Test
    void directorSeesAllLeadsAndOverview() throws Exception {
        // By id (the shared test DB accumulates leads from other tests, so page 1 order is not stable).
        mvc.perform(get("/api/v1/staff/leads/40000000-0000-0000-0000-000000000001").with(as(DIRECTOR)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reference").value("LEAD-LOCAL-1"));
        mvc.perform(get("/api/v1/staff/leads/40000000-0000-0000-0000-000000000002").with(as(DIRECTOR)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reference").value("LEAD-LOCAL-2"));
        mvc.perform(get("/api/v1/staff/leads?limit=50").with(as(DIRECTOR)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.assignedUserId=='" + EMPLOYEE_1 + "')]", org.hamcrest.Matchers.not(org.hamcrest.Matchers.empty())))
                .andExpect(jsonPath("$.items[?(@.assignedUserId=='" + EMPLOYEE_2 + "')]", org.hamcrest.Matchers.not(org.hamcrest.Matchers.empty())));
        mvc.perform(get("/api/v1/director/overview").with(as(DIRECTOR)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.publishedProperties").value(4));
    }

    @Test
    void employeeCannotUseDirectorEndpoint() throws Exception {
        mvc.perform(get("/api/v1/director/overview").with(as(EMPLOYEE_1))).andExpect(status().isForbidden());
    }

    @Test
    void unknownSubjectGetsNoAccess() throws Exception {
        mvc.perform(get("/api/v1/staff/leads").with(as(UUID.randomUUID().toString()))).andExpect(status().isForbidden());
    }
}
