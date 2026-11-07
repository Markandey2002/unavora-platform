package com.unavora.identity.internal;

import java.util.Set;

/**
 * The staff OIDC provider (Keycloak locally, Cognito later). The API, not the browser or the web server, performs
 * the code exchange, so no IdP token ever leaves the API process; only the verified facts below are kept.
 */
interface StaffIdentityProvider {

    /** Facts taken from a verified ID token (signature, issuer, audience, expiry and nonce already checked). */
    record VerifiedIdentity(String subject, Set<String> authMethods) {
        boolean hasSecondFactor() {
            return authMethods.contains("otp") || authMethods.contains("mfa") || authMethods.contains("hwk");
        }
    }

    /** Browser redirect URL to the provider's sign-in page (Authorization Code + PKCE S256, forced re-authentication). */
    String authorizationUrl(String state, String nonce, String codeChallenge, String language);

    /** Exchanges the code with the PKCE verifier and validates the returned ID token against {@code expectedNonce}. */
    VerifiedIdentity exchange(String code, String codeVerifier, String expectedNonce);
}
