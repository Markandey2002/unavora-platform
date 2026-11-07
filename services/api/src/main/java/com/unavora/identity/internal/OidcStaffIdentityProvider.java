package com.unavora.identity.internal;

import com.unavora.platform.ApiException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Standard OIDC confidential client: discovery, authorization URL, code exchange (client_secret_basic + PKCE) and
 * ID-token validation. Provider-neutral (Keycloak locally, Cognito later). Discovery is lazy so the API can start
 * while the provider is down.
 */
class OidcStaffIdentityProvider implements StaffIdentityProvider {
    private final String issuer;
    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;
    private final RestClient http = RestClient.create();
    private volatile Discovery discovery;

    private record Discovery(String authorizationEndpoint, String tokenEndpoint, NimbusJwtDecoder decoder) {}

    OidcStaffIdentityProvider(String issuer, String clientId, String clientSecret, String redirectUri) {
        for (var e : Map.of("issuer-uri", issuer, "client-id", clientId, "client-secret", clientSecret, "redirect-uri", redirectUri).entrySet()) {
            if (e.getValue() == null || e.getValue().isBlank()) {
                throw new IllegalStateException("unavora.staff-auth." + e.getKey() + " is required when mode=oidc");
            }
        }
        this.issuer = issuer.endsWith("/") ? issuer.substring(0, issuer.length() - 1) : issuer;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
    }

    @Override
    public String authorizationUrl(String state, String nonce, String codeChallenge, String language) {
        Map<String, String> q = new LinkedHashMap<>();
        q.put("response_type", "code");
        q.put("client_id", clientId);
        q.put("redirect_uri", redirectUri);
        q.put("scope", "openid");
        q.put("state", state);
        q.put("nonce", nonce);
        q.put("code_challenge", codeChallenge);
        q.put("code_challenge_method", "S256");
        q.put("prompt", "login");              // always re-authenticate (and re-do OTP); no silent SSO into the CRM
        q.put("ui_locales", language);
        return discovery().authorizationEndpoint() + "?" + q.entrySet().stream()
                .map(e -> e.getKey() + "=" + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
    }

    @Override
    @SuppressWarnings("unchecked")
    public VerifiedIdentity exchange(String code, String codeVerifier, String expectedNonce) {
        Discovery d = discovery();
        var form = new LinkedMultiValueMap<String, String>();
        form.add("grant_type", "authorization_code");
        form.add("code", code);
        form.add("redirect_uri", redirectUri);
        form.add("code_verifier", codeVerifier);
        Map<String, Object> tokens;
        try {
            tokens = http.post().uri(d.tokenEndpoint())
                    .header(HttpHeaders.AUTHORIZATION, "Basic " + Base64.getEncoder().encodeToString(
                            (enc(clientId) + ":" + enc(clientSecret)).getBytes(StandardCharsets.UTF_8)))
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form)
                    .retrieve().body(Map.class);
        } catch (RestClientException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "login_failed", "Sign-in could not be completed. Please try again.");
        }
        Object idToken = tokens == null ? null : tokens.get("id_token");
        if (!(idToken instanceof String s)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "login_failed", "Sign-in could not be completed. Please try again.");
        }
        try {
            Jwt jwt = d.decoder().decode(s);
            if (!expectedNonce.equals(jwt.getClaimAsString("nonce"))) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "login_failed", "Sign-in could not be completed. Please try again.");
            }
            Object amr = jwt.getClaims().get("amr");
            Set<String> methods = new LinkedHashSet<>();
            if (amr instanceof Collection<?> c) c.forEach(x -> methods.add(String.valueOf(x)));
            return new VerifiedIdentity(jwt.getSubject(), methods);
        } catch (JwtException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "login_failed", "Sign-in could not be completed. Please try again.");
        }
        // Access and refresh tokens are deliberately discarded: the CRM session lives in user_sessions.
    }

    @SuppressWarnings("unchecked")
    private Discovery discovery() {
        Discovery d = discovery;
        if (d != null) return d;
        synchronized (this) {
            if (discovery != null) return discovery;
            Map<String, Object> doc;
            try {
                doc = http.get().uri(issuer + "/.well-known/openid-configuration").retrieve().body(Map.class);
            } catch (RestClientException e) {
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "idp_unavailable", "Sign-in is temporarily unavailable.");
            }
            if (doc == null || !issuer.equals(doc.get("issuer"))) {
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "idp_unavailable", "Sign-in is temporarily unavailable.");
            }
            NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri((String) doc.get("jwks_uri")).build();
            decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                    JwtValidators.createDefaultWithIssuer(issuer),
                    new JwtClaimValidator<Collection<String>>("aud", aud -> aud != null && aud.contains(clientId))));
            discovery = new Discovery((String) doc.get("authorization_endpoint"), (String) doc.get("token_endpoint"), decoder);
            return discovery;
        }
    }

    private static String enc(String s) { return URLEncoder.encode(s, StandardCharsets.UTF_8); }
}
