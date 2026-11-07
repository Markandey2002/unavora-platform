package com.unavora.platform;

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
 * Authenticates the Next.js server (BFF) on /internal/** with a shared service credential
 * (header X-Internal-Service-Token). Bearer tokens are deliberately NOT accepted here (ARCHITECTURE §4.6).
 * In AWS the path is additionally unreachable from the ALB; the credential comes from Secrets Manager.
 */
public class InternalServiceAuthFilter extends OncePerRequestFilter {
    public static final String HEADER = "X-Internal-Service-Token";
    private final byte[] expected;

    public InternalServiceAuthFilter(String token) {
        this.expected = token == null || token.isBlank() ? null : Hashing.sha256(token);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String presented = req.getHeader(HEADER);
        if (expected != null && presented != null && Hashing.equal(expected, Hashing.sha256(presented))) {
            var auth = new UsernamePasswordAuthenticationToken("internal-bff", null,
                    List.of(new SimpleGrantedAuthority("ROLE_INTERNAL_SERVICE")));
            SecurityContextHolder.getContext().setAuthentication(auth);
            chain.doFilter(req, res);
            return;
        }
        res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        res.setContentType("application/problem+json");
        res.getOutputStream().write("{\"status\":401,\"detail\":\"Not authenticated\",\"code\":\"unauthenticated\"}"
                .getBytes(StandardCharsets.UTF_8));
    }
}
