package com.unavora.identity;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

/**
 * Database-backed authorisation. The token only proves WHO the caller is (its "sub"); what they may do is
 * read from roles/permissions in PostgreSQL on every call, so revoking a role takes effect immediately.
 * Used from @PreAuthorize("@access.has('lead.read_all')").
 */
@Component("access")
public class AccessService {
    private final JdbcClient jdbc;

    public AccessService(JdbcClient jdbc) { this.jdbc = jdbc; }

    public Optional<UUID> currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof Jwt jwt)) return Optional.empty();
        return jdbc.sql("SELECT id FROM users WHERE external_subject = :sub AND status = 'active'")
                .param("sub", jwt.getSubject()).query(UUID.class).optional();
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
}
