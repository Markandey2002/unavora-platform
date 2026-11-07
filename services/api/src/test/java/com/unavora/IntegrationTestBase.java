package com.unavora;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Real PostgreSQL 17 (same major as production). Flyway applies every migration plus the synthetic seed.
 * Singleton container: started once per JVM and shared by every IT class. (A JUnit-managed @Container in an
 * abstract base is stopped after the first class while Spring's cached context still points at it.)
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class IntegrationTestBase {

    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17");

    static { POSTGRES.start(); }

    public static final String DIRECTOR = "00000000-0000-0000-0000-000000000101";
    public static final String EMPLOYEE_1 = "00000000-0000-0000-0000-000000000102";
    public static final String EMPLOYEE_2 = "00000000-0000-0000-0000-000000000103";
    public static final String PUBLISHED_PROPERTY = "20000000-0000-0000-0000-000000000001";
    public static final String DRAFT_PROPERTY = "20000000-0000-0000-0000-000000000005";
    public static final String SOLD_PROPERTY = "20000000-0000-0000-0000-000000000006";

    @Autowired protected MockMvc mvc;
}
