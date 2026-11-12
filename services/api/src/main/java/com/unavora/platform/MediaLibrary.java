package com.unavora.platform;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Photographs of one listing or one project: upload -> malware scan -> private original (quarantine) -> staff
 * approval -> public copy. Shared by listings (property_media) and projects (project_media).
 * Rules: only a CLEAN scan can be approved (also a DB CHECK); approval needs alt text; the public copy gets a new
 * random key; un-approving or deleting removes the public copy. Representative stock is not accepted here at all
 * (kind is actual_photo, render or floor_plan).
 */
@Service
public class MediaLibrary {
    public static final Set<String> KINDS = Set.of("actual_photo", "render", "floor_plan");
    /** Site library: brand assets, licensed representative stock (always labelled), editorial covers, partner logos. */
    public static final Set<String> SITE_KINDS = Set.of("representative", "brand", "editorial", "logo", "actual_photo", "render");
    public static final UUID SITE_LIBRARY = UUID.fromString("00000000-0000-0000-0000-0000000000c0");
    static final int MAX_PER_ITEM = 40;

    /** Which table/owner column to use. */
    public enum Target {
        PROPERTY("property_media", "property_id", KINDS), PROJECT("project_media", "project_id", KINDS),
        SITE("site_media", "library_id", SITE_KINDS);
        final String table, owner;
        final Set<String> kinds;
        Target(String table, String owner, Set<String> kinds) { this.table = table; this.owner = owner; this.kinds = kinds; }
    }

    public record Meta(String kind, String captionEn, String captionHi, String altEn, String altHi, String credit, String licence, Integer sortOrder) {}

    private final JdbcClient jdbc;
    private final PrivateFileStore privateStore;
    private final PublicMediaStore publicStore;
    private final MalwareScanner scanner;

    MediaLibrary(JdbcClient jdbc, PrivateFileStore privateStore, PublicMediaStore publicStore, MalwareScanner scanner) {
        this.jdbc = jdbc;
        this.privateStore = privateStore;
        this.publicStore = publicStore;
        this.scanner = scanner;
    }

    public List<Map<String, Object>> list(Target t, UUID ownerId) {
        return jdbc.sql("SELECT id, media_type, kind, caption_en, caption_hi, alt_en, alt_hi, credit, licence, sort_order, is_primary, is_public,"
                        + " processing_status, scan_status, scanner, scanned_at, approved_at, content_type, size_bytes FROM " + t.table
                        + " WHERE " + t.owner + " = :o ORDER BY is_primary DESC, sort_order, created_at")
                .param("o", ownerId).query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getObject("id", UUID.class));
                    m.put("kind", rs.getString("kind"));
                    m.put("captionEn", rs.getString("caption_en")); m.put("captionHi", rs.getString("caption_hi"));
                    m.put("altEn", rs.getString("alt_en")); m.put("altHi", rs.getString("alt_hi"));
                    m.put("credit", rs.getString("credit")); m.put("licence", rs.getString("licence"));
                    m.put("sortOrder", rs.getInt("sort_order")); m.put("primary", rs.getBoolean("is_primary"));
                    m.put("public", rs.getBoolean("is_public")); m.put("scanStatus", rs.getString("scan_status"));
                    m.put("scanner", rs.getString("scanner")); m.put("approvedAt", rs.getObject("approved_at", OffsetDateTime.class));
                    m.put("sizeBytes", rs.getObject("size_bytes"));
                    return m;
                }).list();
    }

    /** Stores the original privately after scanning. Infected files are refused and never stored. */
    public UUID upload(Target t, UUID ownerId, byte[] bytes, Meta meta, UUID me, UUID sourceSubmissionFile) {
        String kind = kindOf(t, meta);
        int count = jdbc.sql("SELECT count(*) FROM " + t.table + " WHERE " + t.owner + " = :o").param("o", ownerId).query(Integer.class).single();
        if (count >= MAX_PER_ITEM) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "too_many_files", "Up to " + MAX_PER_ITEM + " photos");
        MalwareScanner.Result verdict = scanner.scan(bytes);
        if (verdict.infected()) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "file_rejected", "The file was rejected by the security scan");
        var stored = privateStore.store(bytes);   // validates type (magic bytes) and size
        try {
            return jdbc.sql("INSERT INTO " + t.table + " (" + t.owner + ", storage_key, original_key, media_type, kind, caption_en, caption_hi, alt_en, alt_hi,"
                            + " credit, licence, sort_order, is_public, processing_status, content_type, size_bytes, sha256, scan_status, scanned_at, scanner, uploaded_by"
                            + (t == Target.PROPERTY ? ", source_submission_file_id" : "") + ")"
                            + " VALUES (:o, :k, :k, :mt, :kind, :ce, :ch, :ae, :ah, :cr, :li, coalesce(:so, :next), false, :ps, :ct, :sz, :sha, :scan,"
                            + " CASE WHEN :scan = 'not_scanned' THEN NULL ELSE now() END, :scanner, :me"
                            + (t == Target.PROPERTY ? ", :src" : "") + ") RETURNING id")
                    .param("o", ownerId).param("k", stored.key()).param("mt", "floor_plan".equals(kind) ? "floorplan" : "image").param("kind", kind)
                    .param("ce", trim(meta.captionEn(), 250)).param("ch", trim(meta.captionHi(), 250)).param("ae", trim(meta.altEn(), 250))
                    .param("ah", trim(meta.altHi(), 250)).param("cr", trim(meta.credit(), 200)).param("li", trim(meta.licence(), 200))
                    .param("so", meta.sortOrder()).param("next", count)
                    .param("ps", verdict.clean() ? "ready" : "pending").param("ct", stored.contentType()).param("sz", stored.size())
                    .param("sha", stored.sha256()).param("scan", verdict.status()).param("scanner", verdict.scanner()).param("me", me)
                    .param("src", sourceSubmissionFile)
                    .query(UUID.class).single();
        } catch (RuntimeException e) {
            privateStore.delete(stored.key());
            throw e;
        }
    }

    public void update(Target t, UUID ownerId, UUID mediaId, Meta meta) {
        String kind = kindOf(t, meta);
        int n = jdbc.sql("UPDATE " + t.table + " SET kind = :kind, media_type = :mt, caption_en = :ce, caption_hi = :ch, alt_en = :ae, alt_hi = :ah,"
                        + " credit = :cr, licence = :li, sort_order = coalesce(:so, sort_order) WHERE id = :id AND " + t.owner + " = :o")
                .param("kind", kind).param("mt", "floor_plan".equals(kind) ? "floorplan" : "image")
                .param("ce", trim(meta.captionEn(), 250)).param("ch", trim(meta.captionHi(), 250)).param("ae", trim(meta.altEn(), 250))
                .param("ah", trim(meta.altHi(), 250)).param("cr", trim(meta.credit(), 200)).param("li", trim(meta.licence(), 200))
                .param("so", meta.sortOrder()).param("id", mediaId).param("o", ownerId).update();
        if (n == 0) throw notFound();
    }

    /** Director approval: clean scan + alt text required; a public copy is written under a new key. */
    public void approve(Target t, UUID ownerId, UUID mediaId, UUID me) {
        var row = jdbc.sql("SELECT original_key, scan_status, alt_en, content_type, approved_at, kind, licence FROM " + t.table + " WHERE id = :id AND " + t.owner + " = :o")
                .param("id", mediaId).param("o", ownerId)
                .query((rs, n) -> new String[]{rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getString(6), rs.getString(7)}).optional()
                .orElseThrow(MediaLibrary::notFound);
        if (Set.of("representative", "editorial").contains(row[5]) && (row[6] == null || row[6].isBlank())) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "licence_required", "Record the licence or permission for this image first");
        }
        if (row[4] != null) return;   // already approved
        if (!"clean".equals(row[1])) {
            throw new ApiException(HttpStatus.CONFLICT, "not_scanned", "Only files with a clean malware scan can be approved (status: " + row[1] + ")");
        }
        if (row[2] == null || row[2].isBlank()) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "alt_required", "Add a description (alt text) first");
        String publicKey = publicStore.publish(privateStore.load(row[0]), row[3]);
        jdbc.sql("UPDATE " + t.table + " SET storage_key = :pk, is_public = true, processing_status = 'ready', approved_by = :me, approved_at = now() WHERE id = :id")
                .param("pk", publicKey).param("me", me).param("id", mediaId).update();
    }

    public void unapprove(Target t, UUID ownerId, UUID mediaId) {
        var keys = jdbc.sql("SELECT storage_key, original_key FROM " + t.table + " WHERE id = :id AND " + t.owner + " = :o AND approved_at IS NOT NULL")
                .param("id", mediaId).param("o", ownerId).query((rs, n) -> new String[]{rs.getString(1), rs.getString(2)}).optional();
        if (keys.isEmpty()) return;
        jdbc.sql("UPDATE " + t.table + " SET storage_key = original_key, is_public = false, approved_by = NULL, approved_at = NULL WHERE id = :id")
                .param("id", mediaId).update();
        if (!keys.get()[0].equals(keys.get()[1])) publicStore.delete(keys.get()[0]);
    }

    public void primary(Target t, UUID ownerId, UUID mediaId) {
        int exists = jdbc.sql("SELECT count(*) FROM " + t.table + " WHERE id = :id AND " + t.owner + " = :o AND media_type = 'image'")
                .param("id", mediaId).param("o", ownerId).query(Integer.class).single();
        if (exists == 0) throw notFound();
        jdbc.sql("UPDATE " + t.table + " SET is_primary = false WHERE " + t.owner + " = :o AND is_primary").param("o", ownerId).update();
        jdbc.sql("UPDATE " + t.table + " SET is_primary = true WHERE id = :id").param("id", mediaId).update();
    }

    public void delete(Target t, UUID ownerId, UUID mediaId) {
        var keys = jdbc.sql("DELETE FROM " + t.table + " WHERE id = :id AND " + t.owner + " = :o RETURNING storage_key, original_key")
                .param("id", mediaId).param("o", ownerId).query((rs, n) -> new String[]{rs.getString(1), rs.getString(2)}).optional()
                .orElseThrow(MediaLibrary::notFound);
        if (keys[1] != null) privateStore.delete(keys[1]);
        if (!keys[0].equals(keys[1])) publicStore.delete(keys[0]);
    }

    /** Private original for staff preview. Returns {bytes, contentType}. */
    public Object[] original(Target t, UUID ownerId, UUID mediaId) {
        var row = jdbc.sql("SELECT original_key, content_type FROM " + t.table + " WHERE id = :id AND " + t.owner + " = :o")
                .param("id", mediaId).param("o", ownerId).query((rs, n) -> new String[]{rs.getString(1), rs.getString(2)}).optional()
                .orElseThrow(MediaLibrary::notFound);
        return new Object[]{privateStore.load(row[0]), row[1]};
    }

    private static String kindOf(Target t, Meta meta) {
        String kind = meta == null || meta.kind() == null || meta.kind().isBlank() ? (t == Target.SITE ? "" : "actual_photo") : meta.kind();
        if (!t.kinds.contains(kind)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validation_failed",
                    t == Target.SITE ? "Choose what the image is (representative, brand, editorial, logo, photograph or render)" : "Kind must be photograph, render or floor plan");
        }
        return kind;
    }

    private static String trim(String s, int max) {
        if (s == null || s.isBlank()) return null;
        String v = s.trim();
        if (v.length() > max) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validation_failed", "Text is too long (" + max + ")");
        return v;
    }

    private static ApiException notFound() { return new ApiException(HttpStatus.NOT_FOUND, "not_found", "Photo not found"); }
}
