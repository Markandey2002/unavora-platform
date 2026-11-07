package com.unavora;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class UnavoraApplication {
    public static void main(String[] args) {
        // The server runs in UTC everywhere. Windows JVMs default to the legacy "Asia/Calcutta" id, which the
        // PostgreSQL 17 driver handshake rejects (FATAL: invalid value for parameter "TimeZone").
        java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("UTC"));
        SpringApplication.run(UnavoraApplication.class, args);
    }
}
