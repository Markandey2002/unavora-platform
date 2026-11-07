package com.unavora.customers.internal;

import com.unavora.customers.api.CustomerSessions;
import com.unavora.platform.ApiException;
import com.unavora.platform.Hashing;
import com.unavora.platform.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Website customer account endpoints, called ONLY by the Next.js BFF (service credential on /internal/**).
 * The browser never sees these URLs or the session token: the BFF keeps the token in an HttpOnly cookie.
 */
@RestController
@RequestMapping("/internal/v1")
class CustomerAccountController {
    private final GoogleIdentityVerifier google;
    private final CustomerAccountService accounts;
    private final WhatsAppVerificationService whatsapp;
    private final RateLimiter limiter;

    CustomerAccountController(GoogleIdentityVerifier google, CustomerAccountService accounts,
                              WhatsAppVerificationService whatsapp, RateLimiter limiter) {
        this.google = google;
        this.accounts = accounts;
        this.whatsapp = whatsapp;
        this.limiter = limiter;
    }

    record GoogleLoginRequest(@NotBlank @Size(max = 4096) String credential, @Size(max = 2) String language) {}

    record OtpRequest(@NotBlank @Size(max = 20) String phone, @Size(max = 2) String language) {}

    record OtpVerifyRequest(@NotBlank @Size(max = 20) String phone, @NotBlank @Size(max = 10) String code) {}

    @PostMapping("/customer-auth/google")
    CustomerAccountService.LoginResult google(@Valid @RequestBody GoogleLoginRequest body, HttpServletRequest http) {
        String ipHash = Hashing.sha256Hex(http.getRemoteAddr() == null ? "unknown" : http.getRemoteAddr());
        if (!limiter.tryAcquire("google-login:" + ipHash, 30, Duration.ofMinutes(10))) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", "Too many requests. Please try again later.");
        }
        return accounts.loginWithGoogle(google.verify(body.credential()), body.language(), ipHash);
    }

    @PostMapping("/customer-auth/logout")
    ResponseEntity<Void> logout(@RequestHeader(value = CustomerSessions.HEADER, required = false) String session) {
        accounts.logout(session);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/customer/me")
    CustomerAccountService.CustomerProfile me(@RequestHeader(value = CustomerSessions.HEADER, required = false) String session) {
        return accounts.profile(accounts.require(session));
    }

    @PostMapping("/customer/whatsapp/otp")
    ResponseEntity<WhatsAppVerificationService.OtpRequested> requestOtp(
            @RequestHeader(value = CustomerSessions.HEADER, required = false) String session, @Valid @RequestBody OtpRequest body) {
        var result = whatsapp.request(accounts.require(session), body.phone(), body.language());
        return ResponseEntity.status(result.alreadyVerified() ? HttpStatus.OK : HttpStatus.ACCEPTED).body(result);
    }

    @PostMapping("/customer/whatsapp/verify")
    CustomerAccountService.CustomerProfile verifyOtp(
            @RequestHeader(value = CustomerSessions.HEADER, required = false) String session, @Valid @RequestBody OtpVerifyRequest body) {
        var customerId = accounts.require(session);
        whatsapp.verify(customerId, body.phone(), body.code().trim());
        return accounts.profile(customerId);
    }
}
