package com.unavora.crm.internal;

import com.unavora.customers.api.CustomerSessions;
import com.unavora.platform.ApiException;
import com.unavora.platform.Hashing;
import com.unavora.properties.api.PropertyLookup;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * A signed-in, WhatsApp-verified customer asks for something. EVERY request is a separate lead (enquiry, callback,
 * site visit), linked to the same customer profile. Enquiry consent is mandatory; marketing consent is a separate,
 * explicit yes/no recorded as its own consent row.
 */
@RestController
@RequestMapping("/internal/v1/customer")
class CustomerRequestController {
    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");

    private final CustomerSessions sessions;
    private final LeadWriter leads;
    private final PropertyLookup properties;
    private final JdbcClient jdbc;

    CustomerRequestController(CustomerSessions sessions, LeadWriter leads, PropertyLookup properties, JdbcClient jdbc) {
        this.sessions = sessions;
        this.leads = leads;
        this.properties = properties;
        this.jdbc = jdbc;
    }

    record CustomerRequest(
            @NotNull @Pattern(regexp = "enquiry|callback|site_visit") String type,
            UUID propertyId,
            @Size(max = 2000) String message,
            LocalDate preferredDate,
            LocalTime preferredTime,
            @AssertTrue(message = "Consent is required to contact you") boolean enquiryConsent,
            @NotNull(message = "Please answer the marketing question") Boolean marketingConsent) {}

    record CustomerRequestResult(String reference, String type, String status) {}

    @PostMapping("/requests")
    @Transactional
    ResponseEntity<CustomerRequestResult> create(@RequestHeader(value = CustomerSessions.HEADER, required = false) String session,
                                                 @RequestHeader(value = "Idempotency-Key", required = false) UUID idempotencyKey,
                                                 @Valid @RequestBody CustomerRequest req, HttpServletRequest http) {
        UUID customerId = sessions.require(session);
        if (!sessions.hasVerifiedWhatsApp(customerId)) {
            throw new ApiException(HttpStatus.CONFLICT, "whatsapp_not_verified", "Please verify your WhatsApp number first");
        }
        if (idempotencyKey != null) {
            var existing = jdbc.sql("SELECT public_ref, enquiry_type, customer_id FROM leads WHERE idempotency_key = :k")
                    .param("k", idempotencyKey)
                    .query((rs, n) -> new Object[]{rs.getString(1), rs.getString(2), rs.getObject(3, UUID.class)}).optional();
            if (existing.isPresent()) {
                if (!customerId.equals(existing.get()[2])) {
                    throw new ApiException(HttpStatus.CONFLICT, "idempotency_conflict", "Request already used");
                }
                return ResponseEntity.ok(new CustomerRequestResult((String) existing.get()[0], req.type(), "received"));
            }
        }
        if ("site_visit".equals(req.type()) && (req.propertyId() == null || req.preferredDate() == null)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "site_visit_details_required",
                    "Choose a property and a preferred date for the site visit");
        }
        if (req.preferredDate() != null && req.preferredDate().isBefore(LocalDate.now(INDIA))) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "date_in_past", "Choose a date from today onwards");
        }

        UUID assignee = null;
        if (req.propertyId() != null) {
            assignee = properties.findPubliclyVisible(req.propertyId())
                    .orElseThrow(() -> new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "property_unavailable",
                            "This property is no longer available")).assignedUserId();
        }

        leads.recordConsent(customerId, "service_contact", true, "customer_account");
        leads.recordConsent(customerId, "marketing_whatsapp", req.marketingConsent(), "customer_account");
        jdbc.sql("UPDATE customers SET last_interaction_at = now() WHERE id = :id").param("id", customerId).update();

        String enquiryType = switch (req.type()) {
            case "callback" -> "callback";
            case "site_visit" -> "site_visit";
            default -> req.propertyId() != null ? "property" : "general";
        };
        OffsetDateTime nextAt = null;
        String nextNote = null;
        if (req.preferredDate() != null) {
            nextAt = req.preferredDate().atTime(req.preferredTime() != null ? req.preferredTime() : LocalTime.of(11, 0))
                    .atZone(INDIA).toOffsetDateTime();
            nextNote = "Customer preferred " + ("site_visit".equals(req.type()) ? "site visit" : "contact") + " time";
        } else if ("callback".equals(req.type())) {
            nextAt = OffsetDateTime.now();
            nextNote = "Customer requested a callback";
        }
        String summary = switch (req.type()) {
            case "callback" -> "Callback requested by signed-in customer";
            case "site_visit" -> "Site visit requested by signed-in customer";
            default -> "Enquiry from signed-in customer";
        };
        int priority = switch (req.type()) { case "site_visit" -> 40; case "callback" -> 30; default -> req.propertyId() != null ? 20 : 10; };

        var created = leads.create(new LeadWriter.LeadDraft(customerId, "website_account", req.propertyId(), enquiryType,
                EnquiryService.blankToNull(req.message()), assignee, priority, idempotencyKey, nextAt, nextNote, summary,
                "customer", Hashing.sha256Hex(http.getRemoteAddr() == null ? "unknown" : http.getRemoteAddr())));
        return ResponseEntity.status(HttpStatus.CREATED).body(new CustomerRequestResult(created.reference(), req.type(), "received"));
    }
}
