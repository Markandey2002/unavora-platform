package com.unavora.crm.internal;

import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * The single write path for new leads and consents (website enquiry, signed-in customer request). Callers own the
 * transaction. Lead, stage history, assignment, timeline entry, audit row and outbox event are written together.
 */
@Component
class LeadWriter {
    /** Placeholder until the real privacy notice is approved (see PENDING_BUSINESS_CONFIRMATIONS.md). */
    static final String NOTICE_VERSION = "privacy-notice-DRAFT-0";

    record LeadDraft(UUID customerId, String sourceCode, UUID propertyId, String enquiryType, String message,
                     UUID assignee, int priority, UUID idempotencyKey, java.time.OffsetDateTime nextActionAt,
                     String nextActionNote, String timelineSummary, String actorLabel, String ipHash) {}

    record LeadCreated(UUID id, String reference) {}

    private final JdbcClient jdbc;

    LeadWriter(JdbcClient jdbc) { this.jdbc = jdbc; }

    /**
     * Consents are append-only history rows. Enquiry (service) consent and marketing consent are separate purposes:
     * service_contact = may contact me about THIS request; marketing_whatsapp = may send me offers/updates.
     */
    void recordConsent(UUID customerId, String purpose, boolean granted, String source) {
        jdbc.sql("""
                INSERT INTO customer_consents (customer_id, purpose, granted, notice_version, source)
                VALUES (:c, :p, :g, :v, :s)""")
                .param("c", customerId).param("p", purpose).param("g", granted).param("v", NOTICE_VERSION).param("s", source)
                .update();
        if (purpose.startsWith("marketing")) {
            jdbc.sql("""
                    INSERT INTO lead_activities (customer_id, activity_type, summary)
                    VALUES (:c, 'consent_changed', :s)""")
                    .param("c", customerId).param("s", "Marketing consent (" + purpose + ") " + (granted ? "granted" : "declined"))
                    .update();
        }
    }

    LeadCreated create(LeadDraft d) {
        String stageCode = d.assignee() != null ? "assigned" : "new";
        var row = jdbc.sql("""
                INSERT INTO leads (public_ref, customer_id, source_id, interested_property_id, enquiry_type, message,
                                   stage_id, assigned_user_id, priority_score, idempotency_key, next_action_at, next_action_note)
                VALUES ('LEAD-' || lpad(nextval('lead_ref_seq')::text, 6, '0'), :c,
                        (SELECT id FROM lead_sources WHERE code = :src), :prop, :type, :msg,
                        (SELECT id FROM pipeline_stages WHERE code = :stage), :assignee, :prio, :idem, :nextAt, :nextNote)
                RETURNING id, public_ref, stage_id""")
                .param("c", d.customerId()).param("src", d.sourceCode()).param("prop", d.propertyId())
                .param("type", d.enquiryType()).param("msg", d.message())
                .param("stage", stageCode).param("assignee", d.assignee()).param("prio", d.priority())
                .param("idem", d.idempotencyKey()).param("nextAt", d.nextActionAt()).param("nextNote", d.nextActionNote())
                .query((rs, n) -> new Object[]{rs.getObject("id", UUID.class), rs.getString("public_ref"), rs.getObject("stage_id", UUID.class)})
                .single();
        UUID leadId = (UUID) row[0];
        String ref = (String) row[1];

        jdbc.sql("INSERT INTO lead_stage_history (lead_id, to_stage_id, changed_by, reason) VALUES (:l, :s, NULL, :r)")
                .param("l", leadId).param("s", row[2]).param("r", "Created from " + d.sourceCode()).update();
        if (d.assignee() != null) {
            jdbc.sql("INSERT INTO lead_assignments (lead_id, assigned_to, method, reason) VALUES (:l, :u, 'auto_property_owner', 'Property owner')")
                    .param("l", leadId).param("u", d.assignee()).update();
        }
        jdbc.sql("""
                INSERT INTO lead_activities (customer_id, lead_id, activity_type, summary, ref_type, ref_id)
                VALUES (:c, :l, 'enquiry_received', :s, 'lead', :ref)""")
                .param("c", d.customerId()).param("l", leadId).param("s", d.timelineSummary()).param("ref", ref).update();
        jdbc.sql("""
                INSERT INTO audit_logs (actor_label, action, entity_type, entity_id, ip_hash)
                VALUES (:actor, 'lead.created_public', 'lead', :id, :ip)""")
                .param("actor", d.actorLabel()).param("id", leadId.toString()).param("ip", d.ipHash()).update();
        // Outbox payload carries identifiers only, never personal data.
        jdbc.sql("""
                INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload_json, dedupe_key)
                VALUES ('lead', :id, 'lead.created', :payload, :dedupe)""")
                .param("id", leadId.toString())
                .param("payload", "{\"leadId\":\"" + leadId + "\",\"customerId\":\"" + d.customerId() + "\"}")
                .param("dedupe", "lead.created:" + leadId).update();
        return new LeadCreated(leadId, ref);
    }
}
