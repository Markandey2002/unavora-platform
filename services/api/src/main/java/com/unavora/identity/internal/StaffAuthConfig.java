package com.unavora.identity.internal;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** oidc (local Keycloak, later Cognito) or mock (automated tests only). Staging/production must set mode explicitly. */
@Configuration
class StaffAuthConfig {

    @Bean
    StaffIdentityProvider staffIdentityProvider(@Value("${unavora.staff-auth.mode:oidc}") String mode,
                                                @Value("${unavora.staff-auth.issuer-uri:}") String issuer,
                                                @Value("${unavora.staff-auth.client-id:}") String clientId,
                                                @Value("${unavora.staff-auth.client-secret:}") String clientSecret,
                                                @Value("${unavora.staff-auth.redirect-uri:}") String redirectUri,
                                                @Value("${unavora.staff-auth.post-logout-redirect-uri:}") String postLogoutRedirectUri) {
        return switch (mode) {
            case "mock" -> new MockStaffIdentityProvider();
            case "oidc" -> new OidcStaffIdentityProvider(issuer, clientId, clientSecret, redirectUri, postLogoutRedirectUri);
            default -> throw new IllegalStateException("Unknown unavora.staff-auth.mode: " + mode);
        };
    }
}
