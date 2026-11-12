package com.unavora.properties.internal;

import com.unavora.identity.AccessService;
import com.unavora.platform.ApiException;
import com.unavora.platform.MediaLibrary;
import com.unavora.platform.PrivateFileStore;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Listing management in the CRM (the "normal property workflow").
 * draft --submit (property.submit)--> pending_review --review (property.review)--> approved | rejected
 * approved/withdrawn --publish (property.publish)--> published --unpublish--> withdrawn | --sold--> sold
 * Editing a rejected or withdrawn listing returns it to draft. Employees see and edit only listings they created or
 * are assigned to; property.read_all sees all. Every status change is recorded in listing_status_history and audit_logs.
 * Mapped on /api/v1/staff/** (bearer) and /internal/v1/staff/** (BFF).
 */
@RestController
class StaffPropertyController {
    static final Set<String> EDITABLE = Set.of("draft", "rejected", "withdrawn");
    private static final String[] P = {"/api/v1/staff/properties", "/internal/v1/staff/properties"};

    private final JdbcClient jdbc;
    private final AccessService access;
    private final MediaLibrary media;
    private final PrivateFileStore privateStore;

    StaffPropertyController(JdbcClient jdbc, AccessService access, MediaLibrary media, PrivateFileStore privateStore) {
        this.jdbc = jdbc;
        this.access = access;
        this.media = media;
        this.privateStore = privateStore;
    }

    record Translation(String title, String slug, String description) {}

    record PropertyBody(String typeCode, UUID localityId, String purpose, BigDecimal priceAmount, Boolean priceOnRequest,
                        Boolean priceNegotiable, String areaUnit, BigDecimal builtUpArea, BigDecimal carpetArea, BigDecimal plotArea,
                        Short bedrooms, Short bathrooms, Short parkingSpaces, String furnishing, String possessionStatus,
                        LocalDate possessionDate, Short floorNumber, Short totalFloors, String addressLine, BigDecimal latitude,
                        BigDecimal longitude, Boolean hideExactLocation, UUID projectId, UUID ownerUserId, List<String> amenityCodes,
                        Translation en, Translation hi) {}

    record StatusBody(String decision, String note) {}

    // ---------------- reads ----------------

    @GetMapping({"/api/v1/staff/properties", "/internal/v1/staff/properties"})
    @PreAuthorize("@access.has('property.read_all') or @access.has('property.read_own')")
    List<Map<String, Object>> list(@RequestParam(required = false) String status, @RequestParam(required = false) String q) {
        StringBuilder sql = new StringBuilder("""
                SELECT p.id, p.public_number, p.status, p.availability, p.is_sample, p.price_amount, p.price_on_request, p.updated_at,
                       t.title, t.slug, l.city, l.name_en AS locality, pt.name_en AS type_name, u.full_name AS owner_name,
                       (SELECT count(*) FROM property_media m WHERE m.property_id = p.id) AS photos,
                       (SELECT count(*) FROM property_media m WHERE m.property_id = p.id AND m.approved_at IS NOT NULL) AS approved_photos
                FROM properties p LEFT JOIN property_translations t ON t.property_id = p.id AND t.language = 'en'
                JOIN localities l ON l.id = p.locality_id JOIN property_types pt ON pt.id = p.property_type_id
                LEFT JOIN users u ON u.id = p.owner_user_id WHERE 1 = 1""");
        Map<String, Object> params = new HashMap<>();
        if (!access.has("property.read_all")) { sql.append(" AND (p.owner_user_id = :me OR p.created_by = :me)"); params.put("me", me()); }
        if (status != null && !status.isBlank()) { sql.append(" AND p.status = :st"); params.put("st", status); }
        if (q != null && !q.isBlank()) { sql.append(" AND (t.title ILIKE :q OR l.name_en ILIKE :q OR l.city ILIKE :q)"); params.put("q", "%" + q.trim() + "%"); }
        sql.append(" ORDER BY p.updated_at DESC LIMIT 200");
        return jdbc.sql(sql.toString()).params(params).query((rs, n) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", rs.getObject("id", UUID.class)); m.put("number", rs.getLong("public_number"));
            m.put("status", rs.getString("status")); m.put("availability", rs.getString("availability"));
            m.put("sample", rs.getBoolean("is_sample")); m.put("title", rs.getString("title")); m.put("slug", rs.getString("slug"));
            m.put("city", rs.getString("city")); m.put("locality", rs.getString("locality")); m.put("type", rs.getString("type_name"));
            m.put("price", rs.getBigDecimal("price_amount")); m.put("priceOnRequest", rs.getBoolean("price_on_request"));
            m.put("owner", rs.getString("owner_name")); m.put("photos", rs.getInt("photos")); m.put("approvedPhotos", rs.getInt("approved_photos"));
            m.put("updatedAt", rs.getObject("updated_at", OffsetDateTime.class));
            return m;
        }).list();
    }

    @GetMapping({"/api/v1/staff/properties/{id}", "/internal/v1/staff/properties/{id}"})
    @PreAuthorize("@access.has('property.read_all') or @access.has('property.read_own')")
    Map<String, Object> detail(@PathVariable UUID id) {
        visible(id);
        Map<String, Object> d = jdbc.sql("""
                SELECT p.*, pt.code AS type_code, l.city, l.name_en AS locality_name, u.full_name AS owner_name,
                       ps.id AS submission_id, ld.public_ref AS submission_ref
                FROM properties p JOIN property_types pt ON pt.id = p.property_type_id JOIN localities l ON l.id = p.locality_id
                LEFT JOIN users u ON u.id = p.owner_user_id
                LEFT JOIN property_submissions ps ON ps.property_id = p.id LEFT JOIN leads ld ON ld.id = ps.lead_id
                WHERE p.id = :id""").param("id", id).query((rs, n) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            for (String c : new String[]{"status", "availability", "verification_status", "purpose", "area_unit", "furnishing",
                    "possession_status", "address_line", "rejection_reason", "type_code", "city", "locality_name", "owner_name", "submission_ref"}) {
                m.put(camel(c), rs.getString(c));
            }
            for (String c : new String[]{"price_amount", "built_up_area", "carpet_area", "plot_area", "latitude", "longitude"}) m.put(camel(c), rs.getBigDecimal(c));
            for (String c : new String[]{"bedrooms", "bathrooms", "parking_spaces", "floor_number", "total_floors"}) m.put(camel(c), rs.getObject(c));
            for (String c : new String[]{"price_on_request", "price_negotiable", "hide_exact_location", "is_sample"}) m.put(camel(c), rs.getBoolean(c));
            m.put("id", id); m.put("number", rs.getLong("public_number"));
            m.put("localityId", rs.getObject("locality_id", UUID.class)); m.put("projectId", rs.getObject("project_id", UUID.class));
            m.put("ownerUserId", rs.getObject("owner_user_id", UUID.class)); m.put("submissionId", rs.getObject("submission_id", UUID.class));
            m.put("possessionDate", rs.getObject("possession_date", LocalDate.class));
            m.put("publishedAt", rs.getObject("published_at", OffsetDateTime.class));
            return m;
        }).single();
        for (String lang : new String[]{"en", "hi"}) {
            d.put(lang, jdbc.sql("SELECT title, slug, description FROM property_translations WHERE property_id = :id AND language = :l")
                    .param("id", id).param("l", lang).query((rs, n) -> new Translation(rs.getString(1), rs.getString(2), rs.getString(3))).optional().orElse(null));
        }
        d.put("amenityCodes", jdbc.sql("SELECT a.code FROM property_amenities pa JOIN amenities a ON a.id = pa.amenity_id WHERE pa.property_id = :id ORDER BY a.code")
                .param("id", id).query(String.class).list());
        d.put("media", media.list(MediaLibrary.Target.PROPERTY, id));
        d.put("history", jdbc.sql("""
                SELECT h.from_status, h.to_status, h.note, h.changed_at, u.full_name FROM listing_status_history h
                LEFT JOIN users u ON u.id = h.changed_by WHERE h.property_id = :id ORDER BY h.changed_at DESC LIMIT 50""")
                .param("id", id).query((rs, n) -> {
                    Map<String, Object> h = new LinkedHashMap<>();
                    h.put("from", rs.getString(1)); h.put("to", rs.getString(2)); h.put("note", rs.getString(3));
                    h.put("at", rs.getObject(4, OffsetDateTime.class)); h.put("by", rs.getString(5));
                    return h;
                }).list());
        boolean mine = me().equals(d.get("ownerUserId"));
        d.put("canEdit", EDITABLE.contains((String) d.get("status")) && access.has("property.create"));
        d.put("canSubmit", "draft".equals(d.get("status")) && access.has("property.submit"));
        d.put("canReview", "pending_review".equals(d.get("status")) && access.has("property.review"));
        d.put("canPublish", Set.of("approved", "withdrawn").contains((String) d.get("status")) && access.has("property.publish"));
        d.put("canUnpublish", "published".equals(d.get("status")) && access.has("property.publish"));
        d.put("canApproveMedia", access.has("property.publish"));
        d.put("assignedToMe", mine);
        return d;
    }

    /** Reference lists for the editor: types, localities, amenities, projects, assignable staff. */
    @GetMapping({"/api/v1/staff/properties/options", "/internal/v1/staff/properties/options"})
    @PreAuthorize("@access.has('property.read_all') or @access.has('property.read_own')")
    Map<String, Object> options() {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("types", jdbc.sql("SELECT code, name_en, category FROM property_types WHERE is_active ORDER BY sort_order, name_en")
                .query((rs, n) -> Map.of("code", rs.getString(1), "name", rs.getString(2), "category", rs.getString(3))).list());
        o.put("localities", jdbc.sql("SELECT id, city, name_en, latitude, longitude FROM localities WHERE is_active ORDER BY city, name_en")
                .query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getObject(1, UUID.class)); m.put("city", rs.getString(2)); m.put("name", rs.getString(3));
                    m.put("latitude", rs.getBigDecimal(4)); m.put("longitude", rs.getBigDecimal(5));
                    return m;
                }).list());
        o.put("amenities", jdbc.sql("SELECT code, name_en FROM amenities ORDER BY name_en")
                .query((rs, n) -> Map.of("code", rs.getString(1), "name", rs.getString(2))).list());
        o.put("projects", jdbc.sql("SELECT p.id, t.name FROM projects p JOIN project_translations t ON t.project_id = p.id AND t.language = 'en' ORDER BY t.name")
                .query((rs, n) -> Map.of("id", rs.getObject(1, UUID.class), "name", rs.getString(2))).list());
        o.put("staff", access.has("property.read_all")
                ? jdbc.sql("SELECT id, full_name FROM users WHERE status = 'active' ORDER BY full_name").query((rs, n) -> Map.of("id", rs.getObject(1, UUID.class), "name", rs.getString(2))).list()
                : List.of());
        return o;
    }

    // ---------------- writes ----------------

    @PostMapping({"/api/v1/staff/properties", "/internal/v1/staff/properties"})
    @PreAuthorize("@access.has('property.create')")
    @Transactional
    ResponseEntity<Map<String, Object>> create(@RequestBody PropertyBody b) {
        validate(b, false);
        UUID me = me();
        UUID owner = b.ownerUserId() != null && access.has("property.read_all") ? b.ownerUserId() : me;
        UUID id = jdbc.sql("INSERT INTO properties (property_type_id, locality_id, owner_user_id, created_by, status) "
                        + "VALUES ((SELECT id FROM property_types WHERE code = :t), :l, :o, :me, 'draft') RETURNING id")
                .param("t", b.typeCode()).param("l", b.localityId()).param("o", owner).param("me", me).query(UUID.class).single();
        write(id, b);
        history(id, null, "draft", "Created", me);
        audit(me, "property.created", id);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @PutMapping({"/api/v1/staff/properties/{id}", "/internal/v1/staff/properties/{id}"})
    @PreAuthorize("@access.has('property.create')")
    @Transactional
    Map<String, Object> update(@PathVariable UUID id, @RequestBody PropertyBody b) {
        String status = visible(id);
        if (!EDITABLE.contains(status)) {
            throw new ApiException(HttpStatus.CONFLICT, "not_editable", "Only draft, rejected or withdrawn listings can be edited (status: " + status + ")");
        }
        validate(b, false);
        jdbc.sql("UPDATE properties SET property_type_id = (SELECT id FROM property_types WHERE code = :t), locality_id = :l WHERE id = :id")
                .param("t", b.typeCode()).param("l", b.localityId()).param("id", id).update();
        if (b.ownerUserId() != null && access.has("property.read_all")) {
            jdbc.sql("UPDATE properties SET owner_user_id = :o WHERE id = :id").param("o", b.ownerUserId()).param("id", id).update();
        }
        write(id, b);
        if (!"draft".equals(status)) setStatus(id, status, "draft", "Edited: back to draft");
        audit(me(), "property.updated", id);
        return detail(id);
    }

    @PostMapping({"/api/v1/staff/properties/{id}/submit", "/internal/v1/staff/properties/{id}/submit"})
    @PreAuthorize("@access.has('property.submit')")
    @Transactional
    Map<String, Object> submit(@PathVariable UUID id) {
        String status = visible(id);
        if (!"draft".equals(status)) throw new ApiException(HttpStatus.CONFLICT, "not_draft", "Only a draft can be submitted for review");
        List<String> missing = new ArrayList<>();
        var p = jdbc.sql("SELECT price_amount, price_on_request, built_up_area, carpet_area, plot_area FROM properties WHERE id = :id")
                .param("id", id).query((rs, n) -> new Object[]{rs.getBigDecimal(1), rs.getBoolean(2), rs.getBigDecimal(3), rs.getBigDecimal(4), rs.getBigDecimal(5)}).single();
        if (p[0] == null && !(Boolean) p[1]) missing.add("price (or price on request)");
        if (p[2] == null && p[3] == null && p[4] == null) missing.add("area");
        var en = jdbc.sql("SELECT title, slug, description FROM property_translations WHERE property_id = :id AND language = 'en'")
                .param("id", id).query((rs, n) -> new String[]{rs.getString(1), rs.getString(2), rs.getString(3)}).optional();
        if (en.isEmpty() || en.get()[2] == null || en.get()[2].trim().length() < 40) missing.add("English description (at least 40 characters)");
        if (!missing.isEmpty()) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "incomplete", "Missing: " + String.join(", ", missing));
        jdbc.sql("UPDATE properties SET submitted_at = now() WHERE id = :id").param("id", id).update();
        setStatus(id, status, "pending_review", "Submitted for review");
        return detail(id);
    }

    @PostMapping({"/api/v1/staff/properties/{id}/review", "/internal/v1/staff/properties/{id}/review"})
    @PreAuthorize("@access.has('property.review')")
    @Transactional
    Map<String, Object> review(@PathVariable UUID id, @RequestBody StatusBody b) {
        String status = visible(id);
        if (!"pending_review".equals(status)) throw new ApiException(HttpStatus.CONFLICT, "not_pending", "This listing is not waiting for review");
        String decision = b == null ? null : b.decision();
        String note = b == null || b.note() == null || b.note().isBlank() ? null : b.note().trim();
        if ("rejected".equals(decision) && note == null) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "reason_required", "Give a reason for rejecting");
        if (!"approved".equals(decision) && !"rejected".equals(decision)) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validation_failed", "Choose approve or reject");
        jdbc.sql("UPDATE properties SET reviewed_by = :me, reviewed_at = now(), rejection_reason = :r WHERE id = :id")
                .param("me", me()).param("r", "rejected".equals(decision) ? note : null).param("id", id).update();
        setStatus(id, status, decision, note);
        return detail(id);
    }

    /** publish | unpublish | sold. Publishing never requires photos: listings without approved photos show a placeholder. */
    @PostMapping({"/api/v1/staff/properties/{id}/{action:publish|unpublish|sold}", "/internal/v1/staff/properties/{id}/{action:publish|unpublish|sold}"})
    @PreAuthorize("@access.has('property.publish')")
    @Transactional
    Map<String, Object> publication(@PathVariable UUID id, @PathVariable String action) {
        String status = visible(id);
        switch (action) {
            case "publish" -> {
                if (!Set.of("approved", "withdrawn").contains(status)) throw new ApiException(HttpStatus.CONFLICT, "not_approved", "Only an approved listing can be published");
                jdbc.sql("UPDATE properties SET published_at = coalesce(published_at, now()), availability_confirmed_at = now(), "
                        + "availability = CASE WHEN availability IN ('sold','withdrawn') THEN 'available' ELSE availability END WHERE id = :id").param("id", id).update();
                setStatus(id, status, "published", null);
            }
            case "unpublish" -> {
                if (!"published".equals(status)) throw new ApiException(HttpStatus.CONFLICT, "not_published", "The listing is not published");
                setStatus(id, status, "withdrawn", null);
            }
            default -> {
                if (!"published".equals(status)) throw new ApiException(HttpStatus.CONFLICT, "not_published", "The listing is not published");
                jdbc.sql("UPDATE properties SET availability = 'sold' WHERE id = :id").param("id", id).update();
                setStatus(id, status, "sold", null);
            }
        }
        return detail(id);
    }

    // ---------------- photographs ----------------

    @PostMapping(value = {"/api/v1/staff/properties/{id}/media", "/internal/v1/staff/properties/{id}/media"}, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("@access.has('property.create') or @access.has('property.publish')")
    @Transactional
    ResponseEntity<Map<String, Object>> upload(@PathVariable UUID id, @RequestParam("file") MultipartFile file,
                                               @RequestParam(required = false) String kind, @RequestParam(required = false) String captionEn,
                                               @RequestParam(required = false) String captionHi, @RequestParam(required = false) String altEn,
                                               @RequestParam(required = false) String altHi, @RequestParam(required = false) String credit,
                                               @RequestParam(required = false) String licence) throws java.io.IOException {
        visible(id);
        UUID mid = media.upload(MediaLibrary.Target.PROPERTY, id, file.getBytes(),
                new MediaLibrary.Meta(kind, captionEn, captionHi, altEn, altHi, credit, licence, null), me(), null);
        audit(me(), "property.media.uploaded", id);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", mid));
    }

    @PutMapping({"/api/v1/staff/properties/{id}/media/{mid}", "/internal/v1/staff/properties/{id}/media/{mid}"})
    @PreAuthorize("@access.has('property.create') or @access.has('property.publish')")
    @Transactional
    Map<String, Object> updateMedia(@PathVariable UUID id, @PathVariable UUID mid, @RequestBody MediaLibrary.Meta meta) {
        visible(id);
        media.update(MediaLibrary.Target.PROPERTY, id, mid, meta);
        return detail(id);
    }

    @PostMapping({"/api/v1/staff/properties/{id}/media/{mid}/{action:approve|unapprove|primary}",
                  "/internal/v1/staff/properties/{id}/media/{mid}/{action:approve|unapprove|primary}"})
    @PreAuthorize("@access.has('property.publish')")
    @Transactional
    Map<String, Object> mediaAction(@PathVariable UUID id, @PathVariable UUID mid, @PathVariable String action) {
        visible(id);
        switch (action) {
            case "approve" -> media.approve(MediaLibrary.Target.PROPERTY, id, mid, me());
            case "unapprove" -> media.unapprove(MediaLibrary.Target.PROPERTY, id, mid);
            default -> media.primary(MediaLibrary.Target.PROPERTY, id, mid);
        }
        audit(me(), "property.media." + action, id);
        return detail(id);
    }

    @DeleteMapping({"/api/v1/staff/properties/{id}/media/{mid}", "/internal/v1/staff/properties/{id}/media/{mid}"})
    @PreAuthorize("@access.has('property.create') or @access.has('property.publish')")
    @Transactional
    ResponseEntity<Void> deleteMedia(@PathVariable UUID id, @PathVariable UUID mid) {
        visible(id);
        media.delete(MediaLibrary.Target.PROPERTY, id, mid);
        audit(me(), "property.media.deleted", id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping({"/api/v1/staff/properties/{id}/media/{mid}/file", "/internal/v1/staff/properties/{id}/media/{mid}/file"})
    @PreAuthorize("@access.has('property.read_all') or @access.has('property.read_own')")
    ResponseEntity<byte[]> mediaFile(@PathVariable UUID id, @PathVariable UUID mid) {
        visible(id);
        Object[] f = media.original(MediaLibrary.Target.PROPERTY, id, mid);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType((String) f[1]))
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store").header("X-Content-Type-Options", "nosniff").body((byte[]) f[0]);
    }

    record Position(BigDecimal latitude, BigDecimal longitude) {}

    /** Approximate (area-level) map position of a locality, used for "approximate area" maps. Never a listing's address. */
    @PutMapping({"/api/v1/staff/localities/{id}/position", "/internal/v1/staff/localities/{id}/position"})
    @PreAuthorize("@access.has('property.publish')")
    @Transactional
    ResponseEntity<Void> localityPosition(@PathVariable UUID id, @RequestBody Position b) {
        if (b == null || (b.latitude() == null) != (b.longitude() == null)) throw bad("Give both latitude and longitude, or neither");
        if (b.latitude() != null && (b.latitude().abs().compareTo(BigDecimal.valueOf(90)) > 0 || b.longitude().abs().compareTo(BigDecimal.valueOf(180)) > 0)) throw bad("Invalid position");
        int n = jdbc.sql("UPDATE localities SET latitude = :lat, longitude = :lon WHERE id = :id").param("lat", b.latitude()).param("lon", b.longitude()).param("id", id).update();
        if (n == 0) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Locality not found");
        jdbc.sql("INSERT INTO audit_logs (actor_user_id, actor_label, action, entity_type, entity_id) VALUES (:me, 'staff', 'locality.position', 'locality', :id)")
                .param("me", me()).param("id", id.toString()).update();
        return ResponseEntity.noContent().build();
    }

    // ---------------- owner submission -> draft listing ----------------

    record ConvertBody(UUID localityId, List<UUID> fileIds) {}

    /**
     * Director action on an APPROVED owner submission: creates ONE draft listing (a second call returns 409 with the
     * existing listing), copies the submission data and only the selected photos that passed a clean scan (they arrive
     * unapproved and stay private until approved on the listing). The draft then follows the normal review workflow;
     * nothing is published here.
     */
    @PostMapping({"/api/v1/staff/submissions/{id}/create-listing", "/internal/v1/staff/submissions/{id}/create-listing"})
    @PreAuthorize("@access.has('property.publish')")
    @Transactional
    ResponseEntity<Map<String, Object>> createFromSubmission(@PathVariable UUID id, @RequestBody ConvertBody b) {
        var s = jdbc.sql("""
                SELECT s.status, s.property_id, s.city, s.locality, s.property_type_code, s.purpose, s.expected_price, s.area_value, s.area_unit,
                       s.message, l.public_ref, l.assigned_user_id, pt.name_en AS type_name
                FROM property_submissions s JOIN leads l ON l.id = s.lead_id JOIN property_types pt ON pt.code = s.property_type_code
                WHERE s.id = :id FOR UPDATE OF s""").param("id", id).query((rs, n) -> {
            Map<String, Object> m = new HashMap<>();
            for (String c : new String[]{"status", "city", "locality", "property_type_code", "purpose", "area_unit", "message", "public_ref", "type_name"}) m.put(c, rs.getString(c));
            m.put("property_id", rs.getObject("property_id", UUID.class));
            m.put("assigned", rs.getObject("assigned_user_id", UUID.class));
            m.put("price", rs.getBigDecimal("expected_price")); m.put("area", rs.getBigDecimal("area_value"));
            return m;
        }).optional().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Submission not found"));
        if (s.get("property_id") != null) {
            throw new ApiException(HttpStatus.CONFLICT, "already_converted", "A draft listing already exists for this submission: " + s.get("property_id"));
        }
        if (!"approved".equals(s.get("status"))) throw new ApiException(HttpStatus.CONFLICT, "not_approved", "Only an approved submission can become a draft listing");
        if (b == null || b.localityId() == null) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validation_failed", "Choose the locality");
        String locality = jdbc.sql("SELECT name_en || ', ' || city FROM localities WHERE id = :l AND is_active").param("l", b.localityId())
                .query(String.class).optional().orElseThrow(() -> new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validation_failed", "Unknown locality"));
        UUID me = me();
        UUID owner = s.get("assigned") != null ? (UUID) s.get("assigned") : me;
        BigDecimal area = (BigDecimal) s.get("area");
        String unit = s.get("area_unit") == null ? "sq_ft" : (String) s.get("area_unit");
        boolean plot = "plot".equals(s.get("property_type_code"));
        UUID pid = jdbc.sql("""
                INSERT INTO properties (property_type_id, locality_id, purpose, status, price_amount, price_on_request, area_unit,
                                        built_up_area, plot_area, owner_user_id, created_by)
                VALUES ((SELECT id FROM property_types WHERE code = :t), :l, :purpose, 'draft', :price, :por, :unit, :bua, :plot, :o, :me)
                RETURNING id""")
                .param("t", s.get("property_type_code")).param("l", b.localityId()).param("purpose", s.get("purpose"))
                .param("price", s.get("price")).param("por", s.get("price") == null).param("unit", unit)
                .param("bua", plot ? null : area).param("plot", plot ? area : null).param("o", owner).param("me", me).query(UUID.class).single();
        String title = s.get("type_name") + " in " + locality;
        String slug = slugify(title) + "-" + pid.toString().substring(0, 8);
        jdbc.sql("INSERT INTO property_translations (property_id, language, title, slug, description) VALUES (:p, 'en', :t, :s, :d)")
                .param("p", pid).param("t", title.length() > 200 ? title.substring(0, 200) : title).param("s", slug)
                .param("d", s.get("message")).update();
        int copied = 0;
        List<UUID> wanted = b.fileIds() == null ? List.of() : b.fileIds();
        for (UUID fid : wanted) {
            var f = jdbc.sql("SELECT storage_key, scan_status, original_name FROM property_submission_files WHERE id = :f AND submission_id = :s")
                    .param("f", fid).param("s", id).query((rs, n) -> new String[]{rs.getString(1), rs.getString(2), rs.getString(3)}).optional()
                    .orElseThrow(() -> new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validation_failed", "Unknown photo"));
            if (!"clean".equals(f[1])) {
                throw new ApiException(HttpStatus.CONFLICT, "not_scanned", "Photo '" + f[2] + "' has no clean malware scan (" + f[1] + ") and cannot be carried over");
            }
            media.upload(MediaLibrary.Target.PROPERTY, pid, privateStore.load(f[0]),
                    new MediaLibrary.Meta("actual_photo", null, null, null, null, "Owner-supplied (" + s.get("public_ref") + ")", "Owner consent recorded with the submission", null),
                    me, fid);
            copied++;
        }
        jdbc.sql("UPDATE property_submissions SET property_id = :p, converted_by = :me, converted_at = now() WHERE id = :id")
                .param("p", pid).param("me", me).param("id", id).update();
        history(pid, null, "draft", "Created from owner submission " + s.get("public_ref"), me);
        audit(me, "submission.converted", id);
        audit(me, "property.created", pid);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("propertyId", pid, "photos", copied));
    }

    // ---------------- helpers ----------------

    private void validate(PropertyBody b, boolean partial) {
        if (b == null) throw bad("Missing data");
        if (b.typeCode() == null || jdbc.sql("SELECT count(*) FROM property_types WHERE code = :c").param("c", b.typeCode()).query(Integer.class).single() == 0) throw bad("Choose a property type");
        if (b.localityId() == null || jdbc.sql("SELECT count(*) FROM localities WHERE id = :l").param("l", b.localityId()).query(Integer.class).single() == 0) throw bad("Choose a locality");
        if (b.purpose() != null && !Set.of("sale", "rent").contains(b.purpose())) throw bad("Purpose must be sale or rent");
        if (b.areaUnit() != null && !Set.of("sq_ft", "sq_yd", "sq_m", "acre").contains(b.areaUnit())) throw bad("Unknown area unit");
        if (b.furnishing() != null && !b.furnishing().isBlank() && !Set.of("unfurnished", "semi_furnished", "furnished").contains(b.furnishing())) throw bad("Unknown furnishing");
        if (b.possessionStatus() != null && !b.possessionStatus().isBlank() && !Set.of("ready_to_move", "under_construction", "upcoming").contains(b.possessionStatus())) throw bad("Unknown possession status");
        if (b.priceAmount() != null && b.priceAmount().signum() <= 0) throw bad("Price must be positive");
        if ((b.latitude() == null) != (b.longitude() == null)) throw bad("Give both latitude and longitude, or neither");
        if (b.en() == null || b.en().title() == null || b.en().title().isBlank() || b.en().title().length() > 200) throw bad("English title is required (max 200)");
        if (b.en().slug() == null || !b.en().slug().matches("[a-z0-9]+(-[a-z0-9]+)*") || b.en().slug().length() > 200) throw bad("URL slug: lowercase letters, numbers and hyphens");
        if (b.hi() != null && b.hi().title() != null && !b.hi().title().isBlank()
                && (b.hi().slug() == null || !b.hi().slug().matches("[a-z0-9]+(-[a-z0-9]+)*"))) throw bad("Hindi URL slug: lowercase letters, numbers and hyphens");
    }

    private void write(UUID id, PropertyBody b) {
        jdbc.sql("""
                UPDATE properties SET purpose = coalesce(:purpose, purpose), price_amount = :price, price_on_request = :por, price_negotiable = :neg,
                       area_unit = coalesce(:unit, area_unit), built_up_area = :bua, carpet_area = :ca, plot_area = :pa, bedrooms = :bed,
                       bathrooms = :bath, parking_spaces = :park, furnishing = :fur, possession_status = :pos, possession_date = :pd,
                       floor_number = :fl, total_floors = :tf, address_line = :addr, latitude = :lat, longitude = :lon,
                       hide_exact_location = :hide, project_id = :proj
                WHERE id = :id""")
                .param("purpose", b.purpose()).param("price", b.priceAmount()).param("por", Boolean.TRUE.equals(b.priceOnRequest()))
                .param("neg", Boolean.TRUE.equals(b.priceNegotiable())).param("unit", b.areaUnit()).param("bua", b.builtUpArea())
                .param("ca", b.carpetArea()).param("pa", b.plotArea()).param("bed", b.bedrooms()).param("bath", b.bathrooms())
                .param("park", b.parkingSpaces()).param("fur", blank(b.furnishing())).param("pos", blank(b.possessionStatus()))
                .param("pd", b.possessionDate()).param("fl", b.floorNumber()).param("tf", b.totalFloors()).param("addr", blank(b.addressLine()))
                .param("lat", b.latitude()).param("lon", b.longitude()).param("hide", !Boolean.FALSE.equals(b.hideExactLocation()))
                .param("proj", b.projectId()).param("id", id).update();
        try {
            upsertTranslation(id, "en", b.en());
            if (b.hi() != null && b.hi().title() != null && !b.hi().title().isBlank()) upsertTranslation(id, "hi", b.hi());
            else jdbc.sql("DELETE FROM property_translations WHERE property_id = :id AND language = 'hi'").param("id", id).update();
        } catch (DuplicateKeyException e) {
            throw new ApiException(HttpStatus.CONFLICT, "slug_taken", "This URL slug is already used by another listing");
        }
        jdbc.sql("DELETE FROM property_amenities WHERE property_id = :id").param("id", id).update();
        if (b.amenityCodes() != null && !b.amenityCodes().isEmpty()) {
            jdbc.sql("INSERT INTO property_amenities (property_id, amenity_id) SELECT :id, id FROM amenities WHERE code IN (:codes)")
                    .param("id", id).param("codes", b.amenityCodes()).update();
        }
    }

    private void upsertTranslation(UUID id, String lang, Translation t) {
        jdbc.sql("""
                INSERT INTO property_translations (property_id, language, title, slug, description) VALUES (:id, :l, :t, :s, :d)
                ON CONFLICT (property_id, language) DO UPDATE SET title = EXCLUDED.title, slug = EXCLUDED.slug, description = EXCLUDED.description""")
                .param("id", id).param("l", lang).param("t", t.title().trim()).param("s", t.slug()).param("d", blank(t.description())).update();
    }

    /** Returns the status; 404 when the listing does not exist or is outside the caller's assignment. */
    private String visible(UUID id) {
        var q = jdbc.sql("SELECT status FROM properties WHERE id = :id" + (access.has("property.read_all") ? "" : " AND (owner_user_id = :me OR created_by = :me)"))
                .param("id", id);
        if (!access.has("property.read_all")) q = q.param("me", me());
        return q.query(String.class).optional().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Listing not found"));
    }

    private void setStatus(UUID id, String from, String to, String note) {
        jdbc.sql("UPDATE properties SET status = :s WHERE id = :id").param("s", to).param("id", id).update();
        history(id, from, to, note, me());
        audit(me(), "property.status." + to, id);
    }

    private void history(UUID id, String from, String to, String note, UUID me) {
        jdbc.sql("INSERT INTO listing_status_history (property_id, from_status, to_status, note, changed_by) VALUES (:id, :f, :t, :n, :me)")
                .param("id", id).param("f", from).param("t", to).param("n", note).param("me", me).update();
    }

    private void audit(UUID me, String action, UUID entity) {
        jdbc.sql("INSERT INTO audit_logs (actor_user_id, actor_label, action, entity_type, entity_id) VALUES (:me, 'staff', :a, 'property', :id)")
                .param("me", me).param("a", action).param("id", entity.toString()).update();
    }

    private UUID me() {
        return access.currentUserId().orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Not permitted"));
    }

    static String slugify(String s) {
        String v = java.text.Normalizer.normalize(s.toLowerCase(), java.text.Normalizer.Form.NFKD).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        return v.isEmpty() ? "listing" : (v.length() > 150 ? v.substring(0, 150).replaceAll("-$", "") : v);
    }

    private static String camel(String c) {
        StringBuilder out = new StringBuilder();
        boolean up = false;
        for (char ch : c.toCharArray()) {
            if (ch == '_') { up = true; continue; }
            out.append(up ? Character.toUpperCase(ch) : ch);
            up = false;
        }
        return out.toString();
    }

    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }

    private static ApiException bad(String msg) { return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validation_failed", msg); }
}
