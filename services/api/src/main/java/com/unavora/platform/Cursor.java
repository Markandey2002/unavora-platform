package com.unavora.platform;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.UUID;
import org.springframework.http.HttpStatus;

/** Opaque keyset cursor over (timestamp, id). Avoids OFFSET scans and unstable pages. */
public record Cursor(OffsetDateTime at, UUID id) {

    public String encode() {
        String raw = at.toString() + "|" + id;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    public static Cursor decode(String token) {
        try {
            String raw = new String(Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
            int i = raw.indexOf('|');
            return new Cursor(OffsetDateTime.parse(raw.substring(0, i)), UUID.fromString(raw.substring(i + 1)));
        } catch (RuntimeException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "bad_cursor", "Invalid cursor");
        }
    }

    public static int clampLimit(Integer requested) {
        if (requested == null) return 20;
        return Math.max(1, Math.min(requested, 50));
    }
}
