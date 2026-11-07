package com.unavora.customers.api;

import java.util.Optional;
import java.util.UUID;

/** The only way other modules may resolve a signed-in website customer (no table access across modules). */
public interface CustomerSessions {

    /** Header the Next.js BFF uses to pass the opaque customer session token to /internal/v1/**. */
    String HEADER = "X-Customer-Session";

    /** Customer id for a valid, unexpired, unrevoked session token; slides the idle expiry. */
    Optional<UUID> resolve(String sessionToken);

    /** Same as {@link #resolve} but fails with 401 when absent/invalid. */
    UUID require(String sessionToken);

    /** True once the customer's WhatsApp number has been verified by OTP. */
    boolean hasVerifiedWhatsApp(UUID customerId);
}
