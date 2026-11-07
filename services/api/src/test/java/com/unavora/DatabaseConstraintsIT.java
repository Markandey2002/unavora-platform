package com.unavora;

import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Business rules that must hold even if application code is wrong: they live in the database. */
class DatabaseConstraintsIT extends IntegrationTestBase {
    @Autowired JdbcClient jdbc;

    @Test
    void publishedPropertyMustHaveAPriceOrPriceOnRequest() {
        assertThrows(DataAccessException.class, () -> jdbc.sql("""
                INSERT INTO properties (property_type_id, locality_id, status, price_amount)
                SELECT (SELECT id FROM property_types LIMIT 1), (SELECT id FROM localities LIMIT 1), 'published', NULL""").update());
    }

    @Test
    void zeroPriceIsRejected() {
        assertThrows(DataAccessException.class, () -> jdbc.sql("""
                INSERT INTO properties (property_type_id, locality_id, status, price_amount)
                SELECT (SELECT id FROM property_types LIMIT 1), (SELECT id FROM localities LIMIT 1), 'draft', 0""").update());
    }

    @Test
    void lostLeadRequiresReason() {
        assertThrows(DataAccessException.class, () -> jdbc.sql("""
                UPDATE leads SET stage_id = (SELECT id FROM pipeline_stages WHERE code = 'lost')
                WHERE public_ref = 'LEAD-LOCAL-1'""").update());
    }

    @Test
    void auditLogIsAppendOnly() {
        jdbc.sql("INSERT INTO audit_logs (actor_label, action, entity_type) VALUES ('system','test','test')").update();
        assertThrows(DataAccessException.class, () -> jdbc.sql("UPDATE audit_logs SET action = 'tampered'").update());
        assertThrows(DataAccessException.class, () -> jdbc.sql("DELETE FROM audit_logs").update());
    }

    @Test
    void sharedPhoneNumbersAreAllowed() {
        jdbc.sql("INSERT INTO customers (public_ref, full_name, phone_e164) VALUES ('CUS-T-1','A','+919999911111')").update();
        jdbc.sql("INSERT INTO customers (public_ref, full_name, phone_e164) VALUES ('CUS-T-2','B','+919999911111')").update();
    }

    @Test
    void openDealIsUniquePerLeadAndProperty() {
        // Deal stages are seeded inactive but valid rows; constraint is what matters here.
        jdbc.sql("""
                INSERT INTO deals (public_ref, customer_id, lead_id, property_id, owner_user_id, stage_id)
                SELECT 'DEAL-T-1', l.customer_id, l.id, l.interested_property_id, l.assigned_user_id, (SELECT id FROM deal_stages WHERE code='deal_created')
                FROM leads l WHERE l.public_ref = 'LEAD-LOCAL-1'""").update();
        assertThrows(DataAccessException.class, () -> jdbc.sql("""
                INSERT INTO deals (public_ref, customer_id, lead_id, property_id, owner_user_id, stage_id)
                SELECT 'DEAL-T-2', l.customer_id, l.id, l.interested_property_id, l.assigned_user_id, (SELECT id FROM deal_stages WHERE code='deal_created')
                FROM leads l WHERE l.public_ref = 'LEAD-LOCAL-1'""").update());
    }
}
