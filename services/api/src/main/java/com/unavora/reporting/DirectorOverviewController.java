package com.unavora.reporting;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Director-only company-wide summary (permission report.director; director MFA enforced by AccessService).
 * KPI definitions: docs/CRM_SPECIFICATION.md §6. Read-only; reporting is the one module that reads across modules.
 */
@RestController
@RequestMapping({"/api/v1/director", "/internal/v1/director"})   // bearer JWT | BFF staff session
class DirectorOverviewController {
    private final JdbcClient jdbc;

    DirectorOverviewController(JdbcClient jdbc) { this.jdbc = jdbc; }

    record StageCount(String stage, String name, long count) {}

    record EmployeeStageCount(UUID userId, String name, String stage, long count) {}

    record VisitStats(long upcoming, long completedLast30Days, long cancelledLast30Days, long noShowLast30Days) {}

    /** winRate = won / (won + lost); visitConversion = leads with a completed visit / leads that reached Qualified or later. */
    record Conversion(long won, long lost, long invalid, Double winRate, long reachedQualified, long withCompletedVisit,
                      Double visitConversion, long reachedNegotiation) {}

    record Workload(UUID userId, String name, long openLeads, long openFollowUps, long overdueFollowUps,
                    long completedFollowUpsLast30Days, long completedOnTimeLast30Days, Double onTimeRate, long upcomingVisits) {}

    record Overview(long totalLeads, long newLast7Days, long unassigned, long publishedProperties,
                    Double avgFirstResponseMinutes, List<StageCount> leadsByStage,
                    List<EmployeeStageCount> leadsByEmployeeAndStage, VisitStats visits, Conversion conversion, List<Workload> workload) {}

    @GetMapping("/overview")
    @PreAuthorize("@access.has('report.director')")
    Overview overview() {
        long total = jdbc.sql("SELECT count(*) FROM leads").query(Long.class).single();
        long recent = jdbc.sql("SELECT count(*) FROM leads WHERE created_at >= now() - interval '7 days'").query(Long.class).single();
        long unassigned = jdbc.sql("SELECT count(*) FROM leads WHERE assigned_user_id IS NULL AND outcome = 'open'").query(Long.class).single();
        long props = jdbc.sql("SELECT count(*) FROM v_active_public_properties").query(Long.class).single();
        Double avgMin = jdbc.sql("SELECT avg(response_seconds) / 60.0 FROM v_lead_first_response").query(Double.class).optional().orElse(null);
        List<StageCount> stages = jdbc.sql("SELECT stage_code, stage_name, lead_count FROM v_leads_by_stage ORDER BY sort_order")
                .query((rs, n) -> new StageCount(rs.getString(1), rs.getString(2), rs.getLong(3))).list();

        List<EmployeeStageCount> byEmployee = jdbc.sql("""
                SELECT u.id, u.full_name, ps.code, count(*) FROM leads l
                JOIN users u ON u.id = l.assigned_user_id JOIN pipeline_stages ps ON ps.id = l.stage_id
                GROUP BY u.id, u.full_name, ps.code, ps.sort_order ORDER BY u.full_name, ps.sort_order""")
                .query((rs, n) -> new EmployeeStageCount(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getLong(4))).list();

        VisitStats visits = jdbc.sql("""
                SELECT count(*) FILTER (WHERE status IN ('scheduled','confirmed') AND scheduled_at >= now()),
                       count(*) FILTER (WHERE status = 'completed' AND completed_at >= now() - interval '30 days'),
                       count(*) FILTER (WHERE status = 'cancelled' AND updated_at >= now() - interval '30 days'),
                       count(*) FILTER (WHERE status = 'no_show' AND updated_at >= now() - interval '30 days')
                FROM site_visits""")
                .query((rs, n) -> new VisitStats(rs.getLong(1), rs.getLong(2), rs.getLong(3), rs.getLong(4))).single();

        Conversion conversion = jdbc.sql("""
                WITH reached AS (
                  SELECT h.lead_id, max(s.sort_order) AS max_order FROM lead_stage_history h
                  JOIN pipeline_stages s ON s.id = h.to_stage_id WHERE s.outcome = 'open' GROUP BY h.lead_id)
                SELECT (SELECT count(*) FROM leads WHERE outcome = 'won'),
                       (SELECT count(*) FROM leads WHERE outcome = 'lost'),
                       (SELECT count(*) FROM leads WHERE outcome = 'invalid'),
                       (SELECT count(*) FROM reached WHERE max_order >= (SELECT sort_order FROM pipeline_stages WHERE code = 'qualified')),
                       (SELECT count(DISTINCT lead_id) FROM site_visits WHERE status = 'completed'),
                       (SELECT count(*) FROM reached WHERE max_order >= (SELECT sort_order FROM pipeline_stages WHERE code = 'negotiation'))""")
                .query((rs, n) -> {
                    long won = rs.getLong(1), lost = rs.getLong(2), qualified = rs.getLong(4), visited = rs.getLong(5);
                    return new Conversion(won, lost, rs.getLong(3), won + lost == 0 ? null : (double) won / (won + lost),
                            qualified, visited, qualified == 0 ? null : (double) visited / qualified, rs.getLong(6));
                }).single();

        List<Workload> workload = jdbc.sql("""
                SELECT u.id, u.full_name,
                  (SELECT count(*) FROM leads l WHERE l.assigned_user_id = u.id AND l.outcome = 'open'),
                  (SELECT count(*) FROM crm_tasks t WHERE t.assigned_to = u.id AND t.status = 'open'),
                  (SELECT count(*) FROM crm_tasks t WHERE t.assigned_to = u.id AND t.status = 'open' AND t.due_at < now()),
                  (SELECT count(*) FROM crm_tasks t WHERE t.assigned_to = u.id AND t.status = 'done' AND t.completed_at >= now() - interval '30 days'),
                  (SELECT count(*) FROM crm_tasks t WHERE t.assigned_to = u.id AND t.status = 'done' AND t.completed_at >= now() - interval '30 days'
                                                        AND t.completed_at <= t.due_at),
                  (SELECT count(*) FROM site_visits v WHERE v.assigned_user_id = u.id AND v.status IN ('scheduled','confirmed') AND v.scheduled_at >= now())
                FROM users u
                WHERE u.status = 'active' AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                                                      WHERE ur.user_id = u.id AND r.code IN ('employee','director'))
                ORDER BY u.full_name""")
                .query((rs, n) -> {
                    long done = rs.getLong(6), onTime = rs.getLong(7);
                    return new Workload(rs.getObject(1, UUID.class), rs.getString(2), rs.getLong(3), rs.getLong(4), rs.getLong(5),
                            done, onTime, done == 0 ? null : (double) onTime / done, rs.getLong(8));
                }).list();

        return new Overview(total, recent, unassigned, props, avgMin, stages, byEmployee, visits, conversion, workload);
    }
}
