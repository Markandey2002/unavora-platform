package com.unavora.customers.internal;

import com.unavora.platform.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;

/**
 * Chooses the identity and OTP adapters. Defaults are "disabled": staging/production must opt in explicitly, and the
 * mock adapters are only switched on by application-local.yml / application-test.yml.
 */
@Configuration
class CustomerAdaptersConfig {

    @Bean
    GoogleIdentityVerifier googleIdentityVerifier(@Value("${unavora.customer-auth.google.mode:disabled}") String mode,
                                                  @Value("${unavora.customer-auth.google.client-id:}") String clientId) {
        return switch (mode) {
            case "mock" -> new MockGoogleIdentityVerifier();
            case "google" -> new GoogleIdTokenVerifier(clientId);
            case "disabled" -> new GoogleIdentityVerifier() {
                public GoogleProfile verify(String c) {
                    throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "google_signin_unavailable", "Google sign-in is not available");
                }
                public String mode() { return "disabled"; }
            };
            default -> throw new IllegalStateException("Unknown unavora.customer-auth.google.mode: " + mode);
        };
    }

    @Bean
    @ConditionalOnProperty(name = "unavora.otp.whatsapp.mode", havingValue = "mock")
    MockWhatsAppOtpSender mockWhatsAppOtpSender() { return new MockWhatsAppOtpSender(); }

    @Bean
    @ConditionalOnProperty(name = "unavora.otp.whatsapp.mode", havingValue = "disabled", matchIfMissing = true)
    WhatsAppOtpSender disabledWhatsAppOtpSender() {
        return (phone, code, lang) -> {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "whatsapp_unavailable",
                    "WhatsApp verification is not available yet");
        };
    }
}
