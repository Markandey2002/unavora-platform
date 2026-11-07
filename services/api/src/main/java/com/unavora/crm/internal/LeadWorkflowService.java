package com.unavora.crm.internal;

import com.unavora.identity.AccessService;
import com.unavora.platform.ApiException;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The ONLY write path for lead stage and assignment changes (manual, assignment-driven, site-visit-driven).
 * Rules (server-side; the UI only offers what these allow):
 *  - record access: employees act on leads assigned to them; lead.read_all holders on any lead; others get 404
 *  - transitions come from pipeline_stage_transitions; 'won' needs a completed deal (deals are out of scope -> refused)
 *  - reopening (lost -> contacted, invalid -> new) needs lead.reopen
 *  - Lost needs an active lost-reason code (+ note when the reason needs one); Invalid needs a reason
 *  - optimistic locking on leads.version (409 if someone else changed the lead)
 *  - every change: lead_stage_history (from, to, actor, time, reason), timeline entry, audit row, outbox event
 */
@Service
class LeadWorkflowService {

    record LeadState(UUID id, String reference, UUID customerId, UUID assignedUserId, String stage, String outcome, long version) {}

    record StageChanged(UUID leadId, String fromStage, String toStage, long version) {}

    record Assigned(UUID leadId, UUID previousUserId, UUID newUserId, String method, int movedFollowUps, int movedVisits, long version) {}

    private final JdbcClient jdbc;
    private final AccessService access;

    LeadWorkflowService(JdbcClient jdbc, AccessService access) {
        this.jdbc = jdbc;
        this.access = access;
    }

    UUID me() {
        return access.currentUserId().orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Not permitted"));
    }

    /** Locks and returns the lead if the caller may see it; 404 otherwise (existence is not disclosed). */
    LeadState lockVisibleLead(UUID me, UUID leadId) {
        boolean all = access.has(me, "lead.read_all");
        var q = jdbc.sql("""
                SELECT l.id, l.public_ref, l.customer_id, l.assigned_user_id, ps.code, l.outcome, l.version
                FROM leads l JOIN pipeline_stages ps ON ps.id = l.stage_id
                WHERE l.id = :id""" + (all ? "" : " AND l.assigned_user_id = :me") + " FOR UPDATE OF l")
                .param("id", leadId);
        if (!all) q = q.param("me", me);
        return q.query((rs, n) -> new LeadState(rs.getObject(1, UUID.class), rs.getString(2), rs.getObject(3, UUID.class),
                        rs.getObject(4, UUID.class), rs.getString(5), rs.getString(6), rs.getLong(7)))
                .optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Lead not found"));
    }

    @Transactional
    StageChanged changeStage(UUID leadId, String toStage, Long expectedVersion, String reasonCode, String note) {
        UUID me = me();
        return changeStage(me, lockVisibleLead(me, leadId), toStage, expectedVersion, reasonCode, note);
    }

    /** Shared by the stage API, assignment and site visits (caller already holds the row lock). */
    @Transactional(propagation = Propagation.MANDATORY)
    StageChanged changeStage(UUID me, LeadState lead, String toStage, Long expectedVersion, String reasonCode, String note) {
        if (!access.has(me, "lead.update")) throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Not permitted");
        if (expectedVersion != null && expectedVersion != lead.version()) {
            throw new ApiException(HttpStatus.CONFLICT, "stale_lead", "This lead was changed by someone else. Reload and try again.");
        }
        record Stage(UUID id, String code, String outcome, boolean requiresReason, boolean requiresDeal) {}
        Stage to = jdbc.sql("""
                SELECT id, code, outcome, requires_reason, requires_completed_deal FROM pipeline_stages
                WHERE code = :c AND is_active""").param("c", toStage == null ? "" : toStage)
                .query((rs, n) -> new Stage(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getBoolean(4), rs.getBoolean(5)))
                .optional().orElseThrow(() -> new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "unknown_stage", "Unknown stage"));
        if (to.code().equals(lead.stage())) {
            throw new ApiException(HttpStatus.CONFLICT, "no_change", "The lead is already in this stage");
        }
        boolean allowed = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM pipeline_stage_transitions t
                               JOIN pipeline_stages f ON f.id = t.from_stage_id
                               WHERE f.code = :from AND t.to_stage_id = :to)""")
                .param("from", lead.stage()).param("to", to.id()).query(Boolean.class).single();
        if (!allowed) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "transition_not_allowed",
                    "A lead cannot move from " + lead.stage() + " to " + to.code());
        }
        if (to.requiresDeal()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "won_requires_deal",
                    "A lead becomes Won only when its deal is completed (deal workflow not enabled yet)");
        }
        boolean reopening = !"open".equals(lead.outcome());
        if (reopening && !access.has(me, "lead.reopen")) {
            throw new ApiException(HttpStatus.FORBIDDEN, "reopen_not_permitted", "Only authorised staff can reopen closed leads");
        }
        if ("assigned".equals(to.code()) && lead.assignedUserId() == null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "assignee_required", "Assign the lead to an employee first");
        }

        String cleanNote = note == null || note.isBlank() ? null : note.trim();
        String lostCode = null;
        String reason = cleanNote;
        if ("lost".equals(to.code())) {
            record Lost(String name, boolean needsNote) {}
            Lost lr = jdbc.sql("SELECT name, needs_note FROM lost_reasons WHERE code = :c AND is_active")
                    .param("c", reasonCode == null ? "" : reasonCode)
                    .query((rs, n) -> new Lost(rs.getString(1), rs.getBoolean(2))).optional()
                    .orElseThrow(() -> new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "lost_reason_required", "Choose why the lead was lost"));
            if (lr.needsNote() && cleanNote == null) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "lost_note_required", "Add a note for this lost reason");
            }
            lostCode = reasonCode;
            reason = cleanNote == null ? lr.name() : lr.name() + ": " + cleanNote;
        } else if (to.requiresReason() && (cleanNote == null || cleanNote.length() < 3)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "reason_required", "A reason is required for this stage");
        }

        long version = jdbc.sql("""
                UPDATE leads SET stage_id = :s, version = version + 1,
                       lost_reason_code = :lc, lost_reason_note = :ln,
                       first_contacted_at = CASE WHEN :to = 'contacted' THEN coalesce(first_contacted_at, now()) ELSE first_contacted_at END,
                       last_contacted_at = CASE WHEN :to = 'contacted' THEN now() ELSE last_contacted_at END
                WHERE id = :id RETURNING version""")
                .param("s", to.id()).param("lc", lostCode).param("ln", lostCode == null ? null : cleanNote)
                .param("to", to.code()).param("id", lead.id()).query(Long.class).single();
        jdbc.sql("""
                INSERT INTO lead_stage_history (lead_id, from_stage_id, to_stage_id, changed_by, reason, reason_code)
                VALUES (:l, (SELECT id FROM pipeline_stages WHERE code = :from), :to, :me, :r, :rc)""")
                .param("l", lead.id()).param("from", lead.stage()).param("to", to.id()).param("me", me)
                .param("r", reason).param("rc", lostCode).update();
        activity(lead, me, "stage_changed", "Stage: " + lead.stage() + " → " + to.code() + (reason == null ? "" : " (" + reason + ")"));
        audit(me, "lead.stage_changed", lead.id(),
                "{\"from\":\"" + lead.stage() + "\",\"to\":\"" + to.code() + "\"" + (lostCode == null ? "" : ",\"reasonCode\":\"" + lostCode + "\"") + "}");
        outbox(lead.id(), "lead.stage_changed", "{\"leadId\":\"" + lead.id() + "\",\"to\":\"" + to.code() + "\"}");
        return new StageChanged(lead.id(), lead.stage(), to.code(), version);
    }

    /**
     * Director (lead.assign) assigns or reassigns. A reassignment needs a reason. The lead's open follow-ups and
     * upcoming visits held by the previous employee move with it; all history stays attached to the lead.
     */
    @Transactional
    Assigned assign(UUID leadId, UUID assigneeId, Long expectedVersion, String reason) {
        UUID me = me();
        if (!access.has(me, "lead.assign")) throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Not permitted");
        LeadState lead = lockVisibleLead(me, leadId);
        if (expectedVersion != null && expectedVersion != lead.version()) {
            throw new ApiException(HttpStatus.CONFLICT, "stale_lead", "This lead was changed by someone else. Reload and try again.");
        }
        if (!"open".equals(lead.outcome())) {
            throw new ApiException(HttpStatus.CONFLICT, "lead_closed", "Closed leads cannot be reassigned");
        }
        requireActiveStaff(assigneeId);
        if (assigneeId.equals(lead.assignedUserId())) {
            throw new ApiException(HttpStatus.CONFLICT, "already_assigned", "The lead is already assigned to this employee");
        }
        UUID previous = lead.assignedUserId();
        String cleanReason = reason == null || reason.isBlank() ? null : reason.trim();
        if (previous != null && (cleanReason == null || cleanReason.length() < 3)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "reason_required", "Give a reason for the reassignment");
        }
        String method = previous == null ? "manual" : "reassignment";

        jdbc.sql("UPDATE lead_assignments SET unassigned_at = now() WHERE lead_id = :l AND unassigned_at IS NULL")
                .param("l", lead.id()).update();
        jdbc.sql("""
                INSERT INTO lead_assignments (lead_id, assigned_to, assigned_by, method, reason, previous_assigned_to)
                VALUES (:l, :to, :me, :m, :r, :prev)""")
                .param("l", lead.id()).param("to", assigneeId).param("me", me).param("m", method)
                .param("r", cleanReason).param("prev", previous).update();
        jdbc.sql("UPDATE leads SET assigned_user_id = :to, version = version + 1 WHERE id = :l")
                .param("to", assigneeId).param("l", lead.id()).update();

        int tasks = 0, visits = 0;
        if (previous != null) {
            tasks = jdbc.sql("""
                    UPDATE crm_tasks SET assigned_to = :to WHERE lead_id = :l AND assigned_to = :prev AND status = 'open'""")
                    .param("to", assigneeId).param("l", lead.id()).param("prev", previous).update();
            visits = jdbc.sql("""
                    UPDATE site_visits SET assigned_user_id = :to, version = version + 1
                    WHERE lead_id = :l AND assigned_user_id = :prev AND status IN ('scheduled','confirmed')""")
                    .param("to", assigneeId).param("l", lead.id()).param("prev", previous).update();
        }
        String name = jdbc.sql("SELECT full_name FROM users WHERE id = :u").param("u", assigneeId).query(String.class).single();
        activity(lead, me, "assigned", (previous == null ? "Assigned to " : "Reassigned to ") + name
                + (cleanReason == null ? "" : " (" + cleanReason + ")"));
        audit(me, previous == null ? "lead.assigned" : "lead.reassigned", lead.id(),
                "{\"from\":" + (previous == null ? "null" : "\"" + previous + "\"") + ",\"to\":\"" + assigneeId
                        + "\",\"movedFollowUps\":" + tasks + ",\"movedVisits\":" + visits + "}");
        outbox(lead.id(), "lead.assigned", "{\"leadId\":\"" + lead.id() + "\",\"assignedTo\":\"" + assigneeId + "\"}");

        long version;
        if ("new".equals(lead.stage())) {
            LeadState refreshed = lockVisibleLead(me, lead.id());
            version = changeStage(me, refreshed, "assigned", null, null, "Assigned to " + name).version();
        } else {
            version = jdbc.sql("SELECT version FROM leads WHERE id = :l").param("l", lead.id()).query(Long.class).single();
        }
        return new Assigned(lead.id(), previous, assigneeId, method, tasks, visits, version);
    }

    /** Active staff member who can work leads (employee or director). */
    void requireActiveStaff(UUID userId) {
        boolean ok = userId != null && jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id = u.id
                               JOIN role_permissions rp ON rp.role_id = ur.role_id JOIN permissions p ON p.id = rp.permission_id
                               WHERE u.id = :u AND u.status = 'active' AND p.code IN ('lead.read_own','lead.read_all'))""")
                .param("u", userId).query(Boolean.class).single();
        if (!ok) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_assignee", "Choose an active employee");
    }

    void activity(LeadState lead, UUID me, String type, String summary) {
        jdbc.sql("""
                INSERT INTO lead_activities (customer_id, lead_id, activity_type, summary, actor_user_id)
                VALUES (:c, :l, :t, :s, :me)""")
                .param("c", lead.customerId()).param("l", lead.id()).param("t", type)
                .param("s", summary.length() > 500 ? summary.substring(0, 497) + "..." : summary).param("me", me).update();
    }

    void audit(UUID me, String action, UUID entityId, String metadata) {
        jdbc.sql("""
                INSERT INTO audit_logs (actor_user_id, actor_label, action, entity_type, entity_id, metadata_json)
                VALUES (:me, 'staff', :a, :t, :id, :m)""")
                .param("me", me).param("a", action).param("t", action.substring(0, action.indexOf('.')))
                .param("id", entityId.toString()).param("m", metadata).update();
    }

    /** Local/mock notifications: events are written to the outbox only (no relay, nothing is sent). */
    void outbox(UUID aggregateId, String type, String payload) {
        jdbc.sql("""
                INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload_json, dedupe_key)
                VALUES (:at, :id, :t, :p, :d)""")
                .param("at", type.substring(0, type.indexOf('.'))).param("id", aggregateId.toString()).param("t", type)
                .param("p", payload).param("d", type + ":" + aggregateId + ":" + UUID.randomUUID()).update();
    }
}
