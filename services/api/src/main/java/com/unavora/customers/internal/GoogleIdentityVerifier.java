package com.unavora.customers.internal;

/**
 * Verifies the credential obtained from "Continue with Google" and returns the account facts we store.
 * Implementations: {@link MockGoogleIdentityVerifier} (local/test only) and {@link GoogleIdTokenVerifier} (real
 * Google ID tokens; needs an approved OAuth client id). Selected by unavora.customer-auth.google.mode.
 */
interface GoogleIdentityVerifier {

    record GoogleProfile(String subject, String email, boolean emailVerified, String name) {}

    /** @throws com.unavora.platform.ApiException 401 when the credential is invalid. */
    GoogleProfile verify(String credential);

    String mode();
}
