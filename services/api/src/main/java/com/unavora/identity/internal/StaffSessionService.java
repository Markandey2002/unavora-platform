package com.unavora.identity.internal;

import com.unavora.identity.StaffPrincipal;
import com.unavora.identity.StaffSessions;
import com.unavora.platform.ApiException;
import com.unavora.platform.Hashing;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Staff website sign-in and sessions (ARCHITECTURE §4.3 / §4.6).
 *  - Invitation-only: the IdP subject must map to an existing users row with status 'active'.
 *  - MFA: if any of the user's roles has requires_mfa (director), the ID token must prove a second factor; otherwise
 *    no session is created. resolve() re-checks on every request, so a role granted later also takes effect.
 *  - Opaque session token (SHA-256 at rest), idle + absolute expiry (shorter absolute for MFA roles), revocation on
 *    logout, immediate effect of disabling a user.
 */
@Service
class StaffSessionService implements StaffSessions {

    record StartResult(String authorizationUrl, String state) {}

    record LoginResult(String sessionToken, OffsetDateTime expiresAt, long idleTimeoutSeconds, String language) {}

    static final Duration REQUEST_TTL = Duration.ofMinutes(10);

    private final JdbcClient jdbc;
    private final StaffIdentityProvider idp;
    private final Duration idle;
    private final Duration absolute;
    private final Duration mfaAbsolute;

    StaffSessionService(JdbcClient jdbc, StaffIdentityProvider idp,
                        @Value("${unavora.staff-session.idle:PT30M}") Duration idle,
                        @Value("${unavora.staff-session.absolute:PT12H}") Duration absolute,
                        @Value("${unavora.staff-session.mfa-absolute:PT8H}") Duration mfaAbsolute) {
        this.jdbc = jdbc;
        this.idp = idp;
        this.idle = idle;
        this.absolute = absolute;
        this.mfaAbsolute = mfaAbsolute;
    }

    @Transactional
    StartResult start(String language) {
        String lang = "hi".equals(language) ? "hi" : "en";
        String state = Hashing.randomToken(32);
        String nonce = Hashing.randomToken(32);
        String verifier = Hashing.randomToken(48);               // 64 chars, RFC 7636 range 43..128
        jdbc.sql("DELETE FROM staff_auth_requests WHERE expires_at < now() - interval '1 day'").update();
        jdbc.sql("""
                INSERT INTO staff_auth_requests (state_hash, nonce, code_verifier, language, expires_at)
                VALUES (:h, :n, :v, :l, now() + CAST(:ttl AS interval))""")
                .param("h", Hashing.sha256(state)).param("n", nonce).param("v", verifier).param("l", lang)
                .param("ttl", REQUEST_TTL.toSeconds() + " seconds").update();
        return new StartResult(idp.authorizationUrl(state, nonce, challenge(verifier), lang), state);
    }

    /** Denials are committed (audit rows) even though the call fails, hence noRollbackFor. */
    @Transactional(noRollbackFor = ApiException.class)
    LoginResult complete(String code, String state, String ipHash) {
        record Pending(UUID id, String nonce, String verifier, String lang) {}
        Pending p = jdbc.sql("""
                SELECT id, nonce, code_verifier, language FROM staff_auth_requests
                WHERE state_hash = :h AND consumed_at IS NULL AND expires_at > now() FOR UPDATE""")
                .param("h", Hashing.sha256(state == null ? "" : state))
                .query((rs, n) -> new Pending(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getString(4)))
                .optional()
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "login_expired", "This sign-in link has expired. Please sign in again."));
        jdbc.sql("UPDATE staff_auth_requests SET consumed_at = now() WHERE id = :id").param("id", p.id()).update();

        StaffIdentityProvider.VerifiedIdentity identity = idp.exchange(code, p.verifier(), p.nonce());

        UUID userId = jdbc.sql("SELECT id FROM users WHERE external_subject = :s AND status = 'active'")
                .param("s", identity.subject()).query(UUID.class).optional().orElse(null);
        if (userId == null) {
            audit(null, "staff.login_denied", "denied", ipHash, "{\"reason\":\"not_invited\"}");
            throw new ApiException(HttpStatus.FORBIDDEN, "not_invited",
                    "Your account has not been invited to the UNAVORA CRM. Please contact the director.");
        }
        boolean mfaRequired = requiresMfa(userId);
        boolean mfa = identity.hasSecondFactor();
        if (mfaRequired && !mfa) {
            audit(userId, "staff.login_denied", "denied", ipHash, "{\"reason\":\"mfa_required\"}");
            throw new ApiException(HttpStatus.FORBIDDEN, "mfa_required",
                    "Your role requires two-step verification (authenticator code). Please sign in again with it.");
        }

        String token = Hashing.randomToken(32);
        Duration abs = mfaRequired ? mfaAbsolute : absolute;
        String methods = String.join(" ", identity.authMethods());
        OffsetDateTime expiresAt = jdbc.sql("""
                INSERT INTO user_sessions (session_token_hash, user_id, idle_expires_at, absolute_expires_at, mfa_verified_at,
                                           auth_methods, ip_hash)
                VALUES (:h, :u, now() + CAST(:idle AS interval), now() + CAST(:abs AS interval),
                        CASE WHEN :mfa THEN now() END, :m, :ip)
                RETURNING absolute_expires_at""")
                .param("h", Hashing.sha256(token)).param("u", userId)
                .param("idle", idle.toSeconds() + " seconds").param("abs", abs.toSeconds() + " seconds")
                .param("mfa", mfa).param("m", methods.length() > 100 ? methods.substring(0, 100) : methods)
                .param("ip", ipHash == null ? null : ipHash.getBytes(StandardCharsets.UTF_8))
                .query(OffsetDateTime.class).single();
        jdbc.sql("UPDATE users SET last_login_at = now(), mfa_enrolled = (mfa_enrolled OR :mfa) WHERE id = :u")
                .param("mfa", mfa).param("u", userId).update();
        audit(userId, "staff.login", "success", ipHash, "{\"mfa\":" + mfa + "}");
        return new LoginResult(token, expiresAt, idle.toSeconds(), p.lang());
    }

    @Override
    @Transactional
    public Optional<StaffPrincipal> resolve(String token) {
        if (token == null || token.isBlank() || token.length() > 100) return Optional.empty();
        record Row(UUID id, UUID userId, boolean mfa) {}
        Optional<Row> row = jdbc.sql("""
                UPDATE user_sessions s
                SET last_seen_at = now(), idle_expires_at = least(now() + CAST(:idle AS interval), s.absolute_expires_at)
                FROM users u
                WHERE s.session_token_hash = :h AND s.revoked_at IS NULL
                  AND s.idle_expires_at > now() AND s.absolute_expires_at > now()
                  AND u.id = s.user_id AND u.status = 'active'
                RETURNING s.id, s.user_id, s.mfa_verified_at IS NOT NULL""")
                .param("h", Hashing.sha256(token)).param("idle", idle.toSeconds() + " seconds")
                .query((rs, n) -> new Row(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getBoolean(3)))
                .optional();
        if (row.isEmpty()) return Optional.empty();
        if (!row.get().mfa() && requiresMfa(row.get().userId())) return Optional.empty();
        return Optional.of(new StaffPrincipal(row.get().userId(), row.get().id(), row.get().mfa()));
    }

    @Transactional
    void logout(String token) {
        if (token == null || token.isBlank()) return;
        jdbc.sql("""
                UPDATE user_sessions SET revoked_at = now() WHERE session_token_hash = :h AND revoked_at IS NULL
                RETURNING user_id""").param("h", Hashing.sha256(token)).query(UUID.class).optional()
                .ifPresent(u -> audit(u, "staff.logout", "success", null, null));
    }

    boolean requiresMfa(UUID userId) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                               WHERE ur.user_id = :u AND r.requires_mfa)""")
                .param("u", userId).query(Boolean.class).single();
    }

    private void audit(UUID userId, String action, String outcome, String ipHash, String metadata) {
        jdbc.sql("""
                INSERT INTO audit_logs (actor_user_id, actor_label, action, entity_type, entity_id, outcome, ip_hash, metadata_json)
                VALUES (:u, 'staff', :a, 'user', :id, :o, :ip, :m)""")
                .param("u", userId).param("a", action).param("id", userId == null ? null : userId.toString())
                .param("o", outcome).param("ip", ipHash).param("m", metadata).update();
    }

    static String challenge(String verifier) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(d);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
