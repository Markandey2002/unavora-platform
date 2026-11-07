package com.unavora.identity;

import java.util.UUID;

/**
 * A staff member authenticated through a website session (BFF). {@code mfaVerified} is true only if the identity
 * provider proved a second factor (amr contains "otp") when this session was created.
 */
public record StaffPrincipal(UUID userId, UUID sessionId, boolean mfaVerified) {}
