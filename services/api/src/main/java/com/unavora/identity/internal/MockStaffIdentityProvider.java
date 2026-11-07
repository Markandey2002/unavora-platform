package com.unavora.identity.internal;

import com.unavora.platform.ApiException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.LinkedHashSet;
import org.springframework.http.HttpStatus;

/**
 * AUTOMATED TESTS ONLY (unavora.staff-auth.mode=mock, set only by application-test.yml). Codes look like
 * "mock-code:&lt;subject&gt;:&lt;amr,comma,separated&gt;:&lt;nonce&gt;" so tests can simulate MFA / no-MFA sign-ins.
 * Local development and CI end-to-end tests use the real Keycloak flow instead.
 */
class MockStaffIdentityProvider implements StaffIdentityProvider {

    @Override
    public String authorizationUrl(String state, String nonce, String codeChallenge, String language) {
        return "http://mock-idp.test/authorize?state=" + enc(state) + "&nonce=" + enc(nonce) + "&code_challenge=" + enc(codeChallenge);
    }

    @Override
    public VerifiedIdentity exchange(String code, String codeVerifier, String expectedNonce) {
        String[] p = code == null ? new String[0] : code.split(":", -1);
        if (p.length != 4 || !"mock-code".equals(p[0]) || !expectedNonce.equals(p[3]) || codeVerifier == null || codeVerifier.length() < 43) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "login_failed", "Sign-in could not be completed. Please try again.");
        }
        return new VerifiedIdentity(p[1], new LinkedHashSet<>(Arrays.stream(p[2].split(",")).filter(s -> !s.isBlank()).toList()));
    }

    private static String enc(String s) { return URLEncoder.encode(s, StandardCharsets.UTF_8); }
}
