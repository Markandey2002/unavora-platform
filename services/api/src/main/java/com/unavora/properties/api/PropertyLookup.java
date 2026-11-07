package com.unavora.properties.api;

import java.util.Optional;
import java.util.UUID;

/** The only way other modules may ask the properties module about a listing (no table access across modules). */
public interface PropertyLookup {

    /** Minimal facts another module needs; never includes private fields such as the address. */
    record PublicListing(UUID id, UUID assignedUserId) {}

    /** Present only if the property is published AND available/under offer (same rule as public search). */
    Optional<PublicListing> findPubliclyVisible(UUID propertyId);
}
