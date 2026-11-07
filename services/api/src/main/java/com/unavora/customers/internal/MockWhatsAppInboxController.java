package com.unavora.customers.internal;

import com.unavora.platform.ApiException;
import com.unavora.platform.PhoneNumbers;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * LOCAL/TEST ONLY: lets developers, Playwright and the validation scripts read the code the mock WhatsApp adapter
 * "sent". The bean does not exist unless unavora.otp.whatsapp.mode=mock, and it still needs the service credential.
 */
@RestController
@ConditionalOnProperty(name = "unavora.otp.whatsapp.mode", havingValue = "mock")
class MockWhatsAppInboxController {
    private final MockWhatsAppOtpSender sender;

    MockWhatsAppInboxController(MockWhatsAppOtpSender sender) { this.sender = sender; }

    @GetMapping("/internal/v1/dev/mock-whatsapp/latest")
    MockWhatsAppOtpSender.MockMessage latest(@RequestParam String phone) {
        return sender.latestFor(PhoneNumbers.toE164(phone))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "No mock message for this number"));
    }
}
