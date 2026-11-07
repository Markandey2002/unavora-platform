package com.unavora.crm.internal;

import com.unavora.identity.AccessService;
import com.unavora.platform.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Follow-ups. "Mine" lists open tasks assigned to the caller (overdue first). Create against a lead and/or a site
 * visit (the customer is derived), with due time, priority and assignee (others only with task.manage_all).
 * Duplicates (same person, lead/visit, title and due time while open) and double completion are refused.
 */
@RestController
@RequestMapping({"/api/v1/staff/follow-ups", "/internal/v1/staff/follow-ups"})   // bearer JWT | BFF staff session
class StaffFollowUpController {
    private final JdbcClient jdbc;
    private final AccessService access;
    private final FollowUpWriter writer;

    StaffFollowUpController(JdbcClient jdbc, AccessService access, FollowUpWriter writer) {
        this.jdbc = jdbc;
        this.access = access;
        this.writer = writer;
    }

    record FollowUpItem(UUID id, String title, String description, OffsetDateTime dueAt, boolean overdue, String priority,
                        UUID customerId, String customerName, String customerReference, UUID leadId, String leadReference,
                        UUID siteVisitId, String siteVisitReference) {}

    record CreateRequest(UUID leadId, UUID siteVisitId, @NotBlank @Size(max = 200) String title, @Size(max = 2000) String description,
                         @NotNull OffsetDateTime dueAt, @Pattern(regexp = "low|normal|high") String priority, UUID assignedTo) {}

    @GetMapping
    @PreAuthorize("@access.has('task.manage_own') or @access.has('task.manage_all')")
    List<FollowUpItem> mine() {
        UUID me = me();
        return jdbc.sql("""
                SELECT t.id, t.title, t.description, t.due_at, t.due_at < now() AS overdue, t.priority,
                       c.id, c.full_name, c.public_ref, l.id, l.public_ref, v.id, v.public_ref
                FROM crm_tasks t JOIN customers c ON c.id = t.customer_id LEFT JOIN leads l ON l.id = t.lead_id
                LEFT JOIN site_visits v ON v.id = t.site_visit_id
                WHERE t.assigned_to = :me AND t.status = 'open'
                ORDER BY t.due_at, CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, t.id LIMIT 200""")
                .param("me", me)
                .query((rs, n) -> new FollowUpItem(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3),
                        rs.getObject(4, OffsetDateTime.class), rs.getBoolean(5), rs.getString(6), rs.getObject(7, UUID.class), rs.getString(8),
                        rs.getString(9), rs.getObject(10, UUID.class), rs.getString(11), rs.getObject(12, UUID.class), rs.getString(13)))
                .list();
    }

    @PostMapping
    @PreAuthorize("@access.has('task.manage_own') or @access.has('task.manage_all')")
    @Transactional
    ResponseEntity<Map<String, UUID>> create(@Valid @RequestBody CreateRequest body) {
        UUID me = me();
        if (body.leadId() == null && body.siteVisitId() == null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "target_required", "Link the follow-up to a lead or a site visit");
        }
        UUID leadId = body.leadId();
        if (body.siteVisitId() != null) {
            UUID visitLead = visibleVisitLead(me, body.siteVisitId());
            if (leadId != null && !leadId.equals(visitLead)) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "visit_lead_mismatch", "The visit belongs to a different lead");
            }
            leadId = visitLead;
        }
        UUID customerId = body.siteVisitId() != null
                ? jdbc.sql("SELECT customer_id FROM leads WHERE id = :l").param("l", leadId).query(UUID.class).single()
                : visibleLeadCustomer(me, leadId);
        UUID assignee = body.assignedTo() == null ? me : body.assignedTo();
        if (!assignee.equals(me) && !access.has(me, "task.manage_all")) {
            throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "You can only create follow-ups for yourself");
        }
        if (!jdbc.sql("SELECT EXISTS (SELECT 1 FROM users WHERE id = :u AND status = 'active')").param("u", assignee).query(Boolean.class).single()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_assignee", "Choose an active employee");
        }
        FollowUpWriter.validateDue(body.dueAt());
        UUID id = writer.insert(customerId, leadId, body.siteVisitId(), assignee, me, body.title(), body.description(), body.dueAt(),
                body.priority() == null ? "normal" : body.priority());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @PostMapping("/{id}/complete")
    @PreAuthorize("@access.has('task.manage_own') or @access.has('task.manage_all')")
    @Transactional
    FollowUpItem complete(@PathVariable UUID id) {
        UUID me = me();
        boolean all = access.has(me, "task.manage_all");
        var q = jdbc.sql("SELECT status FROM crm_tasks WHERE id = :id" + (all ? "" : " AND assigned_to = :me") + " FOR UPDATE").param("id", id);
        if (!all) q = q.param("me", me);
        String status = q.query(String.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Follow-up not found"));
        if (!"open".equals(status)) {
            throw new ApiException(HttpStatus.CONFLICT, "already_" + ("done".equals(status) ? "completed" : status), "This follow-up is already " + status);
        }
        Object[] r = jdbc.sql("UPDATE crm_tasks SET status = 'done', completed_at = now() WHERE id = :id RETURNING customer_id, lead_id, title")
                .param("id", id).query((rs, n) -> new Object[]{rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3)}).single();
        String summary = "Follow-up done: " + r[2];
        jdbc.sql("""
                INSERT INTO lead_activities (customer_id, lead_id, activity_type, summary, actor_user_id, ref_type, ref_id)
                VALUES (:c, :l, 'task_completed', :s, :me, 'task', :ref)""")
                .param("c", r[0]).param("l", r[1]).param("s", summary.length() > 500 ? summary.substring(0, 497) + "..." : summary)
                .param("me", me).param("ref", id.toString()).update();
        return new FollowUpItem(id, (String) r[2], null, null, false, null, (UUID) r[0], null, null, (UUID) r[1], null, null, null);
    }

    private UUID visibleLeadCustomer(UUID me, UUID leadId) {
        boolean all = access.has(me, "lead.read_all");
        var q = jdbc.sql("SELECT customer_id FROM leads WHERE id = :l" + (all ? "" : " AND assigned_user_id = :me")).param("l", leadId);
        if (!all) q = q.param("me", me);
        return q.query(UUID.class).optional().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Lead not found"));
    }

    private UUID visibleVisitLead(UUID me, UUID visitId) {
        boolean all = access.has(me, "visit.read_all");
        var q = jdbc.sql("""
                SELECT v.lead_id FROM site_visits v JOIN leads l ON l.id = v.lead_id WHERE v.id = :v"""
                + (all ? "" : " AND (v.assigned_user_id = :me OR l.assigned_user_id = :me)")).param("v", visitId);
        if (!all) q = q.param("me", me);
        return q.query(UUID.class).optional().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Site visit not found"));
    }

    private UUID me() {
        return access.currentUserId().orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Not permitted"));
    }
}
