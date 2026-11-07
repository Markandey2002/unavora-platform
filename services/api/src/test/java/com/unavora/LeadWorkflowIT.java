package com.unavora;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.unavora.platform.RateLimiter;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * Slice 4: lead stage workflow, (re)assignment, site visits, follow-ups and dashboards. Every test creates its own
 * lead through the public enquiry API, so tests are independent of order and of the seeded LEAD-LOCAL-* rows.
 */
class LeadWorkflowIT extends IntegrationTestBase {
    @Autowired JdbcClient jdbc;
    @Autowired RateLimiter limiter;

    static final RequestPostProcessor E1 = bearer(EMPLOYEE_1), E2 = bearer(EMPLOYEE_2), DIR = bearer(DIRECTOR);

    @BeforeEach
    void reset() { limiter.reset(); }

    /** New property enquiry -> lead assigned to employee 1 (property owner), stage 'assigned'. */
    UUID newLead() throws Exception { return newLead(true); }

    UUID newLead(boolean withProperty) throws Exception {
        String phone = "98" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
        String res = mvc.perform(post("/api/v1/public/enquiries").contentType(MediaType.APPLICATION_JSON).header("X-Forwarded-For",
                        "203.0.113." + ThreadLocalRandom.current().nextInt(1, 250))
                        .content("{\"name\":\"Workflow Test\",\"phone\":\"" + phone + "\",\"propertyId\":"
                                + (withProperty ? "\"" + PUBLISHED_PROPERTY + "\"" : "null") + ",\"language\":\"en\",\"consent\":true}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return jdbc.sql("SELECT id FROM leads WHERE public_ref = :r").param("r", JsonPath.<String>read(res, "$.reference")).query(UUID.class).single();
    }

    long version(UUID lead) { return jdbc.sql("SELECT version FROM leads WHERE id = :l").param("l", lead).query(Long.class).single(); }

    String stage(UUID lead) {
        return jdbc.sql("SELECT ps.code FROM leads l JOIN pipeline_stages ps ON ps.id = l.stage_id WHERE l.id = :l")
                .param("l", lead).query(String.class).single();
    }

    ResultActions move(RequestPostProcessor who, UUID lead, String to, String extra) throws Exception {
        return mvc.perform(post("/api/v1/staff/leads/" + lead + "/stage").with(who).contentType(MediaType.APPLICATION_JSON)
                .content("{\"toStage\":\"" + to + "\"" + (extra == null ? "" : "," + extra) + "}"));
    }

    void moveOk(RequestPostProcessor who, UUID lead, String... stages) throws Exception {
        for (String s : stages) move(who, lead, s, "\"expectedVersion\":" + version(lead)).andExpect(status().isOk());
    }

    ResultActions schedule(RequestPostProcessor who, UUID lead, OffsetDateTime at, String extra) throws Exception {
        return mvc.perform(post("/api/v1/staff/site-visits").with(who).contentType(MediaType.APPLICATION_JSON)
                .content("{\"leadId\":\"" + lead + "\",\"scheduledAt\":\"" + at + "\"" + (extra == null ? "" : "," + extra) + "}"));
    }

    UUID visitId(String json) { return UUID.fromString(JsonPath.read(json, "$.id")); }

    /** A random time well away from other tests' visits for the same employee (conflict window is 60 min). */
    static OffsetDateTime slot() {
        return OffsetDateTime.now().plusDays(ThreadLocalRandom.current().nextInt(20, 170)).plusMinutes(ThreadLocalRandom.current().nextInt(0, 1400));
    }

    // =========================================================== database rules (migration V11)

    @Test
    void databaseRefusesLostOrInvalidHistoryWithoutReason() throws Exception {
        UUID lead = newLead();
        assertThrows(DataAccessException.class, () -> jdbc.sql("""
                INSERT INTO lead_stage_history (lead_id, from_stage_id, to_stage_id, reason)
                SELECT :l, (SELECT id FROM pipeline_stages WHERE code='assigned'), (SELECT id FROM pipeline_stages WHERE code='invalid'), ' '""")
                .param("l", lead).update());
        assertTrue(jdbc.sql("SELECT requires_reason FROM pipeline_stages WHERE code = 'invalid'").query(Boolean.class).single());
    }

    @Test
    void databaseRefusesDuplicateOpenFollowUpAndCompletionBeforeVisitTime() throws Exception {
        UUID lead = newLead();
        UUID customer = jdbc.sql("SELECT customer_id FROM leads WHERE id = :l").param("l", lead).query(UUID.class).single();
        String insert = """
                INSERT INTO crm_tasks (customer_id, lead_id, assigned_to, created_by, title, due_at)
                VALUES (:c, :l, CAST(:u AS uuid), CAST(:u AS uuid), 'Call back', TIMESTAMPTZ '2030-01-01 10:00+05:30')""";
        jdbc.sql(insert).param("c", customer).param("l", lead).param("u", EMPLOYEE_1).update();
        assertThrows(DataAccessException.class, () -> jdbc.sql(insert.replace("'Call back'", "'CALL BACK'"))
                .param("c", customer).param("l", lead).param("u", EMPLOYEE_1).update());
        assertThrows(DataAccessException.class, () -> jdbc.sql("""
                INSERT INTO site_visits (public_ref, lead_id, customer_id, property_id, assigned_user_id, status, scheduled_at, completed_at)
                VALUES ('VIS-T-1', :l, :c, CAST(:p AS uuid), CAST(:u AS uuid), 'completed', now() + interval '1 day', now())""")
                .param("l", lead).param("c", customer).param("p", PUBLISHED_PROPERTY).param("u", EMPLOYEE_1).update());
    }

    @Test
    void onlyDirectorsMayManageEveryVisit() {
        assertEquals(java.util.List.of("director"), jdbc.sql("""
                SELECT r.code FROM roles r JOIN role_permissions rp ON rp.role_id = r.id JOIN permissions p ON p.id = rp.permission_id
                WHERE p.code = 'visit.manage_all' ORDER BY r.code""").query(String.class).list());
    }

    // =========================================================== stage transitions

    @Test
    void allowedTransitionsRecordHistoryAuditTimelineAndOutbox() throws Exception {
        UUID lead = newLead();
        assertEquals("assigned", stage(lead));
        moveOk(E1, lead, "contacted", "qualified");
        assertEquals("qualified", stage(lead));
        var rows = jdbc.sql("""
                SELECT f.code || '>' || t.code || ':' || coalesce(h.changed_by::text,'-') FROM lead_stage_history h
                LEFT JOIN pipeline_stages f ON f.id = h.from_stage_id JOIN pipeline_stages t ON t.id = h.to_stage_id
                WHERE h.lead_id = :l AND h.from_stage_id IS NOT NULL ORDER BY h.id""").param("l", lead).query(String.class).list();
        assertEquals(java.util.List.of("assigned>contacted:" + EMPLOYEE_1, "contacted>qualified:" + EMPLOYEE_1), rows);
        assertEquals(2, jdbc.sql("SELECT count(*) FROM audit_logs WHERE action = 'lead.stage_changed' AND entity_id = :l")
                .param("l", lead.toString()).query(Integer.class).single());
        assertEquals(2, jdbc.sql("SELECT count(*) FROM lead_activities WHERE lead_id = :l AND activity_type = 'stage_changed'")
                .param("l", lead).query(Integer.class).single());
        assertEquals(2, jdbc.sql("SELECT count(*) FROM outbox_events WHERE aggregate_id = :l AND event_type = 'lead.stage_changed'")
                .param("l", lead.toString()).query(Integer.class).single());
        assertNotNull(jdbc.sql("SELECT first_contacted_at FROM leads WHERE id = :l").param("l", lead).query(OffsetDateTime.class).single());
        mvc.perform(get("/api/v1/staff/leads/" + lead + "/history").with(E1)).andExpect(status().isOk())
                .andExpect(jsonPath("$.stages", hasSize(3)))
                .andExpect(jsonPath("$.stages[0].fromStage").value("contacted")).andExpect(jsonPath("$.stages[0].toStage").value("qualified"))
                .andExpect(jsonPath("$.stages[0].changedBy").value("Local Employee One (synthetic)"));
    }

    @Test
    void disallowedTransitionsAreRefused() throws Exception {
        UUID lead = newLead();
        move(E1, lead, "negotiation", null).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("transition_not_allowed"));
        move(E1, lead, "assigned", null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("no_change"));
        move(E1, lead, "nonsense", null).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("unknown_stage"));
        moveOk(E1, lead, "contacted", "qualified", "negotiation", "booking_in_progress");
        move(E1, lead, "won", null).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("won_requires_deal"));
        assertEquals("booking_in_progress", stage(lead));
    }

    @Test
    void lostAndInvalidRequireReasons() throws Exception {
        UUID lead = newLead();
        move(E1, lead, "lost", null).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("lost_reason_required"));
        move(E1, lead, "lost", "\"reasonCode\":\"other\"").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("lost_note_required"));
        move(E1, lead, "invalid", null).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("reason_required"));
        move(E1, lead, "lost", "\"reasonCode\":\"budget_mismatch\",\"note\":\"Wants under 50 L\"").andExpect(status().isOk());
        assertEquals("lost", stage(lead));
        assertEquals("budget_mismatch|lost", jdbc.sql("SELECT lost_reason_code || '|' || outcome FROM leads WHERE id = :l").param("l", lead).query(String.class).single());
        assertEquals("Budget mismatch: Wants under 50 L|budget_mismatch", jdbc.sql("""
                SELECT reason || '|' || reason_code FROM lead_stage_history WHERE lead_id = :l ORDER BY id DESC LIMIT 1""").param("l", lead).query(String.class).single());

        UUID other = newLead();
        move(E1, other, "invalid", "\"note\":\"Test call, not a buyer\"").andExpect(status().isOk());
        assertEquals("invalid", stage(other));
    }

    @Test
    void staleVersionIsRefused() throws Exception {
        UUID lead = newLead();
        long v = version(lead);
        move(E1, lead, "contacted", "\"expectedVersion\":" + v).andExpect(status().isOk());
        move(E1, lead, "qualified", "\"expectedVersion\":" + v).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("stale_lead"));
    }

    @Test
    void onlyAuthorisedStaffCanReopenClosedLeads() throws Exception {
        UUID lead = newLead();
        move(E1, lead, "lost", "\"reasonCode\":\"no_response\"").andExpect(status().isOk());
        move(E1, lead, "contacted", null).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("reopen_not_permitted"));
        move(DIR, lead, "contacted", null).andExpect(status().isOk());
        assertEquals("open", jdbc.sql("SELECT outcome FROM leads WHERE id = :l").param("l", lead).query(String.class).single());
    }

    @Test
    void employeesCannotChangeLeadsTheyDoNotOwn() throws Exception {
        UUID lead = newLead();   // employee 1's lead
        move(E2, lead, "contacted", null).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/staff/leads/" + lead + "/history").with(E2)).andExpect(status().isNotFound());
        move(DIR, lead, "contacted", null).andExpect(status().isOk());   // director: company-wide
        move(bearerWithoutMfa(DIRECTOR), lead, "qualified", null).andExpect(status().isForbidden());   // MFA still enforced
    }

    // =========================================================== assignment / reassignment

    @Test
    void employeesCannotAssign() throws Exception {
        UUID lead = newLead();
        mvc.perform(post("/api/v1/staff/leads/" + lead + "/assign").with(E1).contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":\"" + EMPLOYEE_2 + "\",\"reason\":\"swap\"}")).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/staff/assignees").with(E1)).andExpect(status().isForbidden());
    }

    @Test
    void directorReassignsWithFullHistoryAndMovesOpenWork() throws Exception {
        UUID lead = newLead();
        moveOk(E1, lead, "contacted", "qualified");
        String visit = schedule(E1, lead, slot(), null).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        mvc.perform(post("/api/v1/staff/follow-ups").with(E1).contentType(MediaType.APPLICATION_JSON)
                .content("{\"leadId\":\"" + lead + "\",\"title\":\"Share floor plan\",\"dueAt\":\"" + OffsetDateTime.now().plusDays(2) + "\"}"))
                .andExpect(status().isCreated());
        int historyBefore = jdbc.sql("SELECT count(*) FROM lead_stage_history WHERE lead_id = :l").param("l", lead).query(Integer.class).single();

        String assign = "/api/v1/staff/leads/" + lead + "/assign";
        mvc.perform(post(assign).with(DIR).contentType(MediaType.APPLICATION_JSON).content("{\"assigneeId\":\"" + EMPLOYEE_2 + "\"}"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("reason_required"));
        mvc.perform(post(assign).with(DIR).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assigneeId\":\"" + UUID.randomUUID() + "\",\"reason\":\"test\"}"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("invalid_assignee"));
        mvc.perform(post(assign).with(DIR).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assigneeId\":\"" + EMPLOYEE_2 + "\",\"reason\":\"Employee one on leave\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.method").value("reassignment")).andExpect(jsonPath("$.movedFollowUps").value(1))
                .andExpect(jsonPath("$.movedVisits").value(1));
        mvc.perform(post(assign).with(DIR).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assigneeId\":\"" + EMPLOYEE_2 + "\",\"reason\":\"again\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("already_assigned"));

        // previous, new, actor, reason, time; old row closed
        assertEquals(EMPLOYEE_1 + "|" + EMPLOYEE_2 + "|" + DIRECTOR + "|Employee one on leave|reassignment", jdbc.sql("""
                SELECT previous_assigned_to || '|' || assigned_to || '|' || assigned_by || '|' || reason || '|' || method
                FROM lead_assignments WHERE lead_id = :l AND unassigned_at IS NULL""").param("l", lead).query(String.class).single());
        assertEquals(1, jdbc.sql("SELECT count(*) FROM lead_assignments WHERE lead_id = :l AND unassigned_at IS NOT NULL")
                .param("l", lead).query(Integer.class).single());
        assertEquals(1, jdbc.sql("SELECT count(*) FROM audit_logs WHERE action = 'lead.reassigned' AND entity_id = :l AND actor_user_id = CAST(:d AS uuid)")
                .param("l", lead.toString()).param("d", DIRECTOR).query(Integer.class).single());
        // the work moved, history stayed
        assertEquals(EMPLOYEE_2, jdbc.sql("SELECT assigned_user_id::text FROM site_visits WHERE id = :v").param("v", visitId(visit)).query(String.class).single());
        assertEquals(EMPLOYEE_2, jdbc.sql("SELECT assigned_to::text FROM crm_tasks WHERE lead_id = :l AND status = 'open'").param("l", lead).query(String.class).single());
        assertEquals(historyBefore, jdbc.sql("SELECT count(*) FROM lead_stage_history WHERE lead_id = :l").param("l", lead).query(Integer.class).single());
        // dashboards / access follow immediately
        mvc.perform(get("/api/v1/staff/leads/" + lead).with(E1)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/staff/leads/" + lead + "/history").with(E2)).andExpect(status().isOk())
                .andExpect(jsonPath("$.stages", hasSize(historyBefore))).andExpect(jsonPath("$.assignments[0].previousUser").value("Local Employee One (synthetic)"));
        move(E2, lead, "site_visit_completed", null).andExpect(status().isOk());
    }

    @Test
    void assigningANewUnassignedLeadMovesItToAssigned() throws Exception {
        UUID lead = newLead(false);   // general enquiry: no property owner, stage 'new', unassigned
        assertEquals("new", stage(lead));
        mvc.perform(post("/api/v1/staff/leads/" + lead + "/assign").with(DIR).contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":\"" + EMPLOYEE_1 + "\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.method").value("manual"));
        assertEquals("assigned", stage(lead));
        mvc.perform(get("/api/v1/staff/leads/" + lead).with(E1)).andExpect(status().isOk());
    }

    // =========================================================== site visits

    @Test
    void schedulingValidatesAndMovesTheLead() throws Exception {
        UUID lead = newLead();
        moveOk(E1, lead, "contacted", "qualified");
        schedule(E1, lead, OffsetDateTime.now().minusDays(2), null).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("invalid_schedule_time"));
        schedule(E1, lead, OffsetDateTime.now().plusDays(200), null).andExpect(status().isUnprocessableEntity());
        schedule(E1, lead, slot(), "\"propertyId\":\"" + DRAFT_PROPERTY + "\"").andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("property_unavailable"));
        schedule(E1, lead, slot(), "\"assignedUserId\":\"" + EMPLOYEE_2 + "\"").andExpect(status().isForbidden());
        OffsetDateTime t = slot();
        schedule(E1, lead, t, "\"locationNote\":\"Meet at gate 2\"").andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("scheduled")).andExpect(jsonPath("$.leadStage").value("site_visit_scheduled"));
        schedule(E1, lead, t.plusMinutes(30), null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("visit_conflict"));
        assertEquals("site_visit_scheduled", stage(lead));
        assertTrue(jdbc.sql("SELECT count(*) FROM audit_logs WHERE action = 'visit.scheduled'").query(Integer.class).single() >= 1);
        // director may schedule for another employee
        schedule(DIR, lead, slot(), "\"assignedUserId\":\"" + EMPLOYEE_2 + "\"").andExpect(status().isCreated());
    }

    @Test
    void visitsAreNeverCompletedByTimeAndCompletionMovesTheLead() throws Exception {
        UUID lead = newLead();
        moveOk(E1, lead, "contacted", "qualified");
        UUID visit = visitId(schedule(E1, lead, slot(), null).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String done = "/api/v1/staff/site-visits/" + visit + "/complete";
        String body = "{\"feedback\":\"Liked the balcony\",\"interestAfter\":\"high\",\"employeeNotes\":\"Ask about loan\",\"nextAction\":\"Send cost sheet\"}";
        mvc.perform(post(done).with(E1).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("visit_not_started"));
        mvc.perform(post("/api/v1/staff/site-visits/" + visit + "/no-show").with(E1).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict());
        // time passing alone changes nothing
        jdbc.sql("UPDATE site_visits SET scheduled_at = now() - interval '2 hours' WHERE id = :v").param("v", visit).update();
        assertEquals("scheduled", jdbc.sql("SELECT status FROM site_visits WHERE id = :v").param("v", visit).query(String.class).single());
        mvc.perform(post(done).with(E1).contentType(MediaType.APPLICATION_JSON).content("{\"interestAfter\":\"high\"}"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("outcome_required"));
        mvc.perform(post(done).with(E1).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.leadStage").value("site_visit_completed"));
        mvc.perform(post(done).with(E1).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("visit_closed"));
        mvc.perform(get("/api/v1/staff/site-visits/" + visit).with(E1)).andExpect(status().isOk())
                .andExpect(jsonPath("$.feedback").value("Liked the balcony")).andExpect(jsonPath("$.employeeNotes").value("Ask about loan"))
                .andExpect(jsonPath("$.history", hasSize(2)));
        assertEquals("site_visit_completed", stage(lead));
    }

    @Test
    void rescheduleCancelAndNoShowNeedReasonsAndRespectAccess() throws Exception {
        UUID lead = newLead();
        moveOk(E1, lead, "contacted", "qualified");
        UUID visit = visitId(schedule(E1, lead, slot(), null).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String base = "/api/v1/staff/site-visits/" + visit;
        mvc.perform(get(base).with(E2)).andExpect(status().isNotFound());
        mvc.perform(post(base + "/cancel").with(E2).contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"x y z\"}")).andExpect(status().isNotFound());
        mvc.perform(post(base + "/reschedule").with(E1).contentType(MediaType.APPLICATION_JSON)
                .content("{\"scheduledAt\":\"" + slot() + "\"}")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("reason_required"));
        mvc.perform(post(base + "/reschedule").with(E1).contentType(MediaType.APPLICATION_JSON)
                .content("{\"scheduledAt\":\"" + slot() + "\",\"reason\":\"Customer travelling\",\"expectedVersion\":0}")).andExpect(status().isOk());
        mvc.perform(post(base + "/reschedule").with(E1).contentType(MediaType.APPLICATION_JSON)
                .content("{\"scheduledAt\":\"" + slot() + "\",\"reason\":\"Again\",\"expectedVersion\":0}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("stale_visit"));
        mvc.perform(post(base + "/cancel").with(E1).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(post(base + "/cancel").with(E1).contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Bought elsewhere\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("cancelled"));
        assertEquals("Bought elsewhere", jdbc.sql("SELECT reason FROM site_visit_history WHERE site_visit_id = :v AND to_status = 'cancelled'")
                .param("v", visit).query(String.class).single());
        assertEquals(1, jdbc.sql("SELECT count(*) FROM audit_logs WHERE action = 'visit.cancelled' AND entity_id = :v")
                .param("v", visit.toString()).query(Integer.class).single());

        UUID absent = visitId(schedule(E1, lead, OffsetDateTime.now().minusHours(3), null).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        mvc.perform(post("/api/v1/staff/site-visits/" + absent + "/no-show").with(E1).contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"Phone switched off\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("no_show"));
        mvc.perform(post("/api/v1/staff/site-visits").with(E1).contentType(MediaType.APPLICATION_JSON).content("{\"scheduledAt\":\"" + slot() + "\"}"))
                .andExpect(status().isUnprocessableEntity());   // leadId required
    }

    @Test
    void closedLeadsCannotGetVisits() throws Exception {
        UUID lead = newLead();
        move(E1, lead, "invalid", "\"note\":\"Duplicate enquiry\"").andExpect(status().isOk());
        schedule(E1, lead, slot(), null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("lead_closed"));
    }

    // =========================================================== follow-ups

    @Test
    void followUpsOnLeadsAndVisitsWithValidation() throws Exception {
        UUID lead = newLead();
        moveOk(E1, lead, "contacted", "qualified");
        UUID visit = visitId(schedule(E1, lead, slot(), null).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        OffsetDateTime due = OffsetDateTime.now().plusDays(1).withNano(0);
        String body = "{\"siteVisitId\":\"" + visit + "\",\"title\":\"Confirm visit\",\"dueAt\":\"" + due + "\",\"priority\":\"high\"}";
        String created = mvc.perform(post("/api/v1/staff/follow-ups").with(E1).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        mvc.perform(post("/api/v1/staff/follow-ups").with(E1).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("duplicate_follow_up"));
        mvc.perform(post("/api/v1/staff/follow-ups").with(E1).contentType(MediaType.APPLICATION_JSON)
                .content("{\"leadId\":\"" + lead + "\",\"title\":\"Late\",\"dueAt\":\"" + OffsetDateTime.now().minusDays(1) + "\"}"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("invalid_due_time"));
        mvc.perform(post("/api/v1/staff/follow-ups").with(E1).contentType(MediaType.APPLICATION_JSON)
                .content("{\"leadId\":\"" + lead + "\",\"title\":\"For E2\",\"dueAt\":\"" + due + "\",\"assignedTo\":\"" + EMPLOYEE_2 + "\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/staff/follow-ups").with(E1).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Nothing\",\"dueAt\":\"" + due + "\"}")).andExpect(status().isUnprocessableEntity());
        mvc.perform(post("/api/v1/staff/follow-ups").with(E2).contentType(MediaType.APPLICATION_JSON)
                .content("{\"leadId\":\"" + lead + "\",\"title\":\"Snoop\",\"dueAt\":\"" + due + "\"}")).andExpect(status().isNotFound());

        String id = JsonPath.read(created, "$.id");
        mvc.perform(get("/api/v1/staff/follow-ups").with(E1)).andExpect(jsonPath("$[?(@.id=='" + id + "')].priority").value(org.hamcrest.Matchers.contains("high")))
                .andExpect(jsonPath("$[?(@.id=='" + id + "')].siteVisitId").value(org.hamcrest.Matchers.contains(visit.toString())));
        mvc.perform(post("/api/v1/staff/follow-ups/" + id + "/complete").with(E1)).andExpect(status().isOk());
        mvc.perform(post("/api/v1/staff/follow-ups/" + id + "/complete").with(E1))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("already_completed"));
        // director may create for an employee
        mvc.perform(post("/api/v1/staff/follow-ups").with(DIR).contentType(MediaType.APPLICATION_JSON)
                .content("{\"leadId\":\"" + lead + "\",\"title\":\"Director asks: call today\",\"dueAt\":\"" + due + "\",\"assignedTo\":\"" + EMPLOYEE_1 + "\"}"))
                .andExpect(status().isCreated());
    }

    // =========================================================== dashboards

    @Test
    void employeeDashboardShowsOwnWorkOnly() throws Exception {
        UUID lead = newLead();
        moveOk(E1, lead, "contacted", "qualified");
        schedule(E1, lead, OffsetDateTime.now().minusMinutes(1), null).andExpect(status().isCreated());
        schedule(E1, lead, OffsetDateTime.now().plusDays(3).plusMinutes(ThreadLocalRandom.current().nextInt(1, 600)), null).andExpect(status().isCreated());
        mvc.perform(get("/api/v1/staff/dashboard").with(E1)).andExpect(status().isOk())
                .andExpect(jsonPath("$.myLeadsByStage[?(@.stage=='site_visit_scheduled')].count").value(org.hamcrest.Matchers.contains(greaterThanOrEqualTo(1))))
                .andExpect(jsonPath("$.todaysVisits[?(@.leadId=='" + lead + "')]", not(hasSize(0))))
                .andExpect(jsonPath("$.upcomingVisits[?(@.leadId=='" + lead + "')]", hasSize(1)))
                .andExpect(jsonPath("$.recentlyUpdatedLeads[?(@.id=='" + lead + "')]", hasSize(1)))
                .andExpect(jsonPath("$.followUps.pending").isNumber());
        mvc.perform(get("/api/v1/staff/dashboard").with(E2)).andExpect(status().isOk())
                .andExpect(jsonPath("$.todaysVisits[?(@.leadId=='" + lead + "')]", hasSize(0)))
                .andExpect(jsonPath("$.recentlyUpdatedLeads[?(@.id=='" + lead + "')]", hasSize(0)));
    }

    @Test
    void directorOverviewHasPipelineVisitsConversionAndWorkload() throws Exception {
        UUID lead = newLead();
        moveOk(E1, lead, "contacted", "qualified");
        mvc.perform(get("/api/v1/director/overview").with(DIR)).andExpect(status().isOk())
                .andExpect(jsonPath("$.leadsByStage", hasSize(11)))
                .andExpect(jsonPath("$.leadsByEmployeeAndStage[?(@.userId=='" + EMPLOYEE_1 + "')]", not(hasSize(0))))
                .andExpect(jsonPath("$.visits.upcoming").isNumber())
                .andExpect(jsonPath("$.conversion.reachedQualified").value(greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.workload[?(@.userId=='" + EMPLOYEE_1 + "')].openLeads").value(org.hamcrest.Matchers.contains(greaterThanOrEqualTo(1))));
        mvc.perform(get("/api/v1/director/overview").with(E1)).andExpect(status().isForbidden());
    }
}
