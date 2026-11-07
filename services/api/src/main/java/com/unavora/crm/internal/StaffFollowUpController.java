package com.unavora.crm.internal;

import com.unavora.identity.AccessService;
import com.unavora.platform.ApiException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * "My follow-ups": open tasks assigned to the caller (overdue first), and marking one done. Only the assignee (or a
 * holder of task.manage_all) may complete a task; anyone else gets 404.
 */
@RestController
@RequestMapping({"/api/v1/staff/follow-ups", "/internal/v1/staff/follow-ups"})   // bearer JWT | BFF staff session
class StaffFollowUpController {
    private final JdbcClient jdbc;
    private final AccessService access;

    StaffFollowUpController(JdbcClient jdbc, AccessService access) { this.jdbc = jdbc; this.access = access; }

    record FollowUpItem(UUID id, String title, String description, OffsetDateTime dueAt, boolean overdue,
                        UUID customerId, String customerName, String customerReference, UUID leadId, String leadReference) {}

    @GetMapping
    @PreAuthorize("@access.has('task.manage_own') or @access.has('task.manage_all')")
    List<FollowUpItem> mine() {
        UUID me = me();
        return jdbc.sql("""
                SELECT t.id, t.title, t.description, t.due_at, t.due_at < now() AS overdue,
                       c.id, c.full_name, c.public_ref, l.id, l.public_ref
                FROM crm_tasks t JOIN customers c ON c.id = t.customer_id LEFT JOIN leads l ON l.id = t.lead_id
                WHERE t.assigned_to = :me AND t.status = 'open'
                ORDER BY t.due_at, t.id LIMIT 200""")
                .param("me", me)
                .query((rs, n) -> new FollowUpItem(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3),
                        rs.getObject(4, OffsetDateTime.class), rs.getBoolean(5), rs.getObject(6, UUID.class), rs.getString(7),
                        rs.getString(8), rs.getObject(9, UUID.class), rs.getString(10)))
                .list();
    }

    @PostMapping("/{id}/complete")
    @PreAuthorize("@access.has('task.manage_own') or @access.has('task.manage_all')")
    @Transactional
    FollowUpItem complete(@PathVariable UUID id) {
        UUID me = me();
        boolean all = access.has(me, "task.manage_all");
        String sql = "UPDATE crm_tasks SET status = 'done', completed_at = now() WHERE id = :id AND status = 'open'"
                + (all ? "" : " AND assigned_to = :me")
                + " RETURNING customer_id, lead_id, title";
        var row = jdbc.sql(sql).param("id", id);
        if (!all) row = row.param("me", me);
        Object[] r = row.query((rs, n) -> new Object[]{rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3)})
                .optional().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Follow-up not found"));
        String title = (String) r[2];
        jdbc.sql("""
                INSERT INTO lead_activities (customer_id, lead_id, activity_type, summary, actor_user_id, ref_type, ref_id)
                VALUES (:c, :l, 'task_completed', :s, :me, 'task', :ref)""")
                .param("c", r[0]).param("l", r[1]).param("s", ("Follow-up done: " + title).length() > 500
                        ? ("Follow-up done: " + title).substring(0, 500) : "Follow-up done: " + title)
                .param("me", me).param("ref", id.toString()).update();
        return new FollowUpItem(id, title, null, null, false, (UUID) r[0], null, null, (UUID) r[1], null);
    }

    private UUID me() {
        return access.currentUserId().orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Not permitted"));
    }
}
