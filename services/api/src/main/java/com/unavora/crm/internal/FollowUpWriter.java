package com.unavora.crm.internal;

import com.unavora.platform.ApiException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** The single write path for follow-ups (lead page, visit page, customer page). Callers check record access. */
@Component
class FollowUpWriter {
    static final Duration MAX_AHEAD = Duration.ofDays(365);
    static final Duration GRACE = Duration.ofMinutes(5);

    private final JdbcClient jdbc;

    FollowUpWriter(JdbcClient jdbc) { this.jdbc = jdbc; }

    static void validateDue(OffsetDateTime due) {
        OffsetDateTime now = OffsetDateTime.now();
        if (due.isBefore(now.minus(GRACE)) || due.isAfter(now.plus(MAX_AHEAD))) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_due_time", "Choose a due time from now up to one year ahead");
        }
    }

    /** Inserts a follow-up; the open-duplicate rule is checked first and backed by a unique index. */
    UUID insert(UUID customerId, UUID leadId, UUID visitId, UUID assignee, UUID me, String title, String description,
                OffsetDateTime dueAt, String priority) {
        boolean dup = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM crm_tasks WHERE status = 'open' AND assigned_to = :a
                               AND lead_id IS NOT DISTINCT FROM :l AND site_visit_id IS NOT DISTINCT FROM :v
                               AND lower(title) = lower(:t) AND due_at = :d)""")
                .param("a", assignee).param("l", leadId).param("v", visitId).param("t", title.trim()).param("d", dueAt)
                .query(Boolean.class).single();
        if (dup) throw new ApiException(HttpStatus.CONFLICT, "duplicate_follow_up", "This follow-up already exists");
        UUID id = jdbc.sql("""
                INSERT INTO crm_tasks (customer_id, lead_id, site_visit_id, assigned_to, created_by, title, description, due_at, priority)
                VALUES (:c, :l, :v, :a, :me, :t, :d, :due, :p) RETURNING id""")
                .param("c", customerId).param("l", leadId).param("v", visitId).param("a", assignee).param("me", me)
                .param("t", title.trim()).param("d", description == null || description.isBlank() ? null : description.trim())
                .param("due", dueAt).param("p", priority).query(UUID.class).single();
        String summary = "Follow-up: " + title.trim();
        jdbc.sql("""
                INSERT INTO lead_activities (customer_id, lead_id, activity_type, summary, actor_user_id, ref_type, ref_id)
                VALUES (:c, :l, 'task_created', :s, :me, 'task', :ref)""")
                .param("c", customerId).param("l", leadId).param("s", summary.length() > 500 ? summary.substring(0, 497) + "..." : summary)
                .param("me", me).param("ref", id.toString()).update();
        if (leadId != null) {
            jdbc.sql("""
                    UPDATE leads SET next_action_at = :due, next_action_note = :t
                    WHERE id = :l AND (next_action_at IS NULL OR next_action_at > :due OR next_action_at < now())""")
                    .param("due", dueAt).param("t", title.trim().length() > 500 ? title.trim().substring(0, 500) : title.trim()).param("l", leadId).update();
        }
        return id;
    }

}
