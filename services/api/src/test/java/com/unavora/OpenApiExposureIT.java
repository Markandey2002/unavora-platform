package com.unavora;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import org.junit.jupiter.api.Test;

/**
 * Swagger UI / OpenAPI JSON are LOCAL ONLY (OpenApiConfig is @Profile("local"), springdoc disabled in application.yml).
 * Under any other profile (here: "test") neither the description nor the UI may be served.
 */
class OpenApiExposureIT extends IntegrationTestBase {

    @Test
    void apiDescriptionAndSwaggerUiAreNotServedOutsideTheLocalProfile() throws Exception {
        for (String path : new String[]{"/v3/api-docs", "/v3/api-docs/1-public", "/swagger-ui.html", "/swagger-ui/index.html"}) {
            int status = mvc.perform(get(path)).andReturn().getResponse().getStatus();
            assertNotEquals(200, status, path + " must not be served outside the local profile");
            assertNotEquals(302, status, path + " must not redirect to a Swagger UI outside the local profile");
        }
    }
}
