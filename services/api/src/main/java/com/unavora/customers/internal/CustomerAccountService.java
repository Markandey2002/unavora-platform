package com.unavora.customers.internal;

import com.unavora.customers.api.CustomerSessions;
import com.unavora.platform.ApiException;
import com.unavora.platform.Hashing;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Customer registration/login with Google and website customer sessions.
 *  - First login creates exactly one `customers` row + one `customer_identities` row (registered_at, signup_source).
 *  - Later logins only update last_login_at / login_count: UNIQUE (provider, provider_subject) plus a transaction-
 *    scoped advisory lock make duplicate profiles impossible, even for two simultaneous first logins.
 *  - An existing enquiry-only customer with the same email is NOT silently merged (its email was never verified);
 *    a `customer_duplicate_candidates` row is raised for staff review instead.
 */
@Service
class CustomerAccountService implements CustomerSessions {

    record CustomerProfile(String reference, String name, String email, String whatsappNumber, boolean whatsappVerified,
                           OffsetDateTime registeredAt, OffsetDateTime lastLoginAt, String preferredLanguage) {}

    record LoginResult(String sessionToken, OffsetDateTime expiresAt, boolean newAccount, CustomerProfile customer) {}

    private final JdbcClient jdbc;
    private final Duration idle;
    private final Duration absolute;

    CustomerAccountService(JdbcClient jdbc,
                           @Value("${unavora.customer-session.idle:P7D}") Duration idle,
                           @Value("${unavora.customer-session.absolute:P30D}") Duration absolute) {
        this.jdbc = jdbc;
        this.idle = idle;
        this.absolute = absolute;
    }

    @Transactional
    LoginResult loginWithGoogle(GoogleIdentityVerifier.GoogleProfile g, String language, String ipHash) {
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtext(:k))").param("k", "google:" + g.subject()).query(Object.class).single();

        Optional<UUID> existing = jdbc.sql("SELECT customer_id FROM customer_identities WHERE provider = 'google' AND provider_subject = :s")
                .param("s", g.subject()).query(UUID.class).optional();
        boolean newAccount = existing.isEmpty();
        UUID customerId;
        if (existing.isPresent()) {
            customerId = existing.get();
            jdbc.sql("""
                    UPDATE customer_identities SET last_login_at = now(), login_count = login_count + 1,
                           email = :e, email_verified = :ev, display_name = coalesce(:n, display_name)
                    WHERE provider = 'google' AND provider_subject = :s""")
                    .param("e", g.email()).param("ev", g.emailVerified()).param("n", g.name()).param("s", g.subject()).update();
            jdbc.sql("UPDATE customers SET last_interaction_at = now() WHERE id = :id").param("id", customerId).update();
        } else {
            String name = g.name() != null && !g.name().isBlank() ? g.name().trim() : g.email().substring(0, g.email().indexOf('@'));
            customerId = jdbc.sql("""
                    INSERT INTO customers (public_ref, full_name, email_normalized, preferred_language, registered_at,
                                           signup_source, last_interaction_at)
                    VALUES ('CUS-' || lpad(nextval('customer_ref_seq')::text, 6, '0'), :n, :e, :l, now(), 'google', now())
                    RETURNING id""")
                    .param("n", name).param("e", g.email()).param("l", "hi".equals(language) ? "hi" : "en")
                    .query(UUID.class).single();
            jdbc.sql("""
                    INSERT INTO customer_identities (customer_id, provider, provider_subject, email, email_verified, display_name)
                    VALUES (:c, 'google', :s, :e, :ev, :n)""")
                    .param("c", customerId).param("s", g.subject()).param("e", g.email())
                    .param("ev", g.emailVerified()).param("n", g.name()).update();
            jdbc.sql("""
                    INSERT INTO lead_activities (customer_id, activity_type, summary)
                    VALUES (:c, 'account_registered', 'Customer registered on the website with Google')""")
                    .param("c", customerId).update();
            jdbc.sql("""
                    INSERT INTO customer_duplicate_candidates (customer_a_id, customer_b_id, reason)
                    SELECT o.id, :c, 'shared_email' FROM customers o
                    WHERE o.id <> :c AND o.status = 'active' AND o.email_normalized = :e
                    ON CONFLICT DO NOTHING""")
                    .param("c", customerId).param("e", g.email()).update();
            audit(customerId, "customer.registered", ipHash);
        }
        audit(customerId, "customer.login", ipHash);

        String token = Hashing.randomToken(32);
        OffsetDateTime absoluteExpiry = jdbc.sql("""
                INSERT INTO customer_sessions (session_token_hash, customer_id, idle_expires_at, absolute_expires_at)
                VALUES (:h, :c, now() + CAST(:idle AS interval), now() + CAST(:abs AS interval))
                RETURNING absolute_expires_at""")
                .param("h", Hashing.sha256(token)).param("c", customerId)
                .param("idle", idle.toSeconds() + " seconds").param("abs", absolute.toSeconds() + " seconds")
                .query(OffsetDateTime.class).single();
        return new LoginResult(token, absoluteExpiry, newAccount, profile(customerId));
    }

    @Transactional
    void logout(String token) {
        if (token == null || token.isBlank()) return;
        jdbc.sql("UPDATE customer_sessions SET revoked_at = now() WHERE session_token_hash = :h AND revoked_at IS NULL")
                .param("h", Hashing.sha256(token)).update();
    }

    CustomerProfile profile(UUID customerId) {
        return jdbc.sql("""
                SELECT c.public_ref, c.full_name, coalesce(ci.email, c.email_normalized) AS email, c.whatsapp_e164,
                       c.whatsapp_verified_at IS NOT NULL AS wa_verified, ci.registered_at, ci.last_login_at,
                       c.preferred_language
                FROM customers c
                LEFT JOIN LATERAL (SELECT * FROM customer_identities x WHERE x.customer_id = c.id
                                   ORDER BY x.last_login_at DESC LIMIT 1) ci ON true
                WHERE c.id = :id""")
                .param("id", customerId)
                .query((rs, n) -> new CustomerProfile(rs.getString("public_ref"), rs.getString("full_name"),
                        rs.getString("email"), rs.getString("whatsapp_e164"), rs.getBoolean("wa_verified"),
                        rs.getObject("registered_at", OffsetDateTime.class), rs.getObject("last_login_at", OffsetDateTime.class),
                        rs.getString("preferred_language")))
                .single();
    }

    @Override
    @Transactional
    public Optional<UUID> resolve(String token) {
        if (token == null || token.isBlank() || token.length() > 100) return Optional.empty();
        return jdbc.sql("""
                UPDATE customer_sessions
                SET last_seen_at = now(), idle_expires_at = least(now() + CAST(:idle AS interval), absolute_expires_at)
                WHERE session_token_hash = :h AND revoked_at IS NULL
                  AND idle_expires_at > now() AND absolute_expires_at > now()
                RETURNING customer_id""")
                .param("h", Hashing.sha256(token)).param("idle", idle.toSeconds() + " seconds")
                .query(UUID.class).optional();
    }

    @Override
    public UUID require(String token) {
        return resolve(token).orElseThrow(() ->
                new ApiException(HttpStatus.UNAUTHORIZED, "session_required", "Please sign in again"));
    }

    @Override
    public boolean hasVerifiedWhatsApp(UUID customerId) {
        return jdbc.sql("SELECT whatsapp_verified_at IS NOT NULL FROM customers WHERE id = :id")
                .param("id", customerId).query(Boolean.class).optional().orElse(false);
    }

    private void audit(UUID customerId, String action, String ipHash) {
        jdbc.sql("""
                INSERT INTO audit_logs (actor_label, action, entity_type, entity_id, ip_hash)
                VALUES ('customer', :a, 'customer', :id, :ip)""")
                .param("a", action).param("id", customerId.toString()).param("ip", ipHash).update();
    }
}
