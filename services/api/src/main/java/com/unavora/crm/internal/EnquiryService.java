package com.unavora.crm.internal;

import com.unavora.platform.ApiException;
import com.unavora.platform.Hashing;
import com.unavora.platform.PhoneNumbers;
import com.unavora.platform.RateLimiter;
import com.unavora.properties.api.PropertyLookup;
import java.time.Duration;
import java.util.Optional;
import java.util.Set;
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

    /** Enquiry types a website visitor may choose (all allowed by ck_leads_enquiry_type). */
    static final Set<String> VISITOR_TYPES = Set.of("general", "callback", "site_visit", "residential", "commercial", "project");

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
        String ipHash = rateLimit(clientIp);
        Optional<String> existing = existing(idempotencyKey);
        if (existing.isPresent()) return new EnquiryResult(existing.get(), false);
        String visitorType = req.enquiryType() == null || req.enquiryType().isBlank() ? null : req.enquiryType().trim();
        if (visitorType != null && !VISITOR_TYPES.contains(visitorType)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_enquiry_type", "Choose a valid enquiry type");
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

        UUID customerId = customer(req.name(), phone, email, req.language(), null);

        leads.recordConsent(customerId, "service_contact", true, "website_enquiry");
        if (req.marketingConsent() != null) {
            leads.recordConsent(customerId, "marketing_whatsapp", req.marketingConsent(), "website_enquiry");
        }

        var created = leads.create(new LeadWriter.LeadDraft(customerId,
                req.propertyId() != null ? "website_property" : "website_contact", req.propertyId(),
                req.propertyId() != null ? "property" : (visitorType != null ? visitorType : "general"), blankToNull(req.message()), assignee,
                req.propertyId() != null ? 20 : 0, idempotencyKey, null, null,
                req.propertyId() != null ? "Property enquiry received from website" : "General enquiry received from website",
                "public", ipHash));
        return new EnquiryResult(created.reference(), true);
    }

    /** Channel-partner application: customer (category channel_partner when new) + channel_partners row + CRM lead. */
    @Transactional
    EnquiryResult submitPartner(EnquiryController.PartnerRequest req, UUID idempotencyKey, String clientIp) {
        String ipHash = rateLimit(clientIp);
        Optional<String> existing = existing(idempotencyKey);
        if (existing.isPresent()) return new EnquiryResult(existing.get(), false);

        String phone = PhoneNumbers.toE164(req.phone());
        String email = req.email() == null || req.email().isBlank() ? null : req.email().trim().toLowerCase();
        UUID customerId = customer(req.name(), phone, email, req.language(), "channel_partner");
        leads.recordConsent(customerId, "service_contact", true, "website_channel_partner");

        jdbc.sql("""
                INSERT INTO channel_partners (customer_id, full_name, company_name, phone_e164, email_normalized, city,
                                              areas_of_interest, rera_number_declared, status)
                VALUES (:c, :n, :co, :p, :e, :city, :areas, :rera, 'applied')""")
                .param("c", customerId).param("n", req.name().trim()).param("co", blankToNull(req.companyName()))
                .param("p", phone).param("e", email).param("city", req.city().trim())
                .param("areas", blankToNull(req.areasOfInterest())).param("rera", blankToNull(req.reraNumber())).update();

        StringBuilder summary = new StringBuilder("Channel partner application.");
        if (blankToNull(req.companyName()) != null) summary.append(" Company: ").append(req.companyName().trim()).append('.');
        summary.append(" City: ").append(req.city().trim()).append('.');
        if (blankToNull(req.areasOfInterest()) != null) summary.append(" Areas: ").append(req.areasOfInterest().trim()).append('.');
        if (blankToNull(req.reraNumber()) != null) summary.append(" RERA (declared, not verified): ").append(req.reraNumber().trim()).append('.');
        if (blankToNull(req.message()) != null) summary.append(" Message: ").append(req.message().trim());
        String message = summary.length() > 2000 ? summary.substring(0, 2000) : summary.toString();

        var created = leads.create(new LeadWriter.LeadDraft(customerId, "website_channel_partner", null, "channel_partner",
                message, null, 10, idempotencyKey, null, null, "Channel partner application received from website",
                "public", ipHash));
        return new EnquiryResult(created.reference(), true);
    }

    private String rateLimit(String clientIp) {
        String ipHash = Hashing.sha256Hex(clientIp == null ? "unknown" : clientIp);
        if (!limiter.tryAcquire("enquiry:" + ipHash, perIpPerHour, Duration.ofHours(1))) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", "Too many requests. Please try again later.");
        }
        return ipHash;
    }

    private Optional<String> existing(UUID idempotencyKey) {
        if (idempotencyKey == null) return Optional.empty();
        return jdbc.sql("SELECT public_ref FROM leads WHERE idempotency_key = :k").param("k", idempotencyKey).query(String.class).optional();
    }

    /** Same phone = same customer (shared-phone rule from Slice 1); new customers get the website signup source. */
    private UUID customer(String name, String phone, String email, String language, String category) {
        UUID customerId = jdbc.sql("""
                SELECT id FROM customers WHERE status = 'active' AND phone_e164 = :p ORDER BY created_at LIMIT 1""")
                .param("p", phone).query(UUID.class).optional().orElse(null);
        if (customerId == null) {
            return jdbc.sql("""
                    INSERT INTO customers (public_ref, full_name, phone_e164, email_normalized, preferred_language,
                                           signup_source, category, last_interaction_at)
                    VALUES ('CUS-' || lpad(nextval('customer_ref_seq')::text, 6, '0'), :n, :p, :e, :l, 'website_enquiry', :cat, now())
                    RETURNING id""")
                    .param("n", name.trim()).param("p", phone).param("e", email)
                    .param("l", "hi".equals(language) ? "hi" : "en").param("cat", category).query(UUID.class).single();
        }
        jdbc.sql("UPDATE customers SET last_interaction_at = now() WHERE id = :id").param("id", customerId).update();
        return customerId;
    }

    static String blankToNull(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
