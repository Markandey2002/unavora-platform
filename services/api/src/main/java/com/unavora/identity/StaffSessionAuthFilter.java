package com.unavora.identity;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Runs after the service-credential filter on /internal/**. For /internal/v1/staff/** and /internal/v1/director/** a
 * valid staff session (header X-Staff-Session) is mandatory; it becomes the request principal (StaffPrincipal) so the
 * same @PreAuthorize rules and record-level SQL apply as for bearer tokens.
 */
public class StaffSessionAuthFilter extends OncePerRequestFilter {
    private final StaffSessions sessions;

    public StaffSessionAuthFilter(StaffSessions sessions) { this.sessions = sessions; }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        String p = req.getRequestURI().substring(req.getContextPath().length());
        return !(p.startsWith("/internal/v1/staff/") || p.startsWith("/internal/v1/director/"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        var principal = sessions.resolve(req.getHeader(StaffSessions.HEADER));
        if (principal.isEmpty()) {
            res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            res.setContentType("application/problem+json");
            res.getOutputStream().write("{\"status\":401,\"detail\":\"Please sign in again\",\"code\":\"staff_session_required\"}"
                    .getBytes(StandardCharsets.UTF_8));
            return;
        }
        var auth = new UsernamePasswordAuthenticationToken(principal.get(), null, List.of(
                new SimpleGrantedAuthority("ROLE_INTERNAL_SERVICE"), new SimpleGrantedAuthority("ROLE_STAFF")));
        SecurityContextHolder.getContext().setAuthentication(auth);
        chain.doFilter(req, res);
    }
}
