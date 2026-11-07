package com.unavora.reporting;

import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Director-only company-wide summary. KPI definitions: docs/CRM_SPECIFICATION.md. */
@RestController
@RequestMapping("/api/v1/director")
class DirectorOverviewController {
    private final JdbcClient jdbc;

    DirectorOverviewController(JdbcClient jdbc) { this.jdbc = jdbc; }

    record StageCount(String stage, String name, long count) {}

    record Overview(long totalLeads, long newLast7Days, long unassigned, long publishedProperties,
                    Double avgFirstResponseMinutes, List<StageCount> leadsByStage) {}

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
        return new Overview(total, recent, unassigned, props, avgMin, stages);
    }
}
