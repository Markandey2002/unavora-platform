package com.unavora.platform;

import java.time.Duration;
import java.util.Arrays;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * Chooses the malware scanner ({@code unavora.files.scanner}: none | mock | clamd). "mock" is refused outside the
 * local and test profiles, so a production deployment can never mark files clean without a real scan.
 */
@Configuration
class MediaConfig {
    @Bean
    MalwareScanner malwareScanner(Environment env,
                                  @Value("${unavora.files.scanner:none}") String mode,
                                  @Value("${unavora.files.clamd.host:localhost}") String host,
                                  @Value("${unavora.files.clamd.port:3310}") int port,
                                  @Value("${unavora.files.clamd.timeout-ms:15000}") int timeoutMs) {
        return switch (mode) {
            case "clamd" -> new ClamdMalwareScanner(host, port, timeoutMs);
            case "mock" -> {
                boolean sampleProfile = Arrays.stream(env.getActiveProfiles()).anyMatch(Set.of("local", "test")::contains);
                if (!sampleProfile) throw new IllegalStateException("unavora.files.scanner=mock is allowed only in the local and test profiles");
                yield new MockMalwareScanner();
            }
            case "none" -> new NoMalwareScanner();
            default -> throw new IllegalStateException("unavora.files.scanner must be none, mock or clamd");
        };
    }

    /**
     * LOCAL/TEST ONLY: serves approved public media from the local directory so the website can show it. In
     * staging/production the public-media bucket/CDN serves these files and this endpoint does not exist.
     */
    @RestController
    @ConditionalOnProperty(name = "unavora.media.serve-local", havingValue = "true")
    static class PublicMediaController {
        private final PublicMediaStore store;

        PublicMediaController(PublicMediaStore store) { this.store = store; }

        @GetMapping("/api/v1/public/media/{key}")
        ResponseEntity<byte[]> media(@PathVariable String key) {
            MediaType type = key.endsWith(".png") ? MediaType.IMAGE_PNG : key.endsWith(".webp") ? MediaType.parseMediaType("image/webp") : MediaType.IMAGE_JPEG;
            return ResponseEntity.ok().contentType(type).cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic().immutable())
                    .header("X-Content-Type-Options", "nosniff").body(store.load(key));
        }
    }
}
