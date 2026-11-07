package com.unavora.crm.internal;

import com.unavora.platform.ApiException;
import com.unavora.platform.Hashing;
import com.unavora.platform.PhoneNumbers;
import com.unavora.platform.RateLimiter;
import com.unavora.properties.api.PropertyLookup;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Public enquiry -> customer + lead in ONE transaction. Customer, lead, assignment, stage history, consent,
 * timeline entry, audit row and outbox event either all exist or none do.
 */
@Service
class EnquiryService {
    static final String NOTICE_VERSION = LeadWriter.NOTICE_VERSION;

    record EnquiryResult(String reference, boolean created) {}

    private final JdbcClient jdbc;
    private final PropertyLookup properties;
    private final RateLimiter limiter;
    private final LeadWriter leads;
    private final int perIpPerHour;

    EnquiryService(JdbcClient jdbc, PropertyLookup properties, RateLimiter limiter, LeadWriter leads,
                   @Value("${unavora.rate-limit.enquiry-per-ip-per-hour:10}") int perIpPerHour) {
        this.jdbc = jdbc;
        this.properties = properties;
        this.limiter = limiter;
        this.leads = leads;
        this.perIpPerHour = perIpPerHour;
    }

    @Transactional
    EnquiryResult submit(EnquiryController.EnquiryRequest req, UUID idempotencyKey, String clientIp) {
        String ipHash = Hashing.sha256Hex(clientIp == null ? "unknown" : clientIp);
        if (!limiter.tryAcquire("enquiry:" + ipHash, perIpPerHour, Duration.ofHours(1))) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", "Too many requests. Please try again later.");
        }
        if (idempotencyKey != null) {
            Optional<String> existing = jdbc.sql("SELECT public_ref FROM leads WHERE idempotency_key = :k")
                    .param("k", idempotencyKey).query(String.class).optional();
            if (existing.isPresent()) return new EnquiryResult(existing.get(), false);
        }

        String phone = PhoneNumbers.toE164(req.phone());
        String email = req.email() == null || req.email().isBlank() ? null : req.email().trim().toLowerCase();

        UUID assignee = null;
        if (req.propertyId() != null) {
            var listing = properties.findPubliclyVisible(req.propertyId())
                    .orElseThrow(() -> new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "property_unavailable",
                            "This property is no longer available"));
            assignee = listing.assignedUserId();
        }

        UUID customerId = jdbc.sql("""
                SELECT id FROM customers WHERE status = 'active' AND phone_e164 = :p ORDER BY created_at LIMIT 1""")
                .param("p", phone).query(UUID.class).optional().orElse(null);
        if (customerId == null) {
            customerId = jdbc.sql("""
                    INSERT INTO customers (public_ref, full_name, phone_e164, email_normalized, preferred_language,
                                           signup_source, last_interaction_at)
                    VALUES ('CUS-' || lpad(nextval('customer_ref_seq')::text, 6, '0'), :n, :p, :e, :l, 'website_enquiry', now())
                    RETURNING id""")
                    .param("n", req.name().trim()).param("p", phone).param("e", email)
                    .param("l", "hi".equals(req.language()) ? "hi" : "en").query(UUID.class).single();
        } else {
            jdbc.sql("UPDATE customers SET last_interaction_at = now() WHERE id = :id").param("id", customerId).update();
        }

        leads.recordConsent(customerId, "service_contact", true, "website_enquiry");
        if (req.marketingConsent() != null) {
            leads.recordConsent(customerId, "marketing_whatsapp", req.marketingConsent(), "website_enquiry");
        }

        var created = leads.create(new LeadWriter.LeadDraft(customerId,
                req.propertyId() != null ? "website_property" : "website_contact", req.propertyId(),
                req.propertyId() != null ? "property" : "general", blankToNull(req.message()), assignee,
                req.propertyId() != null ? 20 : 0, idempotencyKey, null, null,
                req.propertyId() != null ? "Property enquiry received from website" : "General enquiry received from website",
                "public", ipHash));
        return new EnquiryResult(created.reference(), true);
    }

    static String blankToNull(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
