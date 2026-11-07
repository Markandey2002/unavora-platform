package com.unavora.crm.internal;

import com.unavora.identity.AccessService;
import com.unavora.platform.ApiException;
import com.unavora.platform.Cursor;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Staff view of leads. Record-level rule enforced IN THE QUERY (not only in the UI):
 *  - lead.read_all  -> every lead
 *  - lead.read_own  -> only leads assigned to the caller
 * A lead the caller may not see is reported as 404, so its existence is not disclosed.
 */
@RestController
@RequestMapping("/api/v1/staff")
class StaffLeadController {
    private final JdbcClient jdbc;
    private final AccessService access;

    StaffLeadController(JdbcClient jdbc, AccessService access) { this.jdbc = jdbc; this.access = access; }

    record LeadRow(UUID id, String reference, String customerName, String phone, String stage, String stageName,
                   String enquiryType, String propertyTitle, int priority, UUID assignedUserId, OffsetDateTime createdAt) {}

    record LeadPage(List<LeadRow> items, String nextCursor) {}

    private static final String SELECT = """
            SELECT l.id, l.public_ref, c.full_name, c.phone_e164, ps.code AS stage_code, ps.name AS stage_name,
                   l.enquiry_type, pt.title AS property_title, l.priority_score, l.assigned_user_id, l.created_at
            FROM leads l
            JOIN customers c ON c.id = l.customer_id
            JOIN pipeline_stages ps ON ps.id = l.stage_id
            LEFT JOIN property_translations pt ON pt.property_id = l.interested_property_id AND pt.language = 'en'
            WHERE 1 = 1
            """;

    private static LeadRow map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new LeadRow(rs.getObject("id", UUID.class), rs.getString("public_ref"), rs.getString("full_name"),
                rs.getString("phone_e164"), rs.getString("stage_code"), rs.getString("stage_name"),
                rs.getString("enquiry_type"), rs.getString("property_title"), rs.getInt("priority_score"),
                rs.getObject("assigned_user_id", UUID.class), rs.getObject("created_at", OffsetDateTime.class));
    }

    @GetMapping("/leads")
    @PreAuthorize("@access.has('lead.read_all') or @access.has('lead.read_own')")
    LeadPage list(@RequestParam(required = false) String stage, @RequestParam(required = false) Integer limit,
                  @RequestParam(required = false) String cursor) {
        UUID me = access.currentUserId().orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Not permitted"));
        int pageSize = Cursor.clampLimit(limit);
        StringBuilder sql = new StringBuilder(SELECT);
        Map<String, Object> params = new HashMap<>();
        if (!access.has(me, "lead.read_all")) {
            sql.append(" AND l.assigned_user_id = :me");
            params.put("me", me);
        }
        if (stage != null && !stage.isBlank()) { sql.append(" AND ps.code = :stage"); params.put("stage", stage); }
        if (cursor != null && !cursor.isBlank()) {
            Cursor c = Cursor.decode(cursor);
            sql.append(" AND (l.created_at, l.id) < (CAST(:cAt AS timestamptz), CAST(:cId AS uuid))");
            params.put("cAt", c.at()); params.put("cId", c.id().toString());
        }
        sql.append(" ORDER BY l.created_at DESC, l.id DESC LIMIT :lim");
        params.put("lim", pageSize + 1);

        List<LeadRow> rows = new ArrayList<>(jdbc.sql(sql.toString()).params(params).query(StaffLeadController::map).list());
        String next = null;
        if (rows.size() > pageSize) {
            LeadRow last = rows.get(pageSize - 1);
            next = new Cursor(last.createdAt(), last.id()).encode();
            rows = rows.subList(0, pageSize);
        }
        return new LeadPage(rows, next);
    }

    @GetMapping("/leads/{id}")
    @PreAuthorize("@access.has('lead.read_all') or @access.has('lead.read_own')")
    LeadRow get(@PathVariable UUID id) {
        UUID me = access.currentUserId().orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Not permitted"));
        boolean all = access.has(me, "lead.read_all");
        StringBuilder sql = new StringBuilder(SELECT).append(" AND l.id = :id");
        if (!all) sql.append(" AND l.assigned_user_id = :me");
        var q = jdbc.sql(sql.toString()).param("id", id);
        if (!all) q = q.param("me", me);
        LeadRow row = q.query(StaffLeadController::map).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Lead not found"));
        jdbc.sql("""
                INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id)
                VALUES (:u, 'lead.viewed', 'lead', :id)""").param("u", me).param("id", id.toString()).update();
        return row;
    }
}
