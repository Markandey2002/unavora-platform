package com.unavora.customers.internal;

import com.unavora.platform.ApiException;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/**
 * Real Google ID-token verification: RS256 signature against Google's JWKS, issuer, audience (our OAuth client id),
 * expiry, and email_verified. Code path compiled and wired, but NOT YET EXERCISED against Google: it needs an
 * approved OAuth client (Google Cloud project, consent screen, redirect URIs). See docs/TEST_RESULTS.md.
 */
class GoogleIdTokenVerifier implements GoogleIdentityVerifier {
    static final String JWKS = "https://www.googleapis.com/oauth2/v3/certs";
    private static final Set<String> ISSUERS = Set.of("accounts.google.com", "https://accounts.google.com");

    private final NimbusJwtDecoder decoder;

    GoogleIdTokenVerifier(String clientId) {
        if (clientId == null || clientId.isBlank()) {
            throw new IllegalStateException("unavora.customer-auth.google.client-id is required when mode=google");
        }
        this.decoder = NimbusJwtDecoder.withJwkSetUri(JWKS).build();
        this.decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefault(),
                new JwtClaimValidator<String>("iss", ISSUERS::contains),
                new JwtClaimValidator<Collection<String>>("aud", aud -> aud != null && aud.contains(clientId))));
    }

    @Override
    public GoogleProfile verify(String credential) {
        try {
            Jwt jwt = decoder.decode(credential);
            Object ev = jwt.getClaims().get("email_verified");
            boolean emailVerified = Boolean.TRUE.equals(ev) || "true".equals(String.valueOf(ev));
            String email = jwt.getClaimAsString("email");
            if (email == null || !emailVerified) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "google_email_unverified", "Your Google email address is not verified");
            }
            return new GoogleProfile(jwt.getSubject(), email.toLowerCase(), true, jwt.getClaimAsString("name"));
        } catch (JwtException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "invalid_google_credential", "Google sign-in could not be verified");
        }
    }

    @Override
    public String mode() { return "google"; }

    static List<String> issuers() { return List.copyOf(ISSUERS); }
}
