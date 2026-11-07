package com.unavora.identity;

import java.util.Collection;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

/**
 * Database-backed authorisation. The caller's credential only proves WHO they are; what they may do is read from
 * roles/permissions in PostgreSQL on every call, so revoking a role takes effect immediately.
 * Used from @PreAuthorize("@access.has('lead.read_all')").
 *
 * Two kinds of caller resolve to a users row:
 *  - website staff session (StaffPrincipal, via the BFF on /internal/v1/**)
 *  - bearer JWT (mobile / tools on /api/v1/**), mapped by its "sub"
 * MFA policy (server-side, not a UI check): if any of the user's roles has requires_mfa (director), the caller is
 * treated as having NO identity unless MFA was proven: StaffPrincipal.mfaVerified, or JWT "amr" containing a second
 * factor. Every permission check therefore fails for a director without MFA.
 */
@Component("access")
public class AccessService {
    private static final Set<String> SECOND_FACTORS = Set.of("otp", "mfa", "hwk");

    private final JdbcClient jdbc;

    public AccessService(JdbcClient jdbc) { this.jdbc = jdbc; }

    public Optional<UUID> currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return Optional.empty();
        UUID userId;
        boolean mfa;
        if (auth.getPrincipal() instanceof StaffPrincipal p) {
            userId = jdbc.sql("SELECT id FROM users WHERE id = :id AND status = 'active'")
                    .param("id", p.userId()).query(UUID.class).optional().orElse(null);
            mfa = p.mfaVerified();
        } else if (auth.getPrincipal() instanceof Jwt jwt) {
            userId = jdbc.sql("SELECT id FROM users WHERE external_subject = :sub AND status = 'active'")
                    .param("sub", jwt.getSubject()).query(UUID.class).optional().orElse(null);
            Object amr = jwt.getClaims().get("amr");
            mfa = amr instanceof Collection<?> c && c.stream().map(String::valueOf).anyMatch(SECOND_FACTORS::contains);
        } else {
            return Optional.empty();
        }
        if (userId == null) return Optional.empty();
        if (!mfa && requiresMfa(userId)) return Optional.empty();
        return Optional.of(userId);
    }

    public boolean has(String permission) {
        return currentUserId().map(id -> has(id, permission)).orElse(false);
    }

    public boolean has(UUID userId, String permission) {
        Integer n = jdbc.sql("""
                SELECT count(*) FROM user_roles ur
                JOIN role_permissions rp ON rp.role_id = ur.role_id
                JOIN permissions p ON p.id = rp.permission_id
                WHERE ur.user_id = :uid AND p.code = :perm""")
                .param("uid", userId).param("perm", permission).query(Integer.class).single();
        return n != null && n > 0;
    }

    private boolean requiresMfa(UUID userId) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                               WHERE ur.user_id = :u AND r.requires_mfa)""")
                .param("u", userId).query(Boolean.class).single();
    }
}
