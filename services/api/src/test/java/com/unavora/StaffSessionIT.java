package com.unavora;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.unavora.platform.RateLimiter;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Slice 3: staff website sessions (BFF -> /internal/v1) with the MOCK identity provider. The real Keycloak flow
 * (password + TOTP) is covered by Playwright and the validation scripts against the running stack.
 */
class StaffSessionIT extends IntegrationTestBase {
    static final String SERVICE = "test-internal-token";

    @Autowired JdbcClient jdbc;
    @Autowired RateLimiter limiter;

    @BeforeEach
    void reset() { limiter.reset(); }

    record Started(String state, String nonce, String url) {}

    static MockHttpServletRequestBuilder internal(MockHttpServletRequestBuilder b) {
        return b.header("X-Internal-Service-Token", SERVICE).contentType(MediaType.APPLICATION_JSON);
    }

    static MockHttpServletRequestBuilder staff(MockHttpServletRequestBuilder b, String session) {
        return internal(b).header("X-Staff-Session", session);
    }

    Started start() throws Exception {
        String res = mvc.perform(internal(post("/internal/v1/staff-auth/start")).content("{\"language\":\"en\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String url = JsonPath.read(res, "$.authorizationUrl");
        Map<String, String> q = Arrays.stream(URI.create(url).getRawQuery().split("&")).map(kv -> kv.split("=", 2))
                .collect(Collectors.toMap(kv -> kv[0], kv -> URLDecoder.decode(kv[1], StandardCharsets.UTF_8)));
        return new Started(JsonPath.read(res, "$.state"), q.get("nonce"), url);
    }

    String complete(Started s, String subject, String amr, int expectStatus) throws Exception {
        return mvc.perform(internal(post("/internal/v1/staff-auth/complete"))
                        .content("{\"code\":\"mock-code:" + subject + ":" + amr + ":" + s.nonce() + "\",\"state\":\"" + s.state() + "\"}"))
                .andExpect(status().is(expectStatus)).andReturn().getResponse().getContentAsString();
    }

    String login(String subject, String amr) throws Exception {
        return JsonPath.read(complete(start(), subject, amr, 200), "$.sessionToken");
    }

    // ---------------------------------------------------------------- sign-in flow

    @Test
    void startUsesPkceS256AndKeepsVerifierAndNonceServerSide() throws Exception {
        Started s = start();
        assertTrue(!s.url().contains("code_verifier"), "the verifier must never be sent to the browser");
        // the challenge in the URL is BASE64URL(SHA-256(verifier)) of the verifier kept in the database (RFC 7636 S256)
        String verifier = jdbc.sql("SELECT code_verifier FROM staff_auth_requests WHERE state_hash = sha256(convert_to(:s, 'UTF8'))")
                .param("s", s.state()).query(String.class).single();
        String challenge = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(
                java.security.MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
        assertTrue(s.url().contains("code_challenge=" + challenge));
        assertTrue(verifier.length() >= 43 && verifier.length() <= 128);
        // only the hash of the state is stored; the verifier never leaves the API
        assertEquals(1, jdbc.sql("SELECT count(*) FROM staff_auth_requests WHERE state_hash = sha256(convert_to(:s, 'UTF8'))")
                .param("s", s.state()).query(Integer.class).single());
        assertEquals(0, jdbc.sql("SELECT count(*) FROM staff_auth_requests WHERE encode(state_hash,'escape') = :s")
                .param("s", s.state()).query(Integer.class).single());
    }

    @Test
    void signInEndpointsRequireTheServiceCredential() throws Exception {
        mvc.perform(post("/internal/v1/staff-auth/start").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/internal/v1/staff-auth/complete").contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"x\",\"state\":\"y\"}")).andExpect(status().isUnauthorized());
    }

    @Test
    void employeeSignsInWithPasswordOnly() throws Exception {
        String res = complete(start(), EMPLOYEE_1, "pwd", 200);
        OffsetDateTime exp = OffsetDateTime.parse(JsonPath.read(res, "$.expiresAt"));
        assertTrue(exp.isBefore(OffsetDateTime.now().plusHours(12).plusMinutes(1)) && exp.isAfter(OffsetDateTime.now().plusHours(11)));
        String token = JsonPath.read(res, "$.sessionToken");
        mvc.perform(staff(get("/internal/v1/staff/me"), token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roles", hasItem("employee")))
                .andExpect(jsonPath("$.permissions", hasItem("lead.read_own")))
                .andExpect(jsonPath("$.permissions", not(hasItem("report.director"))))
                .andExpect(jsonPath("$.mfaRequired").value(false));
        // the session token is stored only as a hash
        assertEquals(0, jdbc.sql("SELECT count(*) FROM user_sessions WHERE encode(session_token_hash,'escape') LIKE '%' || :t || '%'")
                .param("t", token).query(Integer.class).single());
    }

    @Test
    void directorWithoutMfaGetsNoSession() throws Exception {
        int before = jdbc.sql("SELECT count(*) FROM user_sessions WHERE user_id = CAST(:u AS uuid)").param("u", DIRECTOR).query(Integer.class).single();
        String res = complete(start(), DIRECTOR, "pwd", 403);
        assertEquals("mfa_required", JsonPath.read(res, "$.code"));
        assertEquals(before, jdbc.sql("SELECT count(*) FROM user_sessions WHERE user_id = CAST(:u AS uuid)").param("u", DIRECTOR).query(Integer.class).single());
        assertTrue(jdbc.sql("""
                SELECT count(*) FROM audit_logs WHERE action = 'staff.login_denied' AND outcome = 'denied'
                AND metadata_json LIKE '%mfa_required%'""").query(Integer.class).single() >= 1);
    }

    @Test
    void directorWithOtpGetsShorterSessionAndCompanyWideAccess() throws Exception {
        String res = complete(start(), DIRECTOR, "pwd,otp", 200);
        OffsetDateTime exp = OffsetDateTime.parse(JsonPath.read(res, "$.expiresAt"));
        assertTrue(exp.isBefore(OffsetDateTime.now().plusHours(8).plusMinutes(1)), "MFA roles get the 8 h absolute limit");
        String token = JsonPath.read(res, "$.sessionToken");
        mvc.perform(staff(get("/internal/v1/staff/me"), token))
                .andExpect(jsonPath("$.mfaVerified").value(true)).andExpect(jsonPath("$.mfaRequired").value(true));
        mvc.perform(staff(get("/internal/v1/director/overview"), token)).andExpect(status().isOk())
                .andExpect(jsonPath("$.publishedProperties").value(4));
        mvc.perform(staff(get("/internal/v1/staff/leads?limit=50&assignee=" + EMPLOYEE_2), token)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.reference=='LEAD-LOCAL-2')]", hasSize(1)))
                .andExpect(jsonPath("$.items[?(@.reference=='LEAD-LOCAL-1')]", hasSize(0)));
    }

    @Test
    void directorSessionWithoutMfaIsRejectedOnEveryRequest() throws Exception {
        String token = login(DIRECTOR, "pwd,otp");
        // Simulate a session row that somehow lacks MFA (e.g. role granted after sign-in): the API refuses it.
        jdbc.sql("UPDATE user_sessions SET mfa_verified_at = NULL WHERE user_id = CAST(:u AS uuid)").param("u", DIRECTOR).update();
        mvc.perform(staff(get("/internal/v1/director/overview"), token)).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("staff_session_required"));
    }

    @Test
    void directorBearerTokenWithoutMfaIsRefused() throws Exception {
        mvc.perform(get("/api/v1/director/overview").with(bearerWithoutMfa(DIRECTOR))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/staff/leads").with(bearerWithoutMfa(DIRECTOR))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/director/overview").with(bearer(DIRECTOR))).andExpect(status().isOk());
        // employees are not MFA-gated
        mvc.perform(get("/api/v1/staff/leads").with(bearerWithoutMfa(EMPLOYEE_1))).andExpect(status().isOk());
    }

    @Test
    void onlyInvitedActiveUsersCanSignIn() throws Exception {
        assertEquals("not_invited", JsonPath.read(complete(start(), UUID.randomUUID().toString(), "pwd", 403), "$.code"));
        UUID invited = UUID.randomUUID();
        jdbc.sql("INSERT INTO users (external_subject, email, full_name, status) VALUES (:s, :e, 'Invited only', 'invited')")
                .param("s", invited.toString()).param("e", invited + "@example.test").update();
        assertEquals("not_invited", JsonPath.read(complete(start(), invited.toString(), "pwd", 403), "$.code"));
    }

    @Test
    void stateIsSingleUseAndNonceMustMatch() throws Exception {
        Started s = start();
        complete(s, EMPLOYEE_1, "pwd", 200);
        assertEquals("login_expired", JsonPath.read(complete(s, EMPLOYEE_1, "pwd", 400), "$.code"));   // replay
        Started s2 = start();
        mvc.perform(internal(post("/internal/v1/staff-auth/complete"))
                        .content("{\"code\":\"mock-code:" + EMPLOYEE_1 + ":pwd:wrong-nonce\",\"state\":\"" + s2.state() + "\"}"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("login_failed"));
        mvc.perform(internal(post("/internal/v1/staff-auth/complete")).content("{\"code\":\"x\",\"state\":\"never-issued\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void expiredSignInRequestIsRejected() throws Exception {
        Started s = start();
        jdbc.sql("UPDATE staff_auth_requests SET expires_at = now() - interval '1 second' WHERE state_hash = sha256(convert_to(:s, 'UTF8'))")
                .param("s", s.state()).update();
        assertEquals("login_expired", JsonPath.read(complete(s, EMPLOYEE_1, "pwd", 400), "$.code"));
    }

    // ---------------------------------------------------------------- session security

    @Test
    void logoutRevokesTheSession() throws Exception {
        String token = login(EMPLOYEE_1, "pwd");
        mvc.perform(staff(get("/internal/v1/staff/me"), token)).andExpect(status().isOk());
        assertEquals(1, jdbc.sql("SELECT count(*) FROM user_sessions WHERE session_token_hash = sha256(convert_to(:t,'UTF8')) AND id_token_hint IS NOT NULL")
                .param("t", token).query(Integer.class).single());
        // logout revokes the session AND returns the provider end-session URL (RP-initiated logout, language in state)
        mvc.perform(internal(post("/internal/v1/staff-auth/logout?lang=hi")).header("X-Staff-Session", token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.endSessionUrl").value("http://mock-idp.test/logout?state=hi"));
        mvc.perform(staff(get("/internal/v1/staff/me"), token)).andExpect(status().isUnauthorized());
        assertEquals(0, jdbc.sql("SELECT count(*) FROM user_sessions WHERE session_token_hash = sha256(convert_to(:t,'UTF8')) AND id_token_hint IS NOT NULL")
                .param("t", token).query(Integer.class).single(), "the id_token_hint is erased on logout");
        // a second logout with the same token does nothing
        mvc.perform(internal(post("/internal/v1/staff-auth/logout")).header("X-Staff-Session", token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.endSessionUrl").doesNotExist());
    }

    @Test
    void idleAndAbsoluteTimeoutsEndTheSession() throws Exception {
        String idle = login(EMPLOYEE_1, "pwd");
        jdbc.sql("UPDATE user_sessions SET idle_expires_at = now() - interval '1 second' WHERE session_token_hash = sha256(convert_to(:t,'UTF8'))")
                .param("t", idle).update();
        mvc.perform(staff(get("/internal/v1/staff/me"), idle)).andExpect(status().isUnauthorized());

        String abs = login(EMPLOYEE_1, "pwd");
        jdbc.sql("UPDATE user_sessions SET absolute_expires_at = now() - interval '1 second' WHERE session_token_hash = sha256(convert_to(:t,'UTF8'))")
                .param("t", abs).update();
        mvc.perform(staff(get("/internal/v1/staff/me"), abs)).andExpect(status().isUnauthorized());

        // activity slides the idle expiry but never beyond the absolute expiry
        String slide = login(EMPLOYEE_1, "pwd");
        jdbc.sql("UPDATE user_sessions SET absolute_expires_at = now() + interval '5 minutes' WHERE session_token_hash = sha256(convert_to(:t,'UTF8'))")
                .param("t", slide).update();
        mvc.perform(staff(get("/internal/v1/staff/me"), slide)).andExpect(status().isOk());
        assertTrue(jdbc.sql("""
                SELECT idle_expires_at <= absolute_expires_at FROM user_sessions WHERE session_token_hash = sha256(convert_to(:t,'UTF8'))""")
                .param("t", slide).query(Boolean.class).single());
    }

    @Test
    void disablingAUserEndsTheirSessionsImmediately() throws Exception {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                INSERT INTO users (id, external_subject, email, full_name, status) VALUES (:id, :s, :e, 'Temp employee', 'active');
                INSERT INTO user_roles (user_id, role_id) SELECT :id, id FROM roles WHERE code = 'employee'""")
                .param("id", id).param("s", id.toString()).param("e", id + "@example.test").update();
        String token = login(id.toString(), "pwd");
        mvc.perform(staff(get("/internal/v1/staff/me"), token)).andExpect(status().isOk());
        jdbc.sql("UPDATE users SET status = 'disabled' WHERE id = :id").param("id", id).update();
        mvc.perform(staff(get("/internal/v1/staff/me"), token)).andExpect(status().isUnauthorized());
    }

    @Test
    void sessionsAndBearerTokensAreNotInterchangeable() throws Exception {
        String token = login(EMPLOYEE_1, "pwd");
        // staff session without the service credential (i.e. not via our web server)
        mvc.perform(get("/internal/v1/staff/me").header("X-Staff-Session", token)).andExpect(status().isUnauthorized());
        // service credential without a staff session
        mvc.perform(internal(get("/internal/v1/staff/leads"))).andExpect(status().isUnauthorized());
        // bearer JWT on the internal CRM path
        mvc.perform(get("/internal/v1/staff/leads").with(bearer(EMPLOYEE_1))).andExpect(status().isUnauthorized());
        // staff session header on the public API path
        mvc.perform(get("/api/v1/staff/leads").header("X-Staff-Session", token)).andExpect(status().isUnauthorized());
        // forged token
        mvc.perform(staff(get("/internal/v1/staff/me"), "forged-" + token)).andExpect(status().isUnauthorized());
    }

    // ---------------------------------------------------------------- record-level access via sessions

    @Test
    void employeeSessionSeesOnlyOwnRecords() throws Exception {
        String e1 = login(EMPLOYEE_1, "pwd");
        mvc.perform(staff(get("/internal/v1/staff/leads?limit=50"), e1)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.reference=='LEAD-LOCAL-1')]", hasSize(1)))
                .andExpect(jsonPath("$.items[?(@.reference=='LEAD-LOCAL-2')]", hasSize(0)));
        // assignee filter cannot widen an employee's view
        mvc.perform(staff(get("/internal/v1/staff/leads?limit=50&assignee=" + EMPLOYEE_2), e1))
                .andExpect(jsonPath("$.items[?(@.reference=='LEAD-LOCAL-2')]", hasSize(0)));
        mvc.perform(staff(get("/internal/v1/staff/leads/40000000-0000-0000-0000-000000000002"), e1)).andExpect(status().isNotFound());
        mvc.perform(staff(get("/internal/v1/staff/leads/40000000-0000-0000-0000-000000000002/activities"), e1)).andExpect(status().isNotFound());
        mvc.perform(staff(get("/internal/v1/staff/leads/40000000-0000-0000-0000-000000000001/activities"), e1)).andExpect(status().isOk());
        String foreignCustomer = jdbc.sql("SELECT customer_id::text FROM leads WHERE public_ref = 'LEAD-LOCAL-2'").query(String.class).single();
        mvc.perform(staff(get("/internal/v1/staff/customers/" + foreignCustomer), e1)).andExpect(status().isNotFound());
        mvc.perform(staff(get("/internal/v1/director/overview"), e1)).andExpect(status().isForbidden());
    }

    @Test
    void followUpsAreCreatedListedAndCompletedOnlyByTheirOwner() throws Exception {
        String e1 = login(EMPLOYEE_1, "pwd");
        String customer = jdbc.sql("SELECT customer_id::text FROM leads WHERE public_ref = 'LEAD-LOCAL-1'").query(String.class).single();
        String lead = "40000000-0000-0000-0000-000000000001";
        mvc.perform(staff(post("/internal/v1/staff/customers/" + customer + "/communications"), e1)
                .content("{\"channel\":\"phone\",\"direction\":\"outbound\",\"summary\":\"Called about visit (synthetic)\",\"leadId\":\"" + lead + "\"}"))
                .andExpect(status().isCreated());
        String created = mvc.perform(staff(post("/internal/v1/staff/customers/" + customer + "/follow-ups"), e1)
                        .content("{\"title\":\"Send brochure\",\"dueAt\":\"" + OffsetDateTime.now().plus(Duration.ofHours(2)) + "\",\"leadId\":\"" + lead + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String taskId = JsonPath.read(created, "$.id");
        mvc.perform(staff(get("/internal/v1/staff/follow-ups"), e1)).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + taskId + "')]", hasSize(1)));

        String e2 = login(EMPLOYEE_2, "pwd");
        mvc.perform(staff(get("/internal/v1/staff/follow-ups"), e2)).andExpect(jsonPath("$[?(@.id=='" + taskId + "')]", hasSize(0)));
        mvc.perform(staff(post("/internal/v1/staff/follow-ups/" + taskId + "/complete"), e2)).andExpect(status().isNotFound());

        mvc.perform(staff(post("/internal/v1/staff/follow-ups/" + taskId + "/complete"), e1)).andExpect(status().isOk());
        mvc.perform(staff(get("/internal/v1/staff/follow-ups"), e1)).andExpect(jsonPath("$[?(@.id=='" + taskId + "')]", hasSize(0)));
        mvc.perform(staff(get("/internal/v1/staff/leads/" + lead + "/activities"), e1))
                .andExpect(jsonPath("$[?(@.type=='task_completed')]", not(hasSize(0))))
                .andExpect(jsonPath("$[?(@.type=='call_recorded')]", not(hasSize(0))));
    }
}
