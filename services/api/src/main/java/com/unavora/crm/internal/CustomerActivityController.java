package com.unavora.crm.internal;

import com.unavora.customers.api.CustomerSessions;
import com.unavora.platform.ApiException;
import com.unavora.properties.api.PropertyLookup;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Signed-in customer's own activity (requests and site visits) and saved properties. Only the caller's records;
 * CRM stages are translated to customer-facing statuses and no internal notes, assignees or audit data are exposed.
 */
@RestController
@RequestMapping("/internal/v1/customer")
class CustomerActivityController {
    private final CustomerSessions sessions;
    private final JdbcClient jdbc;
    private final PropertyLookup properties;
    private final com.unavora.platform.PublicVisibility visibility;

    CustomerActivityController(CustomerSessions sessions, JdbcClient jdbc, PropertyLookup properties,
                               com.unavora.platform.PublicVisibility visibility) {
        this.visibility = visibility;
        this.sessions = sessions;
        this.jdbc = jdbc;
        this.properties = properties;
    }

    record RequestItem(String reference, String type, OffsetDateTime createdAt, String status, String propertyTitle, String propertySlug) {}

    record VisitItem(String reference, OffsetDateTime scheduledAt, String status, String propertyTitle) {}

    record Activity(List<RequestItem> requests, List<VisitItem> visits) {}

    record Favourite(UUID propertyId, String title, String slug, String city, String locality, OffsetDateTime savedAt) {}

    /** Customer-facing status from the internal pipeline stage (no internal detail). */
    static String status(String stage) {
        return switch (stage) {
            case "new", "assigned" -> "received";
            case "site_visit_scheduled" -> "visit_scheduled";
            case "site_visit_completed" -> "visit_completed";
            case "won" -> "completed";
            case "lost", "invalid" -> "closed";
            default -> "in_progress";
        };
    }

    @GetMapping("/activity")
    Activity activity(@RequestHeader(value = CustomerSessions.HEADER, required = false) String session,
                      @RequestParam(defaultValue = "en") String lang) {
        UUID me = sessions.require(session);
        String language = "hi".equals(lang) ? "hi" : "en";
        List<RequestItem> requests = jdbc.sql("""
                SELECT l.public_ref, l.enquiry_type, l.created_at, ps.code AS stage, t.title, t.slug
                FROM leads l JOIN pipeline_stages ps ON ps.id = l.stage_id
                LEFT JOIN property_translations t ON t.property_id = l.interested_property_id AND t.language = :lang
                WHERE l.customer_id = :me ORDER BY l.created_at DESC LIMIT 50""")
                .param("me", me).param("lang", language)
                .query((rs, n) -> new RequestItem(rs.getString(1), rs.getString(2), rs.getObject(3, OffsetDateTime.class),
                        status(rs.getString(4)), rs.getString(5), rs.getString(6))).list();
        List<VisitItem> visits = jdbc.sql("""
                SELECT v.public_ref, v.scheduled_at, v.status, t.title
                FROM site_visits v LEFT JOIN property_translations t ON t.property_id = v.property_id AND t.language = :lang
                WHERE v.customer_id = :me AND v.status <> 'requested' ORDER BY v.scheduled_at DESC NULLS LAST LIMIT 50""")
                .param("me", me).param("lang", language)
                .query((rs, n) -> new VisitItem(rs.getString(1), rs.getObject(2, OffsetDateTime.class), rs.getString(3), rs.getString(4))).list();
        return new Activity(requests, visits);
    }

    @GetMapping("/favourites")
    List<Favourite> favourites(@RequestHeader(value = CustomerSessions.HEADER, required = false) String session,
                               @RequestParam(defaultValue = "en") String lang) {
        UUID me = sessions.require(session);
        // Only listings that are still public are shown; a sold or unpublished listing simply disappears from the list.
        return jdbc.sql("""
                SELECT f.property_id, t.title, t.slug, l.city, CASE WHEN CAST(:lang AS text) = 'hi' THEN coalesce(l.name_hi, l.name_en) ELSE l.name_en END, f.created_at
                FROM customer_favourites f JOIN properties p ON p.id = f.property_id
                JOIN property_translations t ON t.property_id = p.id AND t.language = :lang
                JOIN localities l ON l.id = p.locality_id
                WHERE f.customer_id = :me AND p.status = 'published' AND p.availability IN ('available','under_offer')""" + visibility.samples("p") + " " + """
                ORDER BY f.created_at DESC""")
                .param("me", me).param("lang", "hi".equals(lang) ? "hi" : "en")
                .query((rs, n) -> new Favourite(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getString(4),
                        rs.getString(5), rs.getObject(6, OffsetDateTime.class))).list();
    }

    @PutMapping("/favourites/{propertyId}")
    ResponseEntity<Void> save(@RequestHeader(value = CustomerSessions.HEADER, required = false) String session, @PathVariable UUID propertyId) {
        UUID me = sessions.require(session);
        properties.findPubliclyVisible(propertyId)
                .orElseThrow(() -> new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "property_unavailable", "This property is no longer available"));
        jdbc.sql("INSERT INTO customer_favourites (customer_id, property_id) VALUES (:c, :p) ON CONFLICT DO NOTHING")
                .param("c", me).param("p", propertyId).update();
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/favourites/{propertyId}")
    ResponseEntity<Void> remove(@RequestHeader(value = CustomerSessions.HEADER, required = false) String session, @PathVariable UUID propertyId) {
        UUID me = sessions.require(session);
        jdbc.sql("DELETE FROM customer_favourites WHERE customer_id = :c AND property_id = :p").param("c", me).param("p", propertyId).update();
        return ResponseEntity.noContent().build();
    }
}
