package com.unavora.properties.internal;

import com.unavora.properties.api.PropertyLookup;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
class JdbcPropertyLookup implements PropertyLookup {
    private final JdbcClient jdbc;
    private final com.unavora.platform.PublicVisibility visibility;

    JdbcPropertyLookup(JdbcClient jdbc, com.unavora.platform.PublicVisibility visibility) {
        this.jdbc = jdbc;
        this.visibility = visibility;
    }

    @Override
    public Optional<PublicListing> findPubliclyVisible(UUID propertyId) {
        return jdbc.sql("""
                SELECT p.id, p.owner_user_id FROM properties p
                WHERE p.id = :id AND p.status = 'published' AND p.availability IN ('available','under_offer')""" + visibility.samples("p"))
                .param("id", propertyId)
                .query((rs, n) -> new PublicListing(rs.getObject("id", UUID.class), rs.getObject("owner_user_id", UUID.class)))
                .optional();
    }
}
