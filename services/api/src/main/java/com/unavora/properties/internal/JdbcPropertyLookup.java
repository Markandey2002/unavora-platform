package com.unavora.properties.internal;

import com.unavora.properties.api.PropertyLookup;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
class JdbcPropertyLookup implements PropertyLookup {
    private final JdbcClient jdbc;

    JdbcPropertyLookup(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Override
    public Optional<PublicListing> findPubliclyVisible(UUID propertyId) {
        return jdbc.sql("""
                SELECT id, owner_user_id FROM properties
                WHERE id = :id AND status = 'published' AND availability IN ('available','under_offer')""")
                .param("id", propertyId)
                .query((rs, n) -> new PublicListing(rs.getObject("id", UUID.class), rs.getObject("owner_user_id", UUID.class)))
                .optional();
    }
}
