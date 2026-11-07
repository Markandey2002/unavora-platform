package com.unavora.crm.internal;

import com.unavora.identity.AccessService;
import com.unavora.platform.ApiException;
import com.unavora.platform.Cursor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Staff view of customers (including website-registered customers who have not enquired yet).
 * Record-level rule, enforced in SQL:
 *  - customer.read_all -> every customer (directors / sales managers)
 *  - customer.read_own -> customers assigned to me, or with at least one lead assigned to me
 * Records the caller may not see are reported as 404. Contact details are returned only to callers who may see the
 * customer, with ready-made call (tel:) and WhatsApp (wa.me) actions. A wa.me click is NOT a delivered message:
 * staff record what happened via /communications (record_origin=employee_recorded).
 */
@RestController
@RequestMapping({"/api/v1/staff/customers", "/internal/v1/staff/customers"})   // bearer JWT | BFF staff session
class StaffCustomerController {
    private final JdbcClient jdbc;
    private final AccessService access;

    private final FollowUpWriter followUps;

    StaffCustomerController(JdbcClient jdbc, AccessService access, FollowUpWriter followUps) {
        this.jdbc = jdbc;
        this.access = access;
        this.followUps = followUps;
    }

    record CustomerRow(UUID id, String reference, String name, String email, String phone, String whatsapp,
                       boolean whatsappVerified, OffsetDateTime registeredAt, OffsetDateTime lastLoginAt, String signupSource,
                       long openLeads, OffsetDateTime createdAt) {}

    record CustomerPage(List<CustomerRow> items, String nextCursor) {}

    record ContactActions(String callUrl, String whatsappUrl) {}

    record ConsentState(String purpose, boolean granted, String noticeVersion, String source, OffsetDateTime recordedAt) {}

    record LeadSummary(UUID id, String reference, String enquiryType, String stage, UUID assignedUserId,
                       OffsetDateTime createdAt, OffsetDateTime nextActionAt) {}

    record Communication(UUID id, String channel, String direction, String recordOrigin, String deliveryStatus,
                         String summary, UUID actorUserId, UUID leadId, OffsetDateTime occurredAt) {}

    record FollowUp(UUID id, String title, String status, OffsetDateTime dueAt, UUID assignedTo, UUID leadId) {}

    record CustomerDetail(CustomerRow customer, String preferredLanguage, ContactActions actions, List<ConsentState> consents,
                          List<LeadSummary> leads, List<Communication> communications, List<FollowUp> followUps) {}

    record CommunicationRequest(@NotNull @Pattern(regexp = "phone|whatsapp") String channel,
                                @NotNull @Pattern(regexp = "inbound|outbound") String direction,
                                @NotBlank @Size(max = 500) String summary, UUID leadId) {}

    record FollowUpRequest(@NotBlank @Size(max = 200) String title, @Size(max = 2000) String description,
                           @NotNull OffsetDateTime dueAt, UUID leadId, @Pattern(regexp = "low|normal|high") String priority) {}

    private static final String SELECT = """
            SELECT c.id, c.public_ref, c.full_name, c.email_normalized, c.phone_e164, c.whatsapp_e164,
                   c.whatsapp_verified_at IS NOT NULL AS wa_verified, c.registered_at, c.signup_source, c.created_at,
                   (SELECT max(ci.last_login_at) FROM customer_identities ci WHERE ci.customer_id = c.id) AS last_login_at,
                   (SELECT count(*) FROM leads l WHERE l.customer_id = c.id AND l.outcome = 'open') AS open_leads
            FROM customers c
            WHERE c.status = 'active'
            """;

    /** SQL fragment restricting customers to those the caller may see. */
    private static final String OWN = """
             AND (c.assigned_user_id = :me OR EXISTS (SELECT 1 FROM leads ol WHERE ol.customer_id = c.id AND ol.assigned_user_id = :me))
            """;

    private static CustomerRow map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new CustomerRow(rs.getObject("id", UUID.class), rs.getString("public_ref"), rs.getString("full_name"),
                rs.getString("email_normalized"), rs.getString("phone_e164"), rs.getString("whatsapp_e164"),
                rs.getBoolean("wa_verified"), rs.getObject("registered_at", OffsetDateTime.class),
                rs.getObject("last_login_at", OffsetDateTime.class), rs.getString("signup_source"),
                rs.getLong("open_leads"), rs.getObject("created_at", OffsetDateTime.class));
    }

    @GetMapping
    @PreAuthorize("@access.has('customer.read_all') or @access.has('customer.read_own')")
    CustomerPage list(@RequestParam(required = false) Boolean registered, @RequestParam(required = false) Integer limit,
                      @RequestParam(required = false) String cursor) {
        UUID me = me();
        int pageSize = Cursor.clampLimit(limit);
        StringBuilder sql = new StringBuilder(SELECT);
        Map<String, Object> params = new HashMap<>();
        if (!access.has(me, "customer.read_all")) { sql.append(OWN); params.put("me", me); }
        if (Boolean.TRUE.equals(registered)) sql.append(" AND c.registered_at IS NOT NULL");
        if (Boolean.FALSE.equals(registered)) sql.append(" AND c.registered_at IS NULL");
        if (cursor != null && !cursor.isBlank()) {
            Cursor c = Cursor.decode(cursor);
            sql.append(" AND (c.created_at, c.id) < (CAST(:cAt AS timestamptz), CAST(:cId AS uuid))");
            params.put("cAt", c.at()); params.put("cId", c.id().toString());
        }
        sql.append(" ORDER BY c.created_at DESC, c.id DESC LIMIT :lim");
        params.put("lim", pageSize + 1);
        List<CustomerRow> rows = new ArrayList<>(jdbc.sql(sql.toString()).params(params).query(StaffCustomerController::map).list());
        String next = null;
        if (rows.size() > pageSize) {
            CustomerRow last = rows.get(pageSize - 1);
            next = new Cursor(last.createdAt(), last.id()).encode();
            rows = rows.subList(0, pageSize);
        }
        return new CustomerPage(rows, next);
    }

    @GetMapping("/{id}")
    @PreAuthorize("@access.has('customer.read_all') or @access.has('customer.read_own')")
    @Transactional
    CustomerDetail get(@PathVariable UUID id) {
        UUID me = me();
        boolean all = access.has(me, "customer.read_all");
        CustomerRow c = visibleCustomer(id, me, all);
        String lang = jdbc.sql("SELECT preferred_language FROM customers WHERE id = :id").param("id", id).query(String.class).single();

        String number = c.whatsappVerified() ? c.whatsapp() : c.phone();
        ContactActions actions = new ContactActions(
                c.phone() != null ? "tel:" + c.phone() : (c.whatsapp() != null ? "tel:" + c.whatsapp() : null),
                number != null ? "https://wa.me/" + number.substring(1) : null);

        List<ConsentState> consents = jdbc.sql("""
                SELECT DISTINCT ON (purpose) purpose, granted, notice_version, source, recorded_at
                FROM customer_consents WHERE customer_id = :id ORDER BY purpose, recorded_at DESC, id DESC""")
                .param("id", id).query((rs, n) -> new ConsentState(rs.getString(1), rs.getBoolean(2), rs.getString(3),
                        rs.getString(4), rs.getObject(5, OffsetDateTime.class))).list();

        var leadSql = new StringBuilder("""
                SELECT l.id, l.public_ref, l.enquiry_type, ps.code, l.assigned_user_id, l.created_at, l.next_action_at
                FROM leads l JOIN pipeline_stages ps ON ps.id = l.stage_id WHERE l.customer_id = :id""");
        if (!all && !access.has(me, "lead.read_all")) leadSql.append(" AND l.assigned_user_id = :me");
        leadSql.append(" ORDER BY l.created_at DESC");
        var lq = jdbc.sql(leadSql.toString()).param("id", id);
        if (leadSql.indexOf(":me") > 0) lq = lq.param("me", me);
        List<LeadSummary> leads = lq.query((rs, n) -> new LeadSummary(rs.getObject(1, UUID.class), rs.getString(2),
                rs.getString(3), rs.getString(4), rs.getObject(5, UUID.class), rs.getObject(6, OffsetDateTime.class),
                rs.getObject(7, OffsetDateTime.class))).list();

        List<Communication> comms = jdbc.sql("""
                SELECT id, channel, direction, record_origin, delivery_status, body_preview, actor_user_id, lead_id, occurred_at
                FROM communication_logs WHERE customer_id = :id ORDER BY occurred_at DESC LIMIT 50""")
                .param("id", id).query((rs, n) -> new Communication(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3),
                        rs.getString(4), rs.getString(5), rs.getString(6), rs.getObject(7, UUID.class), rs.getObject(8, UUID.class),
                        rs.getObject(9, OffsetDateTime.class))).list();

        List<FollowUp> tasks = jdbc.sql("""
                SELECT id, title, status, due_at, assigned_to, lead_id FROM crm_tasks
                WHERE customer_id = :id ORDER BY (status = 'open') DESC, due_at LIMIT 50""")
                .param("id", id).query((rs, n) -> new FollowUp(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3),
                        rs.getObject(4, OffsetDateTime.class), rs.getObject(5, UUID.class), rs.getObject(6, UUID.class))).list();

        jdbc.sql("INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES (:u, 'customer.viewed', 'customer', :id)")
                .param("u", me).param("id", id.toString()).update();
        return new CustomerDetail(c, lang, actions, consents, leads, comms, tasks);
    }

    @PostMapping("/{id}/communications")
    @PreAuthorize("@access.has('lead.update')")
    @Transactional
    ResponseEntity<Map<String, UUID>> recordCommunication(@PathVariable UUID id, @Valid @RequestBody CommunicationRequest body) {
        UUID me = me();
        visibleCustomer(id, me, access.has(me, "customer.read_all"));
        UUID leadId = checkLead(id, body.leadId(), me);
        UUID commId = jdbc.sql("""
                INSERT INTO communication_logs (customer_id, lead_id, channel, direction, record_origin, delivery_status,
                                                body_preview, actor_user_id)
                VALUES (:c, :l, :ch, :dir, 'employee_recorded', 'recorded_manual', :s, :me) RETURNING id""")
                .param("c", id).param("l", leadId).param("ch", body.channel()).param("dir", body.direction())
                .param("s", body.summary().trim()).param("me", me).query(UUID.class).single();
        jdbc.sql("""
                INSERT INTO lead_activities (customer_id, lead_id, activity_type, summary, actor_user_id, ref_type, ref_id)
                VALUES (:c, :l, :t, :s, :me, 'communication', :ref)""")
                .param("c", id).param("l", leadId).param("t", "phone".equals(body.channel()) ? "call_recorded" : "whatsapp_event")
                .param("s", truncate(("phone".equals(body.channel()) ? "Call " : "WhatsApp ") + body.direction() + ": " + body.summary().trim()))
                .param("me", me).param("ref", commId.toString()).update();
        if (leadId != null && "outbound".equals(body.direction())) {
            jdbc.sql("UPDATE leads SET first_contacted_at = coalesce(first_contacted_at, now()), last_contacted_at = now() WHERE id = :l")
                    .param("l", leadId).update();
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", commId));
    }

    @PostMapping("/{id}/follow-ups")
    @PreAuthorize("@access.has('task.manage_own') or @access.has('task.manage_all')")
    @Transactional
    ResponseEntity<Map<String, UUID>> createFollowUp(@PathVariable UUID id, @Valid @RequestBody FollowUpRequest body) {
        UUID me = me();
        visibleCustomer(id, me, access.has(me, "customer.read_all"));
        UUID leadId = checkLead(id, body.leadId(), me);
        FollowUpWriter.validateDue(body.dueAt());
        UUID taskId = followUps.insert(id, leadId, null, me, me, body.title(), body.description(), body.dueAt(),
                body.priority() == null ? "normal" : body.priority());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", taskId));
    }

    private UUID me() {
        return access.currentUserId().orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Not permitted"));
    }

    private CustomerRow visibleCustomer(UUID id, UUID me, boolean all) {
        var q = jdbc.sql(SELECT + " AND c.id = :id" + (all ? "" : OWN)).param("id", id);
        if (!all) q = q.param("me", me);
        return q.query(StaffCustomerController::map).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Customer not found"));
    }

    /** A referenced lead must belong to this customer and be visible to the caller. */
    private UUID checkLead(UUID customerId, UUID leadId, UUID me) {
        if (leadId == null) return null;
        boolean all = access.has(me, "lead.read_all");
        var q = jdbc.sql("SELECT id FROM leads WHERE id = :l AND customer_id = :c" + (all ? "" : " AND assigned_user_id = :me"))
                .param("l", leadId).param("c", customerId);
        if (!all) q = q.param("me", me);
        return q.query(UUID.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Lead not found"));
    }

    private static String truncate(String s) { return s.length() <= 500 ? s : s.substring(0, 497) + "..."; }
}
