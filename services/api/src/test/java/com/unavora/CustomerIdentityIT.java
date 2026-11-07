package com.unavora;

import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.unavora.platform.RateLimiter;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * Second vertical slice with MOCK adapters (no Google, no WhatsApp provider is contacted):
 * Continue with Google -> one customer profile (no duplicates) -> WhatsApp OTP -> requests become separate leads
 * with separate enquiry/marketing consent -> CRM shows registered customers, contact actions, history, follow-ups.
 */
class CustomerIdentityIT extends IntegrationTestBase {
    static final String TOKEN = "test-internal-token";

    @Autowired JdbcClient jdbc;
    @Autowired RateLimiter limiter;

    @BeforeEach
    void reset() { limiter.reset(); }

    /**
     * A unique synthetic Indian mobile number: prefix (e.g. "+9198") + exactly 8 random digits. Must not depend on
     * System.nanoTime(), whose length differs by platform (CI run #1 on Linux: only 11 digits -> substring crash).
     */
    static String uniquePhone(String prefix) {
        return prefix + String.format("%08d", java.util.concurrent.ThreadLocalRandom.current().nextInt(100_000_000));
    }

    static String b64(String s) { return Base64.getUrlEncoder().withoutPadding().encodeToString(s.getBytes(StandardCharsets.UTF_8)); }

    static String mockCredential(String sub, String email, String name) {
        return "mock-google:" + b64(sub) + ":" + b64(email) + ":" + b64(name);
    }

    static MockHttpServletRequestBuilder internal(MockHttpServletRequestBuilder b) {
        return b.header("X-Internal-Service-Token", TOKEN).contentType(MediaType.APPLICATION_JSON);
    }

    static RequestPostProcessor as(String userId) { return jwt().jwt(j -> j.subject(userId)); }

    String login(String sub, String email) throws Exception {
        String res = mvc.perform(internal(post("/internal/v1/customer-auth/google"))
                        .content("{\"credential\":\"" + mockCredential(sub, email, "Synthetic Customer") + "\",\"language\":\"en\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(res, "$.sessionToken");
    }

    String latestMockCode(String phone) throws Exception {
        String res = mvc.perform(internal(get("/internal/v1/dev/mock-whatsapp/latest")).param("phone", phone))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(res, "$.code");
    }

    String signUpVerified(String sub, String email, String phone) throws Exception {
        String s = login(sub, email);
        mvc.perform(internal(post("/internal/v1/customer/whatsapp/otp")).header("X-Customer-Session", s)
                .content("{\"phone\":\"" + phone + "\"}")).andExpect(status().isAccepted());
        mvc.perform(internal(post("/internal/v1/customer/whatsapp/verify")).header("X-Customer-Session", s)
                .content("{\"phone\":\"" + phone + "\",\"code\":\"" + latestMockCode(phone) + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.whatsappVerified").value(true));
        return s;
    }

    @Test
    void internalEndpointsRequireTheServiceCredentialAndRejectBearerTokens() throws Exception {
        String body = "{\"credential\":\"" + mockCredential("mock-x", "x@example.test", "X") + "\"}";
        mvc.perform(post("/internal/v1/customer-auth/google").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/internal/v1/customer-auth/google").with(as(DIRECTOR)).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/internal/v1/customer-auth/google").header("X-Internal-Service-Token", "wrong")
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized());
        // and the service credential does not open the staff API
        mvc.perform(get("/api/v1/staff/customers").header("X-Internal-Service-Token", TOKEN)).andExpect(status().isUnauthorized());
    }

    @Test
    void firstGoogleLoginCreatesProfileAndLaterLoginsDoNotDuplicate() throws Exception {
        String sub = "mock-" + UUID.randomUUID();
        String email = "first.login." + UUID.randomUUID().toString().substring(0, 8) + "@example.test";
        String res1 = mvc.perform(internal(post("/internal/v1/customer-auth/google"))
                        .content("{\"credential\":\"" + mockCredential(sub, email, "Asha Synthetic") + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.newAccount").value(true))
                .andExpect(jsonPath("$.customer.reference", startsWith("CUS-")))
                .andExpect(jsonPath("$.customer.email").value(email))
                .andExpect(jsonPath("$.customer.whatsappVerified").value(false))
                .andReturn().getResponse().getContentAsString();
        OffsetDateTime firstLogin = jdbc.sql("SELECT last_login_at FROM customer_identities WHERE provider_subject = :s")
                .param("s", sub).query(OffsetDateTime.class).single();

        String res2 = mvc.perform(internal(post("/internal/v1/customer-auth/google"))
                        .content("{\"credential\":\"" + mockCredential(sub, email, "Asha Synthetic") + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.newAccount").value(false))
                .andReturn().getResponse().getContentAsString();

        assertEquals(JsonPath.<String>read(res1, "$.customer.reference"), JsonPath.<String>read(res2, "$.customer.reference"));
        assertNotEquals(JsonPath.<String>read(res1, "$.sessionToken"), JsonPath.<String>read(res2, "$.sessionToken"));
        assertEquals(1, jdbc.sql("SELECT count(*) FROM customer_identities WHERE provider_subject = :s").param("s", sub).query(Integer.class).single());
        assertEquals(1, jdbc.sql("SELECT count(*) FROM customers WHERE email_normalized = :e").param("e", email).query(Integer.class).single());
        var row = jdbc.sql("""
                SELECT ci.provider_subject, ci.email, ci.display_name, ci.login_count, ci.registered_at IS NOT NULL,
                       ci.last_login_at > :first, c.registered_at IS NOT NULL, c.signup_source
                FROM customer_identities ci JOIN customers c ON c.id = ci.customer_id WHERE ci.provider_subject = :s""")
                .param("s", sub).param("first", firstLogin)
                .query((rs, n) -> new Object[]{rs.getString(1), rs.getString(2), rs.getString(3), rs.getInt(4),
                        rs.getBoolean(5), rs.getBoolean(6), rs.getBoolean(7), rs.getString(8)}).single();
        assertEquals(sub, row[0]);                  // Google account id
        assertEquals(email, row[1]);                // Gmail
        assertEquals("Asha Synthetic", row[2]);     // name
        assertEquals(2, row[3]);
        assertEquals(true, row[4]);                 // registration date
        assertEquals(true, row[5]);                 // last login moved forward
        assertEquals(true, row[6]);
        assertEquals("google", row[7]);
        // session works, logout revokes it
        String token = JsonPath.read(res2, "$.sessionToken");
        mvc.perform(internal(get("/internal/v1/customer/me")).header("X-Customer-Session", token)).andExpect(status().isOk());
        mvc.perform(internal(post("/internal/v1/customer-auth/logout")).header("X-Customer-Session", token)).andExpect(status().isNoContent());
        mvc.perform(internal(get("/internal/v1/customer/me")).header("X-Customer-Session", token)).andExpect(status().isUnauthorized());
    }

    @Test
    void invalidOrNonSyntheticMockCredentialsAreRejected() throws Exception {
        mvc.perform(internal(post("/internal/v1/customer-auth/google")).content("{\"credential\":\"eyJhbGciOi.fake.jwt\"}"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("invalid_google_credential"));
        // a subject that does not start with mock- (i.e. looks like a real Google id) is refused by the mock adapter
        mvc.perform(internal(post("/internal/v1/customer-auth/google"))
                        .content("{\"credential\":\"" + mockCredential("117000000000000000001", "a@example.test", "A") + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void whatsAppOtpVerifiesNumberWithAttemptLimit() throws Exception {
        String s = login("mock-" + UUID.randomUUID(), "otp." + UUID.randomUUID().toString().substring(0, 8) + "@example.test");
        String phone = uniquePhone("+9198");
        mvc.perform(internal(post("/internal/v1/customer/whatsapp/otp")).header("X-Customer-Session", s)
                .content("{\"phone\":\"" + phone + "\"}")).andExpect(status().isAccepted())
                .andExpect(jsonPath("$.expiresInSeconds").value(600));
        // resend too soon
        mvc.perform(internal(post("/internal/v1/customer/whatsapp/otp")).header("X-Customer-Session", s)
                .content("{\"phone\":\"" + phone + "\"}")).andExpect(status().isTooManyRequests());
        String code = latestMockCode(phone);
        String wrong = code.equals("000000") ? "111111" : "000000";
        mvc.perform(internal(post("/internal/v1/customer/whatsapp/verify")).header("X-Customer-Session", s)
                .content("{\"phone\":\"" + phone + "\",\"code\":\"" + wrong + "\"}"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("otp_invalid"));
        assertEquals(1, jdbc.sql("SELECT attempts FROM phone_verifications WHERE phone_e164 = :p").param("p", phone).query(Integer.class).single());
        // code is stored only as a hash
        assertEquals(0, jdbc.sql("SELECT count(*) FROM phone_verifications WHERE encode(code_hash,'escape') LIKE '%' || :c || '%'")
                .param("c", code).query(Integer.class).single());
        mvc.perform(internal(post("/internal/v1/customer/whatsapp/verify")).header("X-Customer-Session", s)
                        .content("{\"phone\":\"" + phone + "\",\"code\":\"" + code + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.whatsappVerified").value(true)).andExpect(jsonPath("$.whatsappNumber").value(phone));
    }

    @Test
    void tooManyWrongCodesLockTheCode() throws Exception {
        String s = login("mock-" + UUID.randomUUID(), "lock." + UUID.randomUUID().toString().substring(0, 8) + "@example.test");
        String phone = uniquePhone("+9197");
        mvc.perform(internal(post("/internal/v1/customer/whatsapp/otp")).header("X-Customer-Session", s)
                .content("{\"phone\":\"" + phone + "\"}")).andExpect(status().isAccepted());
        String code = latestMockCode(phone);
        String wrong = code.equals("999999") ? "888888" : "999999";
        for (int i = 0; i < 5; i++) {
            mvc.perform(internal(post("/internal/v1/customer/whatsapp/verify")).header("X-Customer-Session", s)
                    .content("{\"phone\":\"" + phone + "\",\"code\":\"" + wrong + "\"}")).andExpect(status().isUnprocessableEntity());
        }
        mvc.perform(internal(post("/internal/v1/customer/whatsapp/verify")).header("X-Customer-Session", s)
                        .content("{\"phone\":\"" + phone + "\",\"code\":\"" + code + "\"}"))
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("otp_locked"));
    }

    @Test
    void requestsNeedVerifiedWhatsAppAndEachBecomesASeparateLeadWithSeparateConsents() throws Exception {
        String unverified = login("mock-" + UUID.randomUUID(), "unv." + UUID.randomUUID().toString().substring(0, 8) + "@example.test");
        mvc.perform(internal(post("/internal/v1/customer/requests")).header("X-Customer-Session", unverified)
                        .content("{\"type\":\"callback\",\"enquiryConsent\":true,\"marketingConsent\":false}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("whatsapp_not_verified"));

        String phone = uniquePhone("+9196");
        String s = signUpVerified("mock-" + UUID.randomUUID(), "req." + UUID.randomUUID().toString().substring(0, 8) + "@example.test", phone);
        String key = UUID.randomUUID().toString();
        String callback = mvc.perform(internal(post("/internal/v1/customer/requests")).header("X-Customer-Session", s)
                        .header("Idempotency-Key", key)
                        .content("{\"type\":\"callback\",\"message\":\"Evening please\",\"enquiryConsent\":true,\"marketingConsent\":false}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        mvc.perform(internal(post("/internal/v1/customer/requests")).header("X-Customer-Session", s).header("Idempotency-Key", key)
                        .content("{\"type\":\"callback\",\"message\":\"Evening please\",\"enquiryConsent\":true,\"marketingConsent\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reference").value(JsonPath.<String>read(callback, "$.reference")));
        String visit = mvc.perform(internal(post("/internal/v1/customer/requests")).header("X-Customer-Session", s)
                        .content("{\"type\":\"site_visit\",\"propertyId\":\"" + PUBLISHED_PROPERTY + "\",\"preferredDate\":\""
                                + java.time.LocalDate.now().plusDays(3) + "\",\"enquiryConsent\":true,\"marketingConsent\":true}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        mvc.perform(internal(post("/internal/v1/customer/requests")).header("X-Customer-Session", s)
                        .content("{\"type\":\"enquiry\",\"enquiryConsent\":false,\"marketingConsent\":true}"))
                .andExpect(status().isUnprocessableEntity());

        var types = jdbc.sql("""
                SELECT l.enquiry_type || ':' || ls.code || ':' || coalesce(l.assigned_user_id::text, '-') FROM leads l
                JOIN customers c ON c.id = l.customer_id JOIN lead_sources ls ON ls.id = l.source_id
                WHERE c.whatsapp_e164 = :p ORDER BY l.created_at""").param("p", phone).query(String.class).list();
        assertEquals(java.util.List.of("callback:website_account:-", "site_visit:website_account:" + EMPLOYEE_1), types);
        var consents = jdbc.sql("""
                SELECT cc.purpose || ':' || cc.granted FROM customer_consents cc JOIN customers c ON c.id = cc.customer_id
                WHERE c.whatsapp_e164 = :p ORDER BY cc.id""").param("p", phone).query(String.class).list();
        assertEquals(java.util.List.of("service_contact:true", "marketing_whatsapp:false",
                "service_contact:true", "marketing_whatsapp:true"), consents);
        org.junit.jupiter.api.Assertions.assertTrue(JsonPath.<String>read(visit, "$.reference").startsWith("LEAD-"));
    }

    @Test
    void crmShowsRegisteredCustomersWithoutEnquiriesToAuthorisedStaffOnly() throws Exception {
        String email = "noenq." + UUID.randomUUID().toString().substring(0, 8) + "@example.test";
        login("mock-" + UUID.randomUUID(), email);
        String id = jdbc.sql("SELECT id::text FROM customers WHERE email_normalized = :e").param("e", email).query(String.class).single();

        mvc.perform(get("/api/v1/staff/customers?registered=true&limit=50").with(as(DIRECTOR)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.email=='" + email + "')]", hasSize(1)))
                .andExpect(jsonPath("$.items[?(@.email=='" + email + "')].openLeads").value(org.hamcrest.Matchers.contains(0)));
        mvc.perform(get("/api/v1/staff/customers?registered=true&limit=50").with(as(EMPLOYEE_1)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[?(@.email=='" + email + "')]", hasSize(0)));
        mvc.perform(get("/api/v1/staff/customers/" + id).with(as(EMPLOYEE_1))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/staff/customers/" + id).with(as(DIRECTOR))).andExpect(status().isOk())
                .andExpect(jsonPath("$.customer.registeredAt").isNotEmpty());
        mvc.perform(get("/api/v1/staff/customers")).andExpect(status().isUnauthorized());
    }

    @Test
    void assignedEmployeeGetsContactActionsAndMaintainsHistoryAndFollowUps() throws Exception {
        String phone = uniquePhone("+9195");
        String s = signUpVerified("mock-" + UUID.randomUUID(), "sales." + UUID.randomUUID().toString().substring(0, 8) + "@example.test", phone);
        mvc.perform(internal(post("/internal/v1/customer/requests")).header("X-Customer-Session", s)
                .content("{\"type\":\"enquiry\",\"propertyId\":\"" + PUBLISHED_PROPERTY + "\",\"enquiryConsent\":true,\"marketingConsent\":true}"))
                .andExpect(status().isCreated());
        String id = jdbc.sql("SELECT id::text FROM customers WHERE whatsapp_e164 = :p").param("p", phone).query(String.class).single();
        String leadId = jdbc.sql("SELECT l.id::text FROM leads l WHERE l.customer_id = CAST(:c AS uuid)").param("c", id).query(String.class).single();

        mvc.perform(get("/api/v1/staff/customers/" + id).with(as(EMPLOYEE_1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.customer.whatsapp").value(phone))
                .andExpect(jsonPath("$.actions.callUrl").value("tel:" + phone))
                .andExpect(jsonPath("$.actions.whatsappUrl").value("https://wa.me/" + phone.substring(1)))
                .andExpect(jsonPath("$.consents[?(@.purpose=='marketing_whatsapp')].granted").value(org.hamcrest.Matchers.contains(true)))
                .andExpect(jsonPath("$.leads", hasSize(1)));
        mvc.perform(get("/api/v1/staff/customers/" + id).with(as(EMPLOYEE_2))).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/staff/customers/" + id + "/communications").with(as(EMPLOYEE_2)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"channel\":\"phone\",\"direction\":\"outbound\",\"summary\":\"x\"}")).andExpect(status().isNotFound());

        mvc.perform(post("/api/v1/staff/customers/" + id + "/communications").with(as(EMPLOYEE_1)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"channel\":\"whatsapp\",\"direction\":\"outbound\",\"summary\":\"Sent brochure via wa.me\",\"leadId\":\"" + leadId + "\"}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/v1/staff/customers/" + id + "/follow-ups").with(as(EMPLOYEE_1)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Call back about site visit\",\"dueAt\":\"" + OffsetDateTime.now().plusDays(1) + "\",\"leadId\":\"" + leadId + "\"}"))
                .andExpect(status().isCreated());

        mvc.perform(get("/api/v1/staff/customers/" + id).with(as(EMPLOYEE_1)))
                .andExpect(jsonPath("$.communications", hasSize(1)))
                .andExpect(jsonPath("$.communications[0].recordOrigin").value("employee_recorded"))
                .andExpect(jsonPath("$.communications[0].deliveryStatus").value("recorded_manual"))
                .andExpect(jsonPath("$.followUps", hasSize(1)))
                .andExpect(jsonPath("$.followUps[0].status").value("open"));
        assertEquals(1, jdbc.sql("SELECT count(*) FROM leads WHERE id = CAST(:l AS uuid) AND first_contacted_at IS NOT NULL AND next_action_at IS NOT NULL")
                .param("l", leadId).query(Integer.class).single());
        mvc.perform(get("/api/v1/staff/customers?limit=50").with(as(EMPLOYEE_1)))
                .andExpect(jsonPath("$.items[?(@.id=='" + id + "')]", not(empty())));
    }
}
