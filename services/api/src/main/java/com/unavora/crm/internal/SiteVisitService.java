package com.unavora.crm.internal;

import com.unavora.identity.AccessService;
import com.unavora.platform.ApiException;
import com.unavora.properties.api.PropertyLookup;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Site visits: scheduled -> completed | no_show | cancelled (rescheduling keeps 'scheduled').
 *  - Who: visit.manage_all (director) for any visit/employee; visit.manage_own for visits on own leads or assigned to self.
 *  - When: from 24 h ago (recording a same-day walk-in) to 180 days ahead; an employee cannot have two visits
 *    within 60 minutes of each other; the lead must be open; the property must be publicly available.
 *  - Never completed automatically: completed / no-show are explicit actions, allowed only once the scheduled time
 *    has passed.
 *  - Every change: site_visit_history, lead timeline, audit row, outbox event (local/mock notification).
 *  - Lead stage follows the visit through LeadWorkflowService when the pipeline allows it.
 */
@Service
class SiteVisitService {
    static final Duration MAX_PAST = Duration.ofHours(24);
    static final Duration MAX_AHEAD = Duration.ofDays(180);
    static final Duration MIN_GAP = Duration.ofMinutes(60);
    static final Set<String> ACTIVE = Set.of("scheduled", "confirmed");

    record VisitState(UUID id, String reference, UUID leadId, UUID assignedUserId, String status, OffsetDateTime scheduledAt, long version) {}

    record VisitResult(UUID id, String reference, String status, OffsetDateTime scheduledAt, long version, String leadStage) {}

    private final JdbcClient jdbc;
    private final AccessService access;
    private final LeadWorkflowService workflow;
    private final PropertyLookup properties;

    SiteVisitService(JdbcClient jdbc, AccessService access, LeadWorkflowService workflow, PropertyLookup properties) {
        this.jdbc = jdbc;
        this.access = access;
        this.workflow = workflow;
        this.properties = properties;
    }

    @Transactional
    VisitResult schedule(UUID leadId, UUID propertyId, OffsetDateTime scheduledAt, UUID assigneeId, String locationNote) {
        UUID me = workflow.me();
        requireManage(me);
        var lead = workflow.lockVisibleLead(me, leadId);
        if (!"open".equals(lead.outcome())) throw new ApiException(HttpStatus.CONFLICT, "lead_closed", "Visits cannot be scheduled for a closed lead");
        UUID property = propertyId != null ? propertyId
                : jdbc.sql("SELECT interested_property_id FROM leads WHERE id = :l").param("l", leadId).query(UUID.class).optional().orElse(null);
        if (property == null || properties.findPubliclyVisible(property).isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "property_unavailable", "Choose an available property for the visit");
        }
        UUID assignee = assigneeId != null ? assigneeId : (lead.assignedUserId() != null ? lead.assignedUserId() : me);
        if (!assignee.equals(me) && !access.has(me, "visit.manage_all")) {
            throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "You can only schedule visits for yourself");
        }
        workflow.requireActiveStaff(assignee);
        validateTime(scheduledAt);
        requireNoConflict(assignee, scheduledAt, null);

        var row = jdbc.sql("""
                INSERT INTO site_visits (public_ref, lead_id, customer_id, property_id, assigned_user_id, status, scheduled_at, location_note)
                VALUES ('VIS-' || lpad(nextval('visit_ref_seq')::text, 6, '0'), :l, :c, :p, :a, 'scheduled', :t, :n)
                RETURNING id, public_ref, version""")
                .param("l", leadId).param("c", lead.customerId()).param("p", property).param("a", assignee)
                .param("t", scheduledAt).param("n", blank(locationNote))
                .query((rs, n) -> new Object[]{rs.getObject(1, UUID.class), rs.getString(2), rs.getLong(3)}).single();
        UUID id = (UUID) row[0];
        history(id, null, "scheduled", null, scheduledAt, me, scheduledAt.isBefore(OffsetDateTime.now()) ? "Recorded after the visit time" : null);
        String stage = advanceLead(me, leadId, "site_visit_scheduled", "Site visit " + row[1] + " scheduled");
        timeline(me, new VisitState(id, (String) row[1], leadId, assignee, "scheduled", scheduledAt, (Long) row[2]),
                "Site visit " + row[1] + " scheduled for " + scheduledAt);
        workflow.audit(me, "visit.scheduled", id, "{\"leadId\":\"" + leadId + "\",\"assignedTo\":\"" + assignee + "\"}");
        workflow.outbox(id, "visit.scheduled", "{\"visitId\":\"" + id + "\",\"leadId\":\"" + leadId + "\"}");
        return new VisitResult(id, (String) row[1], "scheduled", scheduledAt, (Long) row[2], stage);
    }

    @Transactional
    VisitResult reschedule(UUID id, OffsetDateTime newTime, String reason, Long expectedVersion) {
        UUID me = workflow.me();
        VisitState v = lockManageable(me, id, expectedVersion);
        requireActive(v);
        String r = requireReason(reason);
        validateTime(newTime);
        if (newTime.isEqual(v.scheduledAt())) throw new ApiException(HttpStatus.CONFLICT, "no_change", "Choose a different time");
        requireNoConflict(v.assignedUserId(), newTime, v.id());
        long version = jdbc.sql("UPDATE site_visits SET scheduled_at = :t, version = version + 1 WHERE id = :id RETURNING version")
                .param("t", newTime).param("id", id).query(Long.class).single();
        history(id, v.status(), v.status(), v.scheduledAt(), newTime, me, r);
        timeline(me, v, "Site visit " + v.reference() + " rescheduled to " + newTime + " (" + r + ")");
        workflow.audit(me, "visit.rescheduled", id, "{\"leadId\":\"" + v.leadId() + "\"}");
        workflow.outbox(id, "visit.rescheduled", "{\"visitId\":\"" + id + "\"}");
        return new VisitResult(id, v.reference(), v.status(), newTime, version, null);
    }

    @Transactional
    VisitResult cancel(UUID id, String reason, Long expectedVersion) {
        UUID me = workflow.me();
        VisitState v = lockManageable(me, id, expectedVersion);
        if (!ACTIVE.contains(v.status()) && !"requested".equals(v.status())) {
            throw new ApiException(HttpStatus.CONFLICT, "visit_closed", "This visit is already " + v.status());
        }
        String r = requireReason(reason);
        long version = jdbc.sql("UPDATE site_visits SET status = 'cancelled', version = version + 1 WHERE id = :id RETURNING version")
                .param("id", id).query(Long.class).single();
        history(id, v.status(), "cancelled", v.scheduledAt(), v.scheduledAt(), me, r);
        timeline(me, v, "Site visit " + v.reference() + " cancelled (" + r + ")");
        workflow.audit(me, "visit.cancelled", id, "{\"leadId\":\"" + v.leadId() + "\"}");
        workflow.outbox(id, "visit.cancelled", "{\"visitId\":\"" + id + "\"}");
        return new VisitResult(id, v.reference(), "cancelled", v.scheduledAt(), version, null);
    }

    @Transactional
    VisitResult complete(UUID id, String feedback, String interestAfter, String employeeNotes, String nextAction, Long expectedVersion) {
        UUID me = workflow.me();
        VisitState v = lockManageable(me, id, expectedVersion);
        requireActive(v);
        requireStarted(v);
        if (interestAfter != null && !Set.of("none", "low", "medium", "high").contains(interestAfter)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_interest", "Choose an interest level");
        }
        if (blank(feedback) == null && blank(employeeNotes) == null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "outcome_required", "Record the customer's feedback or your notes");
        }
        long version = jdbc.sql("""
                UPDATE site_visits SET status = 'completed', completed_at = now(), feedback = :f, interest_after = :i,
                       employee_notes = :e, next_action = :n, version = version + 1
                WHERE id = :id RETURNING version""")
                .param("f", blank(feedback)).param("i", interestAfter).param("e", blank(employeeNotes))
                .param("n", blank(nextAction)).param("id", id).query(Long.class).single();
        history(id, v.status(), "completed", v.scheduledAt(), v.scheduledAt(), me, null);
        String stage = advanceLead(me, v.leadId(), "site_visit_completed", "Site visit " + v.reference() + " completed");
        timeline(me, v, "Site visit " + v.reference() + " completed" + (interestAfter == null ? "" : " (interest: " + interestAfter + ")"));
        workflow.audit(me, "visit.completed", id, "{\"leadId\":\"" + v.leadId() + "\"}");
        workflow.outbox(id, "visit.completed", "{\"visitId\":\"" + id + "\"}");
        return new VisitResult(id, v.reference(), "completed", v.scheduledAt(), version, stage);
    }

    @Transactional
    VisitResult noShow(UUID id, String note, Long expectedVersion) {
        UUID me = workflow.me();
        VisitState v = lockManageable(me, id, expectedVersion);
        requireActive(v);
        requireStarted(v);
        long version = jdbc.sql("""
                UPDATE site_visits SET status = 'no_show', employee_notes = coalesce(:e, employee_notes), version = version + 1
                WHERE id = :id RETURNING version""").param("e", blank(note)).param("id", id).query(Long.class).single();
        history(id, v.status(), "no_show", v.scheduledAt(), v.scheduledAt(), me, blank(note));
        timeline(me, v, "Customer did not attend site visit " + v.reference());
        workflow.audit(me, "visit.no_show", id, "{\"leadId\":\"" + v.leadId() + "\"}");
        workflow.outbox(id, "visit.no_show", "{\"visitId\":\"" + id + "\"}");
        return new VisitResult(id, v.reference(), "no_show", v.scheduledAt(), version, null);
    }

    // ------------------------------------------------------------------ rules

    private void requireManage(UUID me) {
        if (!access.has(me, "visit.manage_all") && !access.has(me, "visit.manage_own")) {
            throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Not permitted");
        }
    }

    /** Locks a visit the caller may manage; 404 for visits outside their records. */
    private VisitState lockManageable(UUID me, UUID id, Long expectedVersion) {
        requireManage(me);
        boolean all = access.has(me, "visit.manage_all");
        var q = jdbc.sql("""
                SELECT v.id, v.public_ref, v.lead_id, v.assigned_user_id, v.status, v.scheduled_at, v.version
                FROM site_visits v JOIN leads l ON l.id = v.lead_id WHERE v.id = :id"""
                + (all ? "" : " AND (v.assigned_user_id = :me OR l.assigned_user_id = :me)") + " FOR UPDATE OF v")
                .param("id", id);
        if (!all) q = q.param("me", me);
        VisitState v = q.query((rs, n) -> new VisitState(rs.getObject(1, UUID.class), rs.getString(2), rs.getObject(3, UUID.class),
                        rs.getObject(4, UUID.class), rs.getString(5), rs.getObject(6, OffsetDateTime.class), rs.getLong(7)))
                .optional().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Site visit not found"));
        if (expectedVersion != null && expectedVersion != v.version()) {
            throw new ApiException(HttpStatus.CONFLICT, "stale_visit", "This visit was changed by someone else. Reload and try again.");
        }
        return v;
    }

    private static void requireActive(VisitState v) {
        if (!ACTIVE.contains(v.status())) throw new ApiException(HttpStatus.CONFLICT, "visit_closed", "This visit is already " + v.status());
    }

    private static void requireStarted(VisitState v) {
        if (v.scheduledAt() == null || v.scheduledAt().isAfter(OffsetDateTime.now())) {
            throw new ApiException(HttpStatus.CONFLICT, "visit_not_started", "A visit can be completed or marked no-show only after its scheduled time");
        }
    }

    private static void validateTime(OffsetDateTime t) {
        OffsetDateTime now = OffsetDateTime.now();
        if (t == null || t.isBefore(now.minus(MAX_PAST)) || t.isAfter(now.plus(MAX_AHEAD))) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_schedule_time",
                    "Choose a time from the last 24 hours up to 180 days ahead");
        }
    }

    private void requireNoConflict(UUID assignee, OffsetDateTime t, UUID ignoreVisit) {
        jdbc.sql("SELECT id FROM users WHERE id = :u FOR UPDATE").param("u", assignee).query(UUID.class).single();  // serialise per employee
        boolean clash = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM site_visits WHERE assigned_user_id = :u AND status IN ('scheduled','confirmed')
                               AND (CAST(:ignore AS uuid) IS NULL OR id <> CAST(:ignore AS uuid))
                               AND scheduled_at > CAST(:t AS timestamptz) - CAST(:gap AS interval)
                               AND scheduled_at < CAST(:t AS timestamptz) + CAST(:gap AS interval))""")
                .param("u", assignee).param("ignore", ignoreVisit == null ? null : ignoreVisit.toString())
                .param("t", t).param("gap", MIN_GAP.toMinutes() + " minutes").query(Boolean.class).single();
        if (clash) throw new ApiException(HttpStatus.CONFLICT, "visit_conflict", "This employee already has a visit within an hour of that time");
    }

    private static String requireReason(String reason) {
        String r = blank(reason);
        if (r == null || r.length() < 3) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "reason_required", "Give a reason");
        return r;
    }

    /** Moves the lead to the visit-driven stage when the configured pipeline allows it; otherwise leaves it. */
    private String advanceLead(UUID me, UUID leadId, String toStage, String note) {
        LeadWorkflowService.LeadState lead;
        try {
            lead = workflow.lockVisibleLead(me, leadId);
        } catch (ApiException e) {
            return null;   // visit assigned to someone who does not own the lead: the lead owner moves the stage
        }
        if (lead.stage().equals(toStage)) return toStage;
        boolean allowed = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM pipeline_stage_transitions t JOIN pipeline_stages f ON f.id = t.from_stage_id
                               JOIN pipeline_stages s ON s.id = t.to_stage_id WHERE f.code = :f AND s.code = :t)""")
                .param("f", lead.stage()).param("t", toStage).query(Boolean.class).single();
        if (!allowed || !"open".equals(lead.outcome()) || !access.has(me, "lead.update")) return lead.stage();
        return workflow.changeStage(me, lead, toStage, null, null, note).toStage();
    }

    private void history(UUID id, String from, String to, OffsetDateTime fromAt, OffsetDateTime toAt, UUID me, String reason) {
        jdbc.sql("""
                INSERT INTO site_visit_history (site_visit_id, from_status, to_status, from_scheduled_at, to_scheduled_at, changed_by, reason)
                VALUES (:v, :f, :t, :fa, :ta, :me, :r)""")
                .param("v", id).param("f", from).param("t", to).param("fa", fromAt).param("ta", toAt).param("me", me).param("r", reason).update();
    }

    private void timeline(UUID me, VisitState v, String summary) {
        UUID customer = jdbc.sql("SELECT customer_id FROM leads WHERE id = :l").param("l", v.leadId()).query(UUID.class).single();
        jdbc.sql("""
                INSERT INTO lead_activities (customer_id, lead_id, activity_type, summary, actor_user_id, ref_type, ref_id)
                VALUES (:c, :l, 'site_visit', :s, :me, 'site_visit', :ref)""")
                .param("c", customer).param("l", v.leadId()).param("s", summary.length() > 500 ? summary.substring(0, 497) + "..." : summary)
                .param("me", me).param("ref", v.id().toString()).update();
    }

    static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
