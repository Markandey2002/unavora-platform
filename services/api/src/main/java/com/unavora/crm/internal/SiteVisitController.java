package com.unavora.crm.internal;

import com.unavora.identity.AccessService;
import com.unavora.platform.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Staff site-visit API. Read: visit.read_all sees every visit; others see visits assigned to them or on their own
 * leads (anything else is 404). Writes: rules in {@link SiteVisitService}. Internal notes are staff-only data and
 * are never part of any customer-facing endpoint.
 */
@RestController
@RequestMapping({"/api/v1/staff/site-visits", "/internal/v1/staff/site-visits"})   // bearer JWT | BFF staff session
class SiteVisitController {
    private final SiteVisitService visits;
    private final LeadWorkflowService workflow;
    private final AccessService access;
    private final JdbcClient jdbc;

    SiteVisitController(SiteVisitService visits, LeadWorkflowService workflow, AccessService access, JdbcClient jdbc) {
        this.visits = visits;
        this.workflow = workflow;
        this.access = access;
        this.jdbc = jdbc;
    }

    record ScheduleRequest(@NotNull UUID leadId, UUID propertyId, @NotNull OffsetDateTime scheduledAt, UUID assignedUserId,
                           @Size(max = 300) String locationNote) {}
    record RescheduleRequest(@NotNull OffsetDateTime scheduledAt, @Size(max = 1000) String reason, Long expectedVersion) {}
    record ReasonRequest(@Size(max = 1000) String reason, Long expectedVersion) {}
    record CompleteRequest(@Size(max = 2000) String feedback, @Pattern(regexp = "none|low|medium|high") String interestAfter,
                           @Size(max = 2000) String employeeNotes, @Size(max = 500) String nextAction, Long expectedVersion) {}

    record VisitRow(UUID id, String reference, String status, OffsetDateTime scheduledAt, OffsetDateTime completedAt,
                    UUID leadId, String leadReference, UUID customerId, String customerName, String customerPhone,
                    UUID propertyId, String propertyTitle, UUID assignedUserId, String assignedUserName, String locationNote, long version) {}
    record HistoryRow(String fromStatus, String toStatus, OffsetDateTime fromScheduledAt, OffsetDateTime toScheduledAt,
                      String changedBy, String reason, OffsetDateTime changedAt) {}
    record VisitDetail(VisitRow visit, String feedback, String interestAfter, String employeeNotes, String nextAction, List<HistoryRow> history) {}

    private static final String SELECT = """
            SELECT v.id, v.public_ref, v.status, v.scheduled_at, v.completed_at, v.lead_id, l.public_ref AS lead_ref,
                   c.id AS customer_id, c.full_name, coalesce(c.whatsapp_e164, c.phone_e164) AS phone, v.property_id,
                   pt.title, v.assigned_user_id, u.full_name AS assignee, v.location_note, v.version,
                   v.feedback, v.interest_after, v.employee_notes, v.next_action
            FROM site_visits v JOIN leads l ON l.id = v.lead_id JOIN customers c ON c.id = v.customer_id
            LEFT JOIN property_translations pt ON pt.property_id = v.property_id AND pt.language = 'en'
            LEFT JOIN users u ON u.id = v.assigned_user_id
            WHERE 1 = 1
            """;

    private static VisitRow map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new VisitRow(rs.getObject("id", UUID.class), rs.getString("public_ref"), rs.getString("status"),
                rs.getObject("scheduled_at", OffsetDateTime.class), rs.getObject("completed_at", OffsetDateTime.class),
                rs.getObject("lead_id", UUID.class), rs.getString("lead_ref"), rs.getObject("customer_id", UUID.class),
                rs.getString("full_name"), rs.getString("phone"), rs.getObject("property_id", UUID.class), rs.getString("title"),
                rs.getObject("assigned_user_id", UUID.class), rs.getString("assignee"), rs.getString("location_note"), rs.getLong("version"));
    }

    /** scope: today | upcoming | past | all (India time for "today"); leadId narrows to one lead. */
    @GetMapping
    @PreAuthorize("@access.has('visit.read_all') or @access.has('visit.manage_own') or @access.has('visit.manage_all')")
    List<VisitRow> list(@RequestParam(defaultValue = "upcoming") String scope, @RequestParam(required = false) UUID leadId,
                        @RequestParam(required = false) String assignee) {
        UUID me = workflow.me();
        StringBuilder sql = new StringBuilder(SELECT);
        Map<String, Object> p = new HashMap<>();
        boolean all = access.has(me, "visit.read_all");
        if (!all) { sql.append(" AND (v.assigned_user_id = :me OR l.assigned_user_id = :me)"); p.put("me", me); }
        else if ("me".equals(assignee)) { sql.append(" AND v.assigned_user_id = :me"); p.put("me", me); }
        if (leadId != null) { sql.append(" AND v.lead_id = :lead"); p.put("lead", leadId); }
        String istToday = "(now() AT TIME ZONE 'Asia/Kolkata')::date";
        switch (scope) {
            case "today" -> sql.append(" AND v.status IN ('scheduled','confirmed') AND (v.scheduled_at AT TIME ZONE 'Asia/Kolkata')::date = ").append(istToday)
                    .append(" ORDER BY v.scheduled_at");
            case "upcoming" -> sql.append(" AND v.status IN ('scheduled','confirmed') AND (v.scheduled_at AT TIME ZONE 'Asia/Kolkata')::date >= ").append(istToday)
                    .append(" ORDER BY v.scheduled_at");
            case "past" -> sql.append(" AND (v.status IN ('completed','cancelled','no_show') OR (v.scheduled_at AT TIME ZONE 'Asia/Kolkata')::date < ")
                    .append(istToday).append(") ORDER BY v.scheduled_at DESC");
            case "all" -> sql.append(" ORDER BY v.scheduled_at DESC");
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "bad_scope", "scope must be today, upcoming, past or all");
        }
        sql.append(" LIMIT 200");
        return jdbc.sql(sql.toString()).params(p).query(SiteVisitController::map).list();
    }

    @GetMapping("/{id}")
    @PreAuthorize("@access.has('visit.read_all') or @access.has('visit.manage_own') or @access.has('visit.manage_all')")
    VisitDetail get(@PathVariable UUID id) {
        UUID me = workflow.me();
        boolean all = access.has(me, "visit.read_all");
        var q = jdbc.sql(SELECT + " AND v.id = :id" + (all ? "" : " AND (v.assigned_user_id = :me OR l.assigned_user_id = :me)")).param("id", id);
        if (!all) q = q.param("me", me);
        VisitDetail d = q.query((rs, n) -> new VisitDetail(map(rs, n), rs.getString("feedback"), rs.getString("interest_after"),
                        rs.getString("employee_notes"), rs.getString("next_action"), List.of())).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Site visit not found"));
        List<HistoryRow> history = jdbc.sql("""
                SELECT h.from_status, h.to_status, h.from_scheduled_at, h.to_scheduled_at, u.full_name, h.reason, h.changed_at
                FROM site_visit_history h LEFT JOIN users u ON u.id = h.changed_by
                WHERE h.site_visit_id = :id ORDER BY h.changed_at DESC, h.id DESC""")
                .param("id", id).query((rs, n) -> new HistoryRow(rs.getString(1), rs.getString(2), rs.getObject(3, OffsetDateTime.class),
                        rs.getObject(4, OffsetDateTime.class), rs.getString(5), rs.getString(6), rs.getObject(7, OffsetDateTime.class))).list();
        return new VisitDetail(d.visit(), d.feedback(), d.interestAfter(), d.employeeNotes(), d.nextAction(), history);
    }

    @PostMapping
    @PreAuthorize("@access.has('visit.manage_own') or @access.has('visit.manage_all')")
    ResponseEntity<SiteVisitService.VisitResult> schedule(@Valid @RequestBody ScheduleRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(visits.schedule(body.leadId(), body.propertyId(), body.scheduledAt(), body.assignedUserId(), body.locationNote()));
    }

    @PostMapping("/{id}/reschedule")
    @PreAuthorize("@access.has('visit.manage_own') or @access.has('visit.manage_all')")
    SiteVisitService.VisitResult reschedule(@PathVariable UUID id, @Valid @RequestBody RescheduleRequest body) {
        return visits.reschedule(id, body.scheduledAt(), body.reason(), body.expectedVersion());
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("@access.has('visit.manage_own') or @access.has('visit.manage_all')")
    SiteVisitService.VisitResult cancel(@PathVariable UUID id, @Valid @RequestBody ReasonRequest body) {
        return visits.cancel(id, body.reason(), body.expectedVersion());
    }

    @PostMapping("/{id}/complete")
    @PreAuthorize("@access.has('visit.manage_own') or @access.has('visit.manage_all')")
    SiteVisitService.VisitResult complete(@PathVariable UUID id, @Valid @RequestBody CompleteRequest body) {
        return visits.complete(id, body.feedback(), body.interestAfter(), body.employeeNotes(), body.nextAction(), body.expectedVersion());
    }

    @PostMapping("/{id}/no-show")
    @PreAuthorize("@access.has('visit.manage_own') or @access.has('visit.manage_all')")
    SiteVisitService.VisitResult noShow(@PathVariable UUID id, @Valid @RequestBody ReasonRequest body) {
        return visits.noShow(id, body.reason(), body.expectedVersion());
    }
}
