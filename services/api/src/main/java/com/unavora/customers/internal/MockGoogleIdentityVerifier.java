package com.unavora.customers.internal;

import com.unavora.platform.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.springframework.http.HttpStatus;

/**
 * LOCAL/TEST ONLY. Accepts "mock-google:" + base64url(sub) + ":" + base64url(email) + ":" + base64url(name),
 * produced by the web app's mock account chooser. Subjects must start with "mock-" so synthetic accounts can never
 * be confused with real Google subjects (which are numeric). Never enabled in staging/production (no default there).
 */
class MockGoogleIdentityVerifier implements GoogleIdentityVerifier {
    static final String PREFIX = "mock-google:";

    @Override
    public GoogleProfile verify(String credential) {
        try {
            if (credential == null || !credential.startsWith(PREFIX)) throw new IllegalArgumentException();
            String[] p = credential.substring(PREFIX.length()).split(":", -1);
            if (p.length != 3) throw new IllegalArgumentException();
            String sub = decode(p[0]), email = decode(p[1]).trim().toLowerCase(), name = decode(p[2]).trim();
            if (!sub.startsWith("mock-") || sub.length() > 255 || !email.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")
                    || email.length() > 254 || name.length() > 200) {
                throw new IllegalArgumentException();
            }
            return new GoogleProfile(sub, email, true, name.isEmpty() ? null : name);
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "invalid_google_credential", "Google sign-in could not be verified");
        }
    }

    @Override
    public String mode() { return "mock"; }

    private static String decode(String s) {
        return new String(Base64.getUrlDecoder().decode(s), StandardCharsets.UTF_8);
    }
}
