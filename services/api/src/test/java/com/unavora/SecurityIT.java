package com.unavora;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** Baseline API security behaviour (not a substitute for the staging ZAP/pen-test gate). */
class SecurityIT extends IntegrationTestBase {

    @Test
    void forgedOrMalformedBearerTokensAreRejected() throws Exception {
        mvc.perform(get("/api/v1/staff/leads").header("Authorization", "Bearer not-a-jwt")).andExpect(status().isUnauthorized());
        // alg=none token with a director subject: an UNSIGNED, synthetic test fixture, not a credential.
        String none = "eyJhbGciOiJub25lIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAxMDEifQ."; // gitleaks:allow
        mvc.perform(get("/api/v1/director/overview").header("Authorization", "Bearer " + none)).andExpect(status().isUnauthorized());
    }

    @Test
    void securityHeadersArePresent() throws Exception {
        mvc.perform(get("/api/v1/public/properties?lang=en"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"));
    }

    @Test
    void corsAllowsOnlyConfiguredOrigin() throws Exception {
        mvc.perform(options("/api/v1/public/enquiries").header("Origin", "https://evil.example")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());
        mvc.perform(options("/api/v1/public/enquiries").header("Origin", "http://localhost:3000")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"));
    }

    @Test
    void injectionStyleInputIsTreatedAsData() throws Exception {
        mvc.perform(get("/api/v1/public/properties").param("lang", "en").param("q", "'; DROP TABLE leads; --"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/public/properties").param("lang", "en").param("q", "100%_\\"))
                .andExpect(status().isOk());
    }

    @Test
    void errorsDoNotLeakInternals() throws Exception {
        mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andExpect(status().is4xxClientError())
                .andExpect(content().string(not(containsString("Exception"))))
                .andExpect(content().string(not(containsString("at com."))));
        mvc.perform(post("/api/v1/public/enquiries").header("Idempotency-Key", "not-a-uuid")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/public/properties?lang=en&cursor=%%%"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("bad_cursor"));
    }
}
