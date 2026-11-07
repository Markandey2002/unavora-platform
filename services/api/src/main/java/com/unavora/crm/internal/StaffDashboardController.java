package com.unavora.crm.internal;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** The signed-in employee's own dashboard. Always scoped to the caller, whatever their role. India time for "today". */
@RestController
class StaffDashboardController {
    private final JdbcClient jdbc;
    private final LeadWorkflowService workflow;

    StaffDashboardController(JdbcClient jdbc, LeadWorkflowService workflow) { this.jdbc = jdbc; this.workflow = workflow; }

    record StageCount(String stage, String name, long count) {}
    record VisitItem(UUID id, String reference, OffsetDateTime scheduledAt, String status, UUID leadId, String leadReference,
                     String customerName, String propertyTitle) {}
    record FollowUpSummary(long pending, long dueToday, long overdue) {}
    record RecentLead(UUID id, String reference, String customerName, String stage, OffsetDateTime updatedAt) {}
    record Dashboard(List<StageCount> myLeadsByStage, List<VisitItem> todaysVisits, List<VisitItem> upcomingVisits,
                     FollowUpSummary followUps, List<RecentLead> recentlyUpdatedLeads) {}

    private static final String IST_TODAY = "(now() AT TIME ZONE 'Asia/Kolkata')::date";
    private static final String VISIT_SELECT = """
            SELECT v.id, v.public_ref, v.scheduled_at, v.status, l.id, l.public_ref, c.full_name, pt.title
            FROM site_visits v JOIN leads l ON l.id = v.lead_id JOIN customers c ON c.id = v.customer_id
            LEFT JOIN property_translations pt ON pt.property_id = v.property_id AND pt.language = 'en'
            WHERE v.assigned_user_id = :me AND v.status IN ('scheduled','confirmed')
            """;

    @GetMapping({"/api/v1/staff/dashboard", "/internal/v1/staff/dashboard"})
    @PreAuthorize("@access.has('lead.read_all') or @access.has('lead.read_own')")
    Dashboard dashboard() {
        UUID me = workflow.me();
        List<StageCount> stages = jdbc.sql("""
                SELECT ps.code, ps.name, count(l.id) FROM pipeline_stages ps
                LEFT JOIN leads l ON l.stage_id = ps.id AND l.assigned_user_id = :me
                WHERE ps.is_active GROUP BY ps.code, ps.name, ps.sort_order ORDER BY ps.sort_order""")
                .param("me", me).query((rs, n) -> new StageCount(rs.getString(1), rs.getString(2), rs.getLong(3))).list();
        List<VisitItem> today = jdbc.sql(VISIT_SELECT + " AND (v.scheduled_at AT TIME ZONE 'Asia/Kolkata')::date = " + IST_TODAY + " ORDER BY v.scheduled_at")
                .param("me", me).query(StaffDashboardController::visit).list();
        List<VisitItem> upcoming = jdbc.sql(VISIT_SELECT + " AND (v.scheduled_at AT TIME ZONE 'Asia/Kolkata')::date > " + IST_TODAY
                        + " AND v.scheduled_at < now() + interval '7 days' ORDER BY v.scheduled_at LIMIT 20")
                .param("me", me).query(StaffDashboardController::visit).list();
        FollowUpSummary f = jdbc.sql("""
                SELECT count(*), count(*) FILTER (WHERE (due_at AT TIME ZONE 'Asia/Kolkata')::date = """ + IST_TODAY + """
                ), count(*) FILTER (WHERE due_at < now())
                FROM crm_tasks WHERE assigned_to = :me AND status = 'open'""")
                .param("me", me).query((rs, n) -> new FollowUpSummary(rs.getLong(1), rs.getLong(2), rs.getLong(3))).single();
        List<RecentLead> recent = jdbc.sql("""
                SELECT l.id, l.public_ref, c.full_name, ps.code, l.updated_at FROM leads l
                JOIN customers c ON c.id = l.customer_id JOIN pipeline_stages ps ON ps.id = l.stage_id
                WHERE l.assigned_user_id = :me ORDER BY l.updated_at DESC, l.id DESC LIMIT 8""")
                .param("me", me).query((rs, n) -> new RecentLead(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3),
                        rs.getString(4), rs.getObject(5, OffsetDateTime.class))).list();
        return new Dashboard(stages, today, upcoming, f, recent);
    }

    private static VisitItem visit(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new VisitItem(rs.getObject(1, UUID.class), rs.getString(2), rs.getObject(3, OffsetDateTime.class), rs.getString(4),
                rs.getObject(5, UUID.class), rs.getString(6), rs.getString(7), rs.getString(8));
    }
}
