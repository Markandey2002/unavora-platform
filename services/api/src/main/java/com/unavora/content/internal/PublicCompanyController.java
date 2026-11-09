package com.unavora.content.internal;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Company facts for the public website. ONLY values the business has confirmed (verified = true) are returned;
 * unverified contact details, legal identifiers or offices never reach the site (PENDING_BUSINESS_CONFIRMATIONS).
 */
@RestController
@RequestMapping("/api/v1/public")
class PublicCompanyController {
    /** Settings the site may display once verified. Anything else in site_settings stays internal. */
    static final Set<String> PUBLIC_KEYS = Set.of("company.display_name", "company.tagline", "company.legal_name",
            "company.phone", "company.whatsapp", "company.email", "company.cin", "company.rera_number");

    private final JdbcClient jdbc;

    PublicCompanyController(JdbcClient jdbc) { this.jdbc = jdbc; }

    record Office(String kind, String city, String locality, String address, String pinCode, String phone) {}

    record CompanyInfo(Map<String, String> settings, Map<String, String> social, List<Office> offices) {}

    @GetMapping("/company")
    ResponseEntity<CompanyInfo> company() {
        Map<String, String> settings = new LinkedHashMap<>();
        Map<String, String> social = new LinkedHashMap<>();
        jdbc.sql("SELECT key, value FROM site_settings WHERE verified AND nullif(btrim(value), '') IS NOT NULL ORDER BY key")
                .query((rs, n) -> Map.entry(rs.getString("key"), rs.getString("value").trim())).list()
                .forEach(e -> {
                    if (PUBLIC_KEYS.contains(e.getKey())) settings.put(e.getKey().substring("company.".length()), e.getValue());
                    else if (e.getKey().startsWith("social.") && e.getValue().matches("^https://[^\\s]+$")) {
                        social.put(e.getKey().substring("social.".length()), e.getValue());
                    }
                });
        List<Office> offices = jdbc.sql("""
                SELECT kind, city, locality, full_address, pin_code, phone FROM company_offices
                WHERE verified ORDER BY sort_order, city""")
                .query((rs, n) -> new Office(rs.getString("kind"), rs.getString("city"), rs.getString("locality"),
                        rs.getString("full_address"), rs.getString("pin_code"), rs.getString("phone"))).list();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(300)).cachePublic())
                .body(new CompanyInfo(settings, social, offices));
    }
}
