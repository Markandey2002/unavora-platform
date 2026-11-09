package com.unavora.crm.internal;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/public")
class EnquiryController {
    private final EnquiryService service;

    EnquiryController(EnquiryService service) { this.service = service; }

    record EnquiryRequest(
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Size(max = 20) String phone,
            @Email @Size(max = 254) String email,
            @Size(max = 2000) String message,
            UUID propertyId,
            @Size(max = 2) String language,
            @AssertTrue(message = "Consent is required to contact you") boolean consent,
            /** Optional, separate from the enquiry consent. null = question not asked; false = explicitly declined. */
            Boolean marketingConsent,
            /** Optional: general | callback | site_visit | residential | commercial | project. Ignored with propertyId. */
            @Size(max = 30) String enquiryType) {}

    /** Website channel-partner application: stored as a channel_partners row (status applied) plus a CRM lead. */
    record PartnerRequest(
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Size(max = 20) String phone,
            @Email @Size(max = 254) String email,
            @Size(max = 200) String companyName,
            @NotBlank @Size(max = 100) String city,
            @Size(max = 500) String areasOfInterest,
            /** Declared by the applicant; recorded as declared, never shown as verified. */
            @Size(max = 60) String reraNumber,
            @Size(max = 2000) String message,
            @Size(max = 2) String language,
            @AssertTrue(message = "Consent is required to contact you") boolean consent) {}

    record EnquiryResponse(String reference, String status) {}

    @PostMapping("/enquiries")
    ResponseEntity<EnquiryResponse> create(@Valid @RequestBody EnquiryRequest body,
                                           @RequestHeader(value = "Idempotency-Key", required = false) UUID idempotencyKey,
                                           HttpServletRequest http) {
        var result = service.submit(body, idempotencyKey, http.getRemoteAddr());
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(new EnquiryResponse(result.reference(), "received"));
    }

    @PostMapping("/channel-partners")
    ResponseEntity<EnquiryResponse> partner(@Valid @RequestBody PartnerRequest body,
                                            @RequestHeader(value = "Idempotency-Key", required = false) UUID idempotencyKey,
                                            HttpServletRequest http) {
        var result = service.submitPartner(body, idempotencyKey, http.getRemoteAddr());
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(new EnquiryResponse(result.reference(), "received"));
    }
}
