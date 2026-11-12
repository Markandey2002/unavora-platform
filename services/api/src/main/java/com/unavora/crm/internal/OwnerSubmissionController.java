package com.unavora.crm.internal;

import com.unavora.identity.AccessService;
import com.unavora.platform.ApiException;
import com.unavora.platform.PrivateFileStore;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * "List your property": an owner (or authorised representative) submits a property. It becomes a CRM lead
 * (enquiry type property_owner, source website_owner, unassigned for the director) plus a submission row and private
 * photos. Workflow: submitted -> reviewed (assigned employee or director) -> approved / rejected (director only,
 * property.publish). Approval records the decision; it NEVER publishes a listing.
 */
@RestController
class OwnerSubmissionController {
    static final Set<String> PURPOSES = Set.of("sale", "rent");
    static final int MAX_FILES = 5;

    private final EnquiryService enquiries;
    private final JdbcClient jdbc;
    private final PrivateFileStore files;
    private final AccessService access;
    private final LeadWorkflowService workflow;
    private final com.unavora.platform.MalwareScanner scanner;

    OwnerSubmissionController(EnquiryService enquiries, JdbcClient jdbc, PrivateFileStore files, AccessService access,
                              LeadWorkflowService workflow, com.unavora.platform.MalwareScanner scanner) {
        this.scanner = scanner;
        this.enquiries = enquiries;
        this.jdbc = jdbc;
        this.files = files;
        this.access = access;
        this.workflow = workflow;
    }

    record SubmissionResponse(String reference, String status) {}

    @PostMapping(value = "/api/v1/public/property-submissions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional
    ResponseEntity<SubmissionResponse> submit(@RequestParam String name, @RequestParam String phone,
                                              @RequestParam(required = false) String email,
                                              @RequestParam String city, @RequestParam(required = false) String locality,
                                              @RequestParam String propertyType, @RequestParam String purpose,
                                              @RequestParam(required = false) BigDecimal expectedPrice,
                                              @RequestParam(required = false) BigDecimal area,
                                              @RequestParam(required = false) String areaUnit,
                                              @RequestParam(required = false) String message,
                                              @RequestParam(required = false) String language,
                                              @RequestParam(defaultValue = "false") boolean consent,
                                              @RequestParam(required = false) List<MultipartFile> photos,
                                              @RequestHeader(value = "Idempotency-Key", required = false) UUID idempotencyKey,
                                              HttpServletRequest http) throws IOException {
        if (!consent) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validation_failed", "Consent is required to contact you");
        require(name, 200, "name"); require(phone, 20, "phone"); require(city, 100, "city");
        if (locality != null && locality.length() > 150) bad("locality");
        if (message != null && message.length() > 2000) bad("message");
        if (email != null && !email.isBlank() && (email.length() > 254 || !email.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$"))) bad("email");
        if (!PURPOSES.contains(purpose)) bad("purpose");
        if (jdbc.sql("SELECT count(*) FROM property_types WHERE code = :c AND is_active").param("c", propertyType).query(Integer.class).single() == 0) bad("propertyType");
        if (expectedPrice != null && (expectedPrice.signum() <= 0 || expectedPrice.compareTo(new BigDecimal("100000000000")) > 0)) bad("expectedPrice");
        if (area != null && (area.signum() <= 0 || area.compareTo(new BigDecimal("10000000")) > 0)) bad("area");
        if (area != null && (areaUnit == null || !Set.of("sq_ft", "sq_yd", "sq_m", "acre").contains(areaUnit))) bad("areaUnit");
        List<MultipartFile> uploads = photos == null ? List.of() : photos.stream().filter(f -> f != null && !f.isEmpty()).toList();
        if (uploads.size() > MAX_FILES) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "too_many_files", "Up to 5 photos");
        // Scan every file BEFORE anything is created: an infected upload rejects the whole submission.
        List<byte[]> contents = new ArrayList<>();
        List<com.unavora.platform.MalwareScanner.Result> verdicts = new ArrayList<>();
        for (MultipartFile f : uploads) {
            byte[] b;
            try { b = f.getBytes(); } catch (java.io.IOException e) { throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "file_empty", "The file could not be read"); }
            var v = scanner.scan(b);
            if (v.infected()) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "file_rejected", "A photo was rejected by the security scan");
            contents.add(b);
            verdicts.add(v);
        }

        var result = enquiries.submitOwner(name, phone, email, language, message, city, locality, propertyType, purpose, idempotencyKey, http.getRemoteAddr());
        if (!result.created()) return ResponseEntity.ok(new SubmissionResponse(result.reference(), "received"));
        UUID leadId = jdbc.sql("SELECT id FROM leads WHERE public_ref = :r").param("r", result.reference()).query(UUID.class).single();
        UUID submissionId = jdbc.sql("""
                INSERT INTO property_submissions (lead_id, city, locality, property_type_code, purpose, expected_price, area_value, area_unit, message)
                VALUES (:l, :city, :loc, :type, :purpose, :price, :area, :unit, :msg) RETURNING id""")
                .param("l", leadId).param("city", city.trim()).param("loc", EnquiryService.blankToNull(locality))
                .param("type", propertyType).param("purpose", purpose).param("price", expectedPrice).param("area", area)
                .param("unit", area == null ? null : areaUnit).param("msg", EnquiryService.blankToNull(message))
                .query(UUID.class).single();
        List<String> stored = new ArrayList<>();
        try {
            for (int i = 0; i < uploads.size(); i++) {
                MultipartFile f = uploads.get(i);
                var verdict = verdicts.get(i);
                var s = files.store(contents.get(i));
                stored.add(s.key());
                String original = f.getOriginalFilename() == null ? "photo" : f.getOriginalFilename().replaceAll("[^\\w.\\- ]", "_");
                jdbc.sql("""
                        INSERT INTO property_submission_files (submission_id, storage_key, original_name, content_type, size_bytes, sha256,
                                                               scan_status, scanned_at, scanner)
                        VALUES (:s, :k, :n, :t, :z, :h, :scan, CASE WHEN :scan = 'not_scanned' THEN NULL ELSE now() END, :scanner)""")
                        .param("s", submissionId).param("k", s.key()).param("n", original.length() > 200 ? original.substring(0, 200) : original)
                        .param("t", s.contentType()).param("z", s.size()).param("h", s.sha256())
                        .param("scan", verdict.status()).param("scanner", verdict.scanner()).update();
            }
        } catch (RuntimeException e) {
            stored.forEach(files::delete);   // the transaction rolls back; do not leave orphan files
            throw e;
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(new SubmissionResponse(result.reference(), "received"));
    }

    // ---------------- staff ----------------

    record SubmissionRow(UUID id, String status, String leadReference, UUID leadId, String ownerName, String city, String locality,
                         String propertyType, String purpose, BigDecimal expectedPrice, BigDecimal area, String areaUnit,
                         OffsetDateTime createdAt, String assignedUserName, int files) {}

    record SubmissionDetail(SubmissionRow submission, String message, String phone, String email, String reviewNote, String reviewedBy,
                            OffsetDateTime reviewedAt, String decisionNote, String decidedBy, OffsetDateTime decidedAt,
                            List<Map<String, Object>> photos, boolean canReview, boolean canDecide,
                            UUID propertyId, OffsetDateTime convertedAt) {}

    private static final String SELECT = """
            SELECT s.id, s.status, l.public_ref, l.id AS lead_id, c.full_name, s.city, s.locality, pt.name_en AS ptype, s.purpose,
                   s.expected_price, s.area_value, s.area_unit, s.created_at, u.full_name AS assignee,
                   (SELECT count(*) FROM property_submission_files f WHERE f.submission_id = s.id) AS files,
                   s.message, c.phone_e164, c.email_normalized, s.review_note, rv.full_name AS reviewer, s.reviewed_at,
                   s.decision_note, dc.full_name AS decider, s.decided_at, l.assigned_user_id, s.property_id, s.converted_at
            FROM property_submissions s JOIN leads l ON l.id = s.lead_id JOIN customers c ON c.id = l.customer_id
            JOIN property_types pt ON pt.code = s.property_type_code
            LEFT JOIN users u ON u.id = l.assigned_user_id LEFT JOIN users rv ON rv.id = s.reviewed_by LEFT JOIN users dc ON dc.id = s.decided_by
            WHERE 1 = 1
            """;

    private static SubmissionRow row(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new SubmissionRow(rs.getObject("id", UUID.class), rs.getString("status"), rs.getString("public_ref"),
                rs.getObject("lead_id", UUID.class), rs.getString("full_name"), rs.getString("city"), rs.getString("locality"),
                rs.getString("ptype"), rs.getString("purpose"), rs.getBigDecimal("expected_price"), rs.getBigDecimal("area_value"),
                rs.getString("area_unit"), rs.getObject("created_at", OffsetDateTime.class), rs.getString("assignee"), rs.getInt("files"));
    }

    @GetMapping({"/api/v1/staff/submissions", "/internal/v1/staff/submissions"})
    @PreAuthorize("@access.has('lead.read_all') or @access.has('lead.read_own')")
    List<SubmissionRow> list(@RequestParam(required = false) String status) {
        UUID me = workflow.me();
        boolean all = access.has("lead.read_all");
        String sql = SELECT + (all ? "" : " AND l.assigned_user_id = :me") + (status != null && !status.isBlank() ? " AND s.status = :st" : "")
                + " ORDER BY s.created_at DESC LIMIT 100";
        var q = jdbc.sql(sql);
        if (!all) q = q.param("me", me);
        if (status != null && !status.isBlank()) q = q.param("st", status);
        return q.query((rs, n) -> row(rs)).list();
    }

    @GetMapping({"/api/v1/staff/submissions/{id}", "/internal/v1/staff/submissions/{id}"})
    @PreAuthorize("@access.has('lead.read_all') or @access.has('lead.read_own')")
    SubmissionDetail detail(@PathVariable UUID id) {
        return loadDetail(id);
    }

    record ReviewBody(String note) {}

    record DecisionBody(String decision, String note) {}

    @PostMapping({"/api/v1/staff/submissions/{id}/review", "/internal/v1/staff/submissions/{id}/review"})
    @PreAuthorize("@access.has('lead.read_all') or @access.has('lead.read_own')")
    @Transactional
    SubmissionDetail review(@PathVariable UUID id, @RequestBody ReviewBody body) {
        SubmissionDetail d = loadDetail(id);
        if (!d.canReview()) throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Only the assigned employee or the director can review");
        if (!"submitted".equals(d.submission().status())) throw new ApiException(HttpStatus.CONFLICT, "not_reviewable", "Already reviewed");
        String note = body == null ? null : EnquiryService.blankToNull(body.note());
        if (note == null || note.length() > 2000) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "reason_required", "Add a review note");
        jdbc.sql("UPDATE property_submissions SET status = 'reviewed', reviewed_by = :me, reviewed_at = now(), review_note = :n WHERE id = :id")
                .param("me", workflow.me()).param("n", note).param("id", id).update();
        workflow.audit(workflow.me(), "submission.reviewed", id, "{\"leadId\":\"" + d.submission().leadId() + "\"}");
        return loadDetail(id);
    }

    @PostMapping({"/api/v1/staff/submissions/{id}/decision", "/internal/v1/staff/submissions/{id}/decision"})
    @PreAuthorize("@access.has('property.publish')")
    @Transactional
    SubmissionDetail decide(@PathVariable UUID id, @RequestBody DecisionBody body) {
        SubmissionDetail d = loadDetail(id);
        if (!"reviewed".equals(d.submission().status())) throw new ApiException(HttpStatus.CONFLICT, "not_reviewed", "Review the submission first");
        if (body == null || !Set.of("approved", "rejected").contains(body.decision())) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validation_failed", "Choose approve or reject");
        String note = EnquiryService.blankToNull(body.note());
        if (note == null || note.length() > 2000) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "reason_required", "Add a decision note");
        jdbc.sql("UPDATE property_submissions SET status = :st, decided_by = :me, decided_at = now(), decision_note = :n WHERE id = :id")
                .param("st", body.decision()).param("me", workflow.me()).param("n", note).param("id", id).update();
        workflow.audit(workflow.me(), "submission." + body.decision(), id, "{\"leadId\":\"" + d.submission().leadId() + "\"}");
        return loadDetail(id);
    }

    @GetMapping({"/api/v1/staff/submissions/{id}/files/{fileId}", "/internal/v1/staff/submissions/{id}/files/{fileId}"})
    @PreAuthorize("@access.has('lead.read_all') or @access.has('lead.read_own')")
    ResponseEntity<byte[]> file(@PathVariable UUID id, @PathVariable UUID fileId) {
        loadDetail(id);   // visibility check
        var f = jdbc.sql("SELECT storage_key, content_type FROM property_submission_files WHERE id = :f AND submission_id = :s")
                .param("f", fileId).param("s", id).query((rs, n) -> new String[]{rs.getString(1), rs.getString(2)}).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "File not found"));
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(f[1]))
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .body(files.load(f[0]));
    }

    private SubmissionDetail loadDetail(UUID id) {
        UUID me = workflow.me();
        boolean all = access.has("lead.read_all");
        var q = jdbc.sql(SELECT + " AND s.id = :id" + (all ? "" : " AND l.assigned_user_id = :me")).param("id", id);
        if (!all) q = q.param("me", me);
        return q.query((rs, n) -> {
            UUID assignee = rs.getObject("assigned_user_id", UUID.class);
            boolean canReview = access.has("property.publish") || me.equals(assignee);
            List<Map<String, Object>> photos = jdbc.sql("""
                    SELECT id, original_name, size_bytes, scan_status FROM property_submission_files WHERE submission_id = :s ORDER BY created_at""")
                    .param("s", id).query((r, i) -> Map.<String, Object>of("id", r.getObject("id", UUID.class), "name", r.getString("original_name"),
                            "size", r.getInt("size_bytes"), "scanStatus", r.getString("scan_status"))).list();
            return new SubmissionDetail(row(rs), rs.getString("message"), rs.getString("phone_e164"), rs.getString("email_normalized"),
                    rs.getString("review_note"), rs.getString("reviewer"), rs.getObject("reviewed_at", OffsetDateTime.class),
                    rs.getString("decision_note"), rs.getString("decider"), rs.getObject("decided_at", OffsetDateTime.class),
                    photos, canReview, access.has("property.publish"),
                    rs.getObject("property_id", UUID.class), rs.getObject("converted_at", OffsetDateTime.class));
        }).optional().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Submission not found"));
    }

    private static void require(String v, int max, String field) {
        if (v == null || v.isBlank() || v.length() > max) bad(field);
    }

    private static void bad(String field) {
        throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validation_failed", "Please check " + field);
    }
}
