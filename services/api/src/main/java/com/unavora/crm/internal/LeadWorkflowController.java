package com.unavora.crm.internal;

import com.unavora.identity.AccessService;
import com.unavora.platform.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Lead stage changes, (re)assignment and history. Rules live in {@link LeadWorkflowService}. */
@RestController
@RequestMapping({"/api/v1/staff", "/internal/v1/staff"})   // bearer JWT | BFF staff session
class LeadWorkflowController {
    private final LeadWorkflowService workflow;
    private final AccessService access;
    private final JdbcClient jdbc;

    LeadWorkflowController(LeadWorkflowService workflow, AccessService access, JdbcClient jdbc) {
        this.workflow = workflow;
        this.access = access;
        this.jdbc = jdbc;
    }

    record StageDef(String code, String name, int sortOrder, String outcome, boolean requiresReason, boolean requiresCompletedDeal) {}
    record Transition(String from, String to) {}
    record LostReason(String code, String name, boolean needsNote) {}
    record Pipeline(List<StageDef> stages, List<Transition> transitions, List<LostReason> lostReasons) {}
    record Assignee(UUID id, String name, List<String> roles) {}

    record StageRequest(@NotBlank @Size(max = 40) String toStage, Long expectedVersion,
                        @Size(max = 40) String reasonCode, @Size(max = 1000) String note) {}
    record AssignRequest(@NotNull UUID assigneeId, Long expectedVersion, @Size(max = 1000) String reason) {}

    record StageEvent(String fromStage, String toStage, String changedBy, String reason, String reasonCode, OffsetDateTime changedAt) {}
    record AssignmentEvent(String previousUser, String assignedTo, String assignedBy, String method, String reason, OffsetDateTime assignedAt) {}
    record History(List<StageEvent> stages, List<AssignmentEvent> assignments) {}

    @GetMapping("/pipeline")
    @PreAuthorize("@access.has('lead.read_all') or @access.has('lead.read_own')")
    Pipeline pipeline() {
        return new Pipeline(
                jdbc.sql("SELECT code, name, sort_order, outcome, requires_reason, requires_completed_deal FROM pipeline_stages WHERE is_active ORDER BY sort_order")
                        .query((rs, n) -> new StageDef(rs.getString(1), rs.getString(2), rs.getInt(3), rs.getString(4), rs.getBoolean(5), rs.getBoolean(6))).list(),
                jdbc.sql("""
                        SELECT f.code, t.code FROM pipeline_stage_transitions x
                        JOIN pipeline_stages f ON f.id = x.from_stage_id JOIN pipeline_stages t ON t.id = x.to_stage_id
                        ORDER BY f.sort_order, t.sort_order""").query((rs, n) -> new Transition(rs.getString(1), rs.getString(2))).list(),
                jdbc.sql("SELECT code, name, needs_note FROM lost_reasons WHERE is_active ORDER BY name")
                        .query((rs, n) -> new LostReason(rs.getString(1), rs.getString(2), rs.getBoolean(3))).list());
    }

    @GetMapping("/assignees")
    @PreAuthorize("@access.has('lead.assign') or @access.has('visit.manage_all') or @access.has('task.manage_all')")
    List<Assignee> assignees() {
        return jdbc.sql("""
                SELECT u.id, u.full_name, array_agg(DISTINCT r.code ORDER BY r.code)
                FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
                WHERE u.status = 'active' AND r.code IN ('employee','director')
                GROUP BY u.id, u.full_name ORDER BY u.full_name""")
                .query((rs, n) -> new Assignee(rs.getObject(1, UUID.class), rs.getString(2),
                        List.of((String[]) rs.getArray(3).getArray()))).list();
    }

    @PostMapping("/leads/{id}/stage")
    @PreAuthorize("@access.has('lead.update')")
    LeadWorkflowService.StageChanged changeStage(@PathVariable UUID id, @Valid @RequestBody StageRequest body) {
        return workflow.changeStage(id, body.toStage(), body.expectedVersion(), body.reasonCode(), body.note());
    }

    @PostMapping("/leads/{id}/assign")
    @PreAuthorize("@access.has('lead.assign')")
    LeadWorkflowService.Assigned assign(@PathVariable UUID id, @Valid @RequestBody AssignRequest body) {
        return workflow.assign(id, body.assigneeId(), body.expectedVersion(), body.reason());
    }

    /** Full stage and assignment history, kept intact across reassignments. Same visibility as the lead. */
    @GetMapping("/leads/{id}/history")
    @PreAuthorize("@access.has('lead.read_all') or @access.has('lead.read_own')")
    History history(@PathVariable UUID id) {
        UUID me = workflow.me();
        boolean all = access.has(me, "lead.read_all");
        var q = jdbc.sql("SELECT 1 FROM leads WHERE id = :id" + (all ? "" : " AND assigned_user_id = :me")).param("id", id);
        if (!all) q = q.param("me", me);
        if (q.query(Integer.class).optional().isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Lead not found");
        List<StageEvent> stages = jdbc.sql("""
                SELECT f.code, t.code, u.full_name, h.reason, h.reason_code, h.changed_at FROM lead_stage_history h
                LEFT JOIN pipeline_stages f ON f.id = h.from_stage_id JOIN pipeline_stages t ON t.id = h.to_stage_id
                LEFT JOIN users u ON u.id = h.changed_by WHERE h.lead_id = :id ORDER BY h.changed_at DESC, h.id DESC""")
                .param("id", id).query((rs, n) -> new StageEvent(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4),
                        rs.getString(5), rs.getObject(6, OffsetDateTime.class))).list();
        List<AssignmentEvent> assignments = jdbc.sql("""
                SELECT pu.full_name, tu.full_name, bu.full_name, a.method, a.reason, a.assigned_at FROM lead_assignments a
                JOIN users tu ON tu.id = a.assigned_to LEFT JOIN users pu ON pu.id = a.previous_assigned_to
                LEFT JOIN users bu ON bu.id = a.assigned_by WHERE a.lead_id = :id ORDER BY a.assigned_at DESC, a.id DESC""")
                .param("id", id).query((rs, n) -> new AssignmentEvent(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4),
                        rs.getString(5), rs.getObject(6, OffsetDateTime.class))).list();
        return new History(stages, assignments);
    }
}
