package com.unavora.platform;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * One rule for every public (anonymous) query: synthetic sample records ({@code is_sample = true}) are never
 * public unless this deployment explicitly allows them. Only the local and test profiles may allow them;
 * {@link SyntheticDataGuard} refuses to start anything else with the switch on.
 */
@Component
public class PublicVisibility {
    private final boolean includeSamples;

    public PublicVisibility(@Value("${unavora.public.include-sample-content:false}") boolean includeSamples) {
        this.includeSamples = includeSamples;
    }

    public boolean includeSamples() { return includeSamples; }

    /** SQL fragment to append to a WHERE clause: {@code " AND NOT p.is_sample"}, or nothing when samples are allowed. */
    public String samples(String alias) {
        return includeSamples ? "" : " AND NOT " + alias + ".is_sample";
    }
}
