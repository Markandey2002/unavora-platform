package com.unavora;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import com.jayway.jsonpath.JsonPath;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Real PostgreSQL 17 (same major as production). Flyway applies every migration plus the synthetic seed.
 * Singleton container: started once per JVM and shared by every IT class. (A JUnit-managed @Container in an
 * abstract base is stopped after the first class while Spring's cached context still points at it.)
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class IntegrationTestBase {

    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17");

    static { POSTGRES.start(); }

    public static final String DIRECTOR = "00000000-0000-0000-0000-000000000101";
    public static final String EMPLOYEE_1 = "00000000-0000-0000-0000-000000000102";
    public static final String EMPLOYEE_2 = "00000000-0000-0000-0000-000000000103";
    public static final String PUBLISHED_PROPERTY = "20000000-0000-0000-0000-000000000001";
    public static final String DRAFT_PROPERTY = "20000000-0000-0000-0000-000000000005";
    public static final String SOLD_PROPERTY = "20000000-0000-0000-0000-000000000006";

    @Autowired protected MockMvc mvc;

    /** Bearer JWT as issued by the dev realm after password + authenticator code (amr = pwd, otp). */
    public static RequestPostProcessor bearer(String subject) {
        return jwt().jwt(j -> j.subject(subject).claim("amr", List.of("pwd", "otp")));
    }

    /**
     * Every lead the caller can see, following nextCursor through all pages. Tests must not assume a record is on the
     * first page: the shared test database grows and test-class order differs by OS (CI run on Linux, Slice 4).
     * {@code request} receives "" or "&cursor=..." to append to a URL that already has a query string.
     */
    protected List<Map<String, Object>> allLeads(Function<String, MockHttpServletRequestBuilder> request) throws Exception {
        List<Map<String, Object>> all = new ArrayList<>();
        String cursor = null;
        for (int page = 0; page < 100; page++) {
            String body = mvc.perform(request.apply(cursor == null ? "" : "&cursor=" + cursor))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            all.addAll(JsonPath.read(body, "$.items"));
            cursor = JsonPath.read(body, "$.nextCursor");
            if (cursor == null) return all;
        }
        throw new IllegalStateException("too many pages");
    }

    /** Bearer JWT from a password-only sign-in (no second factor). */
    public static RequestPostProcessor bearerWithoutMfa(String subject) {
        return jwt().jwt(j -> j.subject(subject).claim("amr", List.of("pwd")));
    }
}
