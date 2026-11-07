package com.unavora.platform;

import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import com.unavora.identity.StaffSessionAuthFilter;
import com.unavora.identity.StaffSessions;
import org.springframework.core.annotation.Order;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Stateless resource server. Browser sessions are handled by the Next.js BFF (HttpOnly cookie, tokens kept
 * server-side), so this API only ever sees bearer tokens and CSRF does not apply. Public endpoints are
 * limited to /api/v1/public/**; everything else needs a valid token AND a database-backed permission.
 */
@Configuration
@EnableMethodSecurity
class SecurityConfig {

    /**
     * /internal/v1/** is called only by the Next.js server (BFF) with a service credential. Separate chain so a
     * bearer token can never authenticate here and the service credential can never reach /api/v1/**.
     */
    @Bean
    @Order(1)
    SecurityFilterChain internalChain(HttpSecurity http, StaffSessions staffSessions,
                                      @Value("${unavora.internal.service-token:}") String serviceToken) throws Exception {
        http
            .securityMatcher("/internal/**")
            .csrf(c -> c.disable())
            .cors(c -> c.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .headers(h -> h.frameOptions(f -> f.deny()))
            // 1) service credential (the caller is our web server), 2) staff website session for CRM paths
            .addFilterBefore(new InternalServiceAuthFilter(serviceToken), AnonymousAuthenticationFilter.class)
            .addFilterAfter(new StaffSessionAuthFilter(staffSessions), InternalServiceAuthFilter.class)
            .authorizeHttpRequests(a -> a
                .requestMatchers("/internal/v1/staff/**", "/internal/v1/director/**").hasRole("STAFF")
                .anyRequest().hasRole("INTERNAL_SERVICE"));
        return http.build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(c -> c.disable())
            .cors(Customizer.withDefaults())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .headers(h -> h
                .contentTypeOptions(Customizer.withDefaults())
                .frameOptions(f -> f.deny())
                .referrerPolicy(r -> r.policy(org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER)))
            .authorizeHttpRequests(a -> a
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/api/v1/public/**").permitAll()
                .requestMatchers("/actuator/health/**").permitAll()
                .anyRequest().authenticated())
            .oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults()));
        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(@Value("${unavora.cors-allowed-origins:}") String origins) {
        CorsConfiguration c = new CorsConfiguration();
        List<String> allowed = Arrays.stream(origins.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        c.setAllowedOrigins(allowed);               // empty list = no cross-origin access
        c.setAllowedMethods(List.of("GET", "POST", "PATCH", "OPTIONS"));
        c.setAllowedHeaders(List.of("Authorization", "Content-Type", "Idempotency-Key"));
        c.setMaxAge(600L);
        UrlBasedCorsConfigurationSource src = new UrlBasedCorsConfigurationSource();
        src.registerCorsConfiguration("/**", c);
        return src;
    }

    /** When no issuer is configured (tests), every bearer token is rejected rather than the context failing. */
    @Bean
    @ConditionalOnExpression("'${spring.security.oauth2.resourceserver.jwt.issuer-uri:}' == ''")
    JwtDecoder rejectAllJwtDecoder() {
        return token -> { throw new BadJwtException("No issuer configured"); };
    }
}
