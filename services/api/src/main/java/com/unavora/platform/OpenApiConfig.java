package com.unavora.platform;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import java.util.List;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.models.GroupedOpenApi;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

/**
 * OpenAPI document and Swagger UI — LOCAL DEVELOPMENT ONLY.
 * springdoc is disabled in application.yml for every environment and switched on only in application-local.yml.
 * This class (including the rule that lets the Swagger pages through security) loads only under the "local" profile,
 * so even a misconfigured staging/production property cannot publish the API description or an open Swagger UI.
 *
 * UI: http://localhost:8080/swagger-ui.html   JSON: http://localhost:8080/v3/api-docs/{group}
 * Authorise: "staffBearer" = a Keycloak access token (python infra/local/scripts/staff_token.py employee1|director);
 * "internalServiceToken" = the local service token; "customerSession" = sessionToken from /internal/v1/customer-auth/google.
 */
@Configuration
@Profile("local")
class OpenApiConfig {

    static final String BEARER = "staffBearer";
    static final String INTERNAL = "internalServiceToken";
    static final String CUSTOMER = "customerSession";

    @Bean
    OpenAPI unavoraOpenApi() {
        return new OpenAPI()
                .info(new Info().title("UNAVORA ANANT REAL ESTATE API").version("v1")
                        .description("Local development API. Synthetic data only. Public routes need no authentication; staff and "
                                + "director routes need a Keycloak bearer token; /internal routes need the BFF service token "
                                + "(and a customer session for customer routes). See docs/LOCAL_API_REFERENCE.md."))
                .servers(List.of(new Server().url("http://localhost:8080").description("local API")))
                .components(new Components()
                        .addSecuritySchemes(BEARER, new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")
                                .description("Keycloak access token from the local dev realm"))
                        .addSecuritySchemes(INTERNAL, new SecurityScheme().type(SecurityScheme.Type.APIKEY).in(SecurityScheme.In.HEADER)
                                .name("X-Internal-Service-Token").description("Local value: local-dev-internal-token-not-a-secret"))
                        .addSecuritySchemes(CUSTOMER, new SecurityScheme().type(SecurityScheme.Type.APIKEY).in(SecurityScheme.In.HEADER)
                                .name("X-Customer-Session").description("sessionToken returned by POST /internal/v1/customer-auth/google")));
    }

    /** Attach the right security requirement to every operation of a group (so Swagger UI sends the headers). */
    private static OpenApiCustomizer require(String... schemes) {
        return api -> api.getPaths().values().forEach(item -> item.readOperations().forEach(op -> {
            SecurityRequirement r = new SecurityRequirement();
            for (String s : schemes) r.addList(s);
            op.addSecurityItem(r);
        }));
    }

    @Bean
    GroupedOpenApi publicApi() {
        return GroupedOpenApi.builder().group("1-public").displayName("1. Public website API (no authentication)")
                .pathsToMatch("/api/v1/public/**").build();
    }

    @Bean
    GroupedOpenApi staffApi() {
        return GroupedOpenApi.builder().group("2-staff").displayName("2. Staff & director API (Bearer token)")
                .pathsToMatch("/api/v1/staff/**", "/api/v1/director/**").addOpenApiCustomizer(require(BEARER)).build();
    }

    @Bean
    GroupedOpenApi customerApi() {
        return GroupedOpenApi.builder().group("3-customer").displayName("3. Customer account (internal: service token + session)")
                .pathsToMatch("/internal/v1/customer/**", "/internal/v1/customer-auth/**", "/internal/v1/dev/**")
                .addOpenApiCustomizer(require(INTERNAL, CUSTOMER)).build();
    }

    @Bean
    GroupedOpenApi bffApi() {
        return GroupedOpenApi.builder().group("4-bff-staff").displayName("4. BFF staff routes (internal; used by the website)")
                .pathsToMatch("/internal/v1/staff/**", "/internal/v1/staff-auth/**", "/internal/v1/director/**")
                .addOpenApiCustomizer(require(INTERNAL)).build();
    }

    /** Lets the Swagger UI and the OpenAPI JSON through security — only in this local-only configuration. */
    @Bean
    @Order(0)
    SecurityFilterChain swaggerChain(HttpSecurity http) throws Exception {
        http.securityMatcher("/v3/api-docs/**", "/v3/api-docs", "/swagger-ui/**", "/swagger-ui.html")
            .csrf(c -> c.disable())
            .authorizeHttpRequests(a -> a.anyRequest().permitAll());
        return http.build();
    }
}
