package com.unavora.identity;

import java.util.Optional;

/** Resolves an opaque staff website session (header {@link #HEADER}) for the internal security filter chain. */
public interface StaffSessions {

    String HEADER = "X-Staff-Session";

    /**
     * Valid only if the session exists, is not revoked, is within its idle AND absolute lifetime, the user is still
     * active, and, if any of the user's roles requires MFA, the session was created with MFA. Slides the idle expiry.
     */
    Optional<StaffPrincipal> resolve(String sessionToken);
}
