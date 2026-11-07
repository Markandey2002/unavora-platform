package com.unavora.identity.internal;

import com.unavora.identity.AccessService;
import com.unavora.identity.StaffPrincipal;
import com.unavora.identity.StaffSessions;
import com.unavora.platform.ApiException;
import com.unavora.platform.Hashing;
import com.unavora.platform.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * BFF-only (service credential) staff sign-in endpoints, plus /internal/v1/staff/me for a signed-in staff session.
 * Never routed publicly; the browser only ever sees the BFF's HttpOnly cookie.
 */
@RestController
class StaffAuthController {
    private final StaffSessionService sessions;
    private final AccessService access;
    private final RateLimiter limiter;
    private final JdbcClient jdbc;

    StaffAuthController(StaffSessionService sessions, AccessService access, RateLimiter limiter, JdbcClient jdbc) {
        this.sessions = sessions;
        this.access = access;
        this.limiter = limiter;
        this.jdbc = jdbc;
    }

    record StartRequest(@Size(max = 2) String language) {}

    record CompleteRequest(@NotBlank @Size(max = 4096) String code, @NotBlank @Size(max = 200) String state) {}

    record Me(UUID id, String name, String email, String preferredLanguage, List<String> roles, List<String> permissions,
              boolean mfaVerified, boolean mfaRequired) {}

    @PostMapping("/internal/v1/staff-auth/start")
    StaffSessionService.StartResult start(@Valid @RequestBody(required = false) StartRequest body, HttpServletRequest http) {
        limit(http, "staff-start", 30);
        return sessions.start(body == null ? "en" : body.language());
    }

    @PostMapping("/internal/v1/staff-auth/complete")
    StaffSessionService.LoginResult complete(@Valid @RequestBody CompleteRequest body, HttpServletRequest http) {
        String ipHash = limit(http, "staff-complete", 30);
        return sessions.complete(body.code(), body.state(), ipHash);
    }

    @PostMapping("/internal/v1/staff-auth/logout")
    ResponseEntity<Void> logout(@RequestHeader(value = StaffSessions.HEADER, required = false) String session) {
        sessions.logout(session);
        return ResponseEntity.noContent().build();
    }

    /** Requires a valid staff session (enforced by the internal filter chain); MFA policy enforced by AccessService. */
    @GetMapping("/internal/v1/staff/me")
    Me me() {
        UUID me = access.currentUserId().orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Not permitted"));
        boolean mfa = SecurityContextHolder.getContext().getAuthentication().getPrincipal() instanceof StaffPrincipal p && p.mfaVerified();
        var user = jdbc.sql("SELECT full_name, email, preferred_language FROM users WHERE id = :u").param("u", me)
                .query((rs, n) -> new String[]{rs.getString(1), rs.getString(2), rs.getString(3)}).single();
        List<String> roles = jdbc.sql("""
                SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = :u ORDER BY r.code""")
                .param("u", me).query(String.class).list();
        List<String> perms = jdbc.sql("""
                SELECT DISTINCT p.code FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
                JOIN permissions p ON p.id = rp.permission_id WHERE ur.user_id = :u ORDER BY p.code""")
                .param("u", me).query(String.class).list();
        return new Me(me, user[0], user[1], user[2], roles, perms, mfa, sessions.requiresMfa(me));
    }

    private String limit(HttpServletRequest http, String bucket, int perTenMinutes) {
        String ipHash = Hashing.sha256Hex(http.getRemoteAddr() == null ? "unknown" : http.getRemoteAddr());
        if (!limiter.tryAcquire(bucket + ":" + ipHash, perTenMinutes, Duration.ofMinutes(10))) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", "Too many requests. Please try again later.");
        }
        return ipHash;
    }

}
