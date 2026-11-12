package com.unavora.platform;

import java.util.Arrays;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Fails startup of any deployment that is not local/test when synthetic data could reach the public website:
 * the sample switch is on, the local seed folder is on the Flyway path, or the database contains sample rows.
 * Production data can therefore never be initialised from (or mixed with) the local test seed unnoticed.
 */
@Component
class SyntheticDataGuard implements ApplicationRunner {
    private static final Set<String> SAMPLE_PROFILES = Set.of("local", "test");
    private final Environment env;
    private final JdbcClient jdbc;
    private final PublicVisibility visibility;
    private final String flywayLocations;

    SyntheticDataGuard(Environment env, JdbcClient jdbc, PublicVisibility visibility,
                       @Value("${spring.flyway.locations:classpath:db/migration}") String flywayLocations) {
        this.env = env;
        this.jdbc = jdbc;
        this.visibility = visibility;
        this.flywayLocations = flywayLocations;
    }

    @Override
    public void run(ApplicationArguments args) {
        check(Arrays.stream(env.getActiveProfiles()).anyMatch(SAMPLE_PROFILES::contains));
    }

    /** Package-visible for tests. */
    void check(boolean sampleProfile) {
        if (sampleProfile) return;
        if (visibility.includeSamples()) {
            throw new IllegalStateException("unavora.public.include-sample-content=true is allowed only in the local and test profiles");
        }
        if (flywayLocations.contains("seed-local")) {
            throw new IllegalStateException("db/seed-local (synthetic data) must not be on the Flyway path outside local/test");
        }
        Long samples = jdbc.sql("""
                SELECT (SELECT count(*) FROM properties WHERE is_sample) + (SELECT count(*) FROM projects WHERE is_sample)
                     + (SELECT count(*) FROM articles WHERE is_sample) + (SELECT count(*) FROM reviews WHERE is_sample)""")
                .query(Long.class).single();
        if (samples != null && samples > 0) {
            throw new IllegalStateException(samples + " synthetic sample record(s) found in a non-local database; remove them before starting");
        }
    }
}
