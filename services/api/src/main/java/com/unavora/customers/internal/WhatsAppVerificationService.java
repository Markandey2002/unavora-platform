package com.unavora.customers.internal;

import com.unavora.platform.ApiException;
import com.unavora.platform.Hashing;
import com.unavora.platform.PhoneNumbers;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * WhatsApp number verification by one-time code.
 *  - 6-digit code, valid 10 minutes, max 5 wrong attempts, a new request supersedes older codes.
 *  - Max 5 codes per customer per hour and 30 s between requests.
 *  - Only HMAC-SHA256(secret, verificationId:code) is stored; the code is never logged.
 */
@Service
class WhatsAppVerificationService {

    record OtpRequested(int expiresInSeconds, int resendAfterSeconds, boolean alreadyVerified) {}

    static final int CODE_DIGITS = 6;
    static final Duration TTL = Duration.ofMinutes(10);
    static final int RESEND_AFTER_SECONDS = 30;
    static final int MAX_PER_HOUR = 5;

    private final JdbcClient jdbc;
    private final WhatsAppOtpSender sender;
    private final String secret;

    WhatsAppVerificationService(JdbcClient jdbc, WhatsAppOtpSender sender, @Value("${unavora.otp.secret:}") String secret) {
        this.jdbc = jdbc;
        this.sender = sender;
        this.secret = secret;
    }

    @Transactional
    OtpRequested request(UUID customerId, String rawPhone, String language) {
        String phone = PhoneNumbers.toE164(rawPhone);
        requireSecret();
        boolean already = jdbc.sql("SELECT whatsapp_e164 = :p AND whatsapp_verified_at IS NOT NULL FROM customers WHERE id = :c")
                .param("p", phone).param("c", customerId).query(Boolean.class).optional().orElse(false);
        if (already) return new OtpRequested(0, 0, true);

        // Serialise per customer so the limits below cannot be raced.
        jdbc.sql("SELECT id FROM customers WHERE id = :c FOR UPDATE").param("c", customerId).query(UUID.class).single();
        var recent = jdbc.sql("""
                SELECT count(*) AS n, coalesce(extract(epoch FROM now() - max(created_at)), 1e9) AS since
                FROM phone_verifications WHERE customer_id = :c AND created_at > now() - interval '1 hour'""")
                .param("c", customerId).query((rs, i) -> new long[]{rs.getLong("n"), (long) rs.getDouble("since")}).single();
        if (recent[0] >= MAX_PER_HOUR) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "otp_rate_limited", "Too many codes requested. Please try again later.");
        }
        if (recent[1] < RESEND_AFTER_SECONDS) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "otp_resend_too_soon", "Please wait before requesting another code.");
        }

        jdbc.sql("""
                UPDATE phone_verifications SET superseded_at = now()
                WHERE customer_id = :c AND verified_at IS NULL AND superseded_at IS NULL""").param("c", customerId).update();

        UUID id = UUID.randomUUID();
        String code = Hashing.randomDigits(CODE_DIGITS);
        WhatsAppOtpSender.Sent sent = sender.send(phone, code, "hi".equals(language) ? "hi" : "en");
        jdbc.sql("""
                INSERT INTO phone_verifications (id, customer_id, phone_e164, code_hash, provider, provider_message_id, expires_at)
                VALUES (:id, :c, :p, :h, :prov, :msg, now() + CAST(:ttl AS interval))""")
                .param("id", id).param("c", customerId).param("p", phone).param("h", codeHash(id, code))
                .param("prov", sent.provider()).param("msg", sent.providerMessageId())
                .param("ttl", TTL.toSeconds() + " seconds").update();
        audit(customerId, "customer.whatsapp_otp_sent", "{\"provider\":\"" + sent.provider() + "\"}");
        return new OtpRequested((int) TTL.toSeconds(), RESEND_AFTER_SECONDS, false);
    }

    /** Wrong attempts are counted even though the call fails, hence noRollbackFor. */
    @Transactional(noRollbackFor = ApiException.class)
    void verify(UUID customerId, String rawPhone, String code) {
        String phone = PhoneNumbers.toE164(rawPhone);
        requireSecret();
        record Row(UUID id, byte[] hash, int attempts, int max, OffsetDateTime expires) {}
        Row row = jdbc.sql("""
                SELECT id, code_hash, attempts, max_attempts, expires_at FROM phone_verifications
                WHERE customer_id = :c AND phone_e164 = :p AND verified_at IS NULL AND superseded_at IS NULL
                ORDER BY created_at DESC LIMIT 1 FOR UPDATE""")
                .param("c", customerId).param("p", phone)
                .query((rs, n) -> new Row(rs.getObject("id", UUID.class), rs.getBytes("code_hash"), rs.getInt("attempts"),
                        rs.getInt("max_attempts"), rs.getObject("expires_at", OffsetDateTime.class)))
                .optional()
                .orElseThrow(() -> new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "otp_not_requested", "Please request a new code."));

        if (row.attempts() >= row.max()) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "otp_locked", "Too many wrong attempts. Please request a new code.");
        }
        if (row.expires().isBefore(OffsetDateTime.now())) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "otp_expired", "This code has expired. Please request a new code.");
        }
        if (code == null || !code.matches("\\d{" + CODE_DIGITS + "}") || !Hashing.equal(row.hash(), codeHash(row.id(), code))) {
            jdbc.sql("UPDATE phone_verifications SET attempts = attempts + 1 WHERE id = :id").param("id", row.id()).update();
            audit(customerId, "customer.whatsapp_otp_failed", null);
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "otp_invalid", "The code is not correct.");
        }

        jdbc.sql("UPDATE phone_verifications SET verified_at = now() WHERE id = :id").param("id", row.id()).update();
        jdbc.sql("""
                UPDATE customers SET whatsapp_e164 = :p, whatsapp_verified_at = now(),
                       phone_e164 = coalesce(phone_e164, :p), last_interaction_at = now()
                WHERE id = :c""").param("p", phone).param("c", customerId).update();
        jdbc.sql("""
                INSERT INTO lead_activities (customer_id, activity_type, summary)
                VALUES (:c, 'phone_verified', 'WhatsApp number verified by one-time code')""").param("c", customerId).update();
        // Shared numbers are legitimate (families, agents); flag for staff review, never auto-merge.
        jdbc.sql("""
                INSERT INTO customer_duplicate_candidates (customer_a_id, customer_b_id, reason)
                SELECT o.id, :c, 'shared_phone' FROM customers o
                WHERE o.id <> :c AND o.status = 'active' AND (o.phone_e164 = :p OR o.whatsapp_e164 = :p)
                ON CONFLICT DO NOTHING""").param("c", customerId).param("p", phone).update();
        audit(customerId, "customer.whatsapp_verified", null);
    }

    private byte[] codeHash(UUID id, String code) { return Hashing.hmacSha256(secret, id + ":" + code); }

    private void requireSecret() {
        if (secret == null || secret.length() < 16) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "whatsapp_unavailable", "WhatsApp verification is not available yet");
        }
    }

    private void audit(UUID customerId, String action, String metadata) {
        jdbc.sql("""
                INSERT INTO audit_logs (actor_label, action, entity_type, entity_id, metadata_json)
                VALUES ('customer', :a, 'customer', :id, :m)""")
                .param("a", action).param("id", customerId.toString()).param("m", metadata).update();
    }
}
