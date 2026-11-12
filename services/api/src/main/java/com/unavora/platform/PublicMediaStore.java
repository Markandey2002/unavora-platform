package com.unavora.platform;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Store for APPROVED public media only (listing/project photographs a director approved after a clean scan).
 * Local adapter: a directory served by {@code PublicMediaController} when {@code unavora.media.serve-local=true}.
 * Staging/production: a public-media bucket behind the CDN at {@code unavora.media.public-base-url}; originals and
 * owner uploads stay in the private store and are never written here except through staff approval.
 */
@Component
public class PublicMediaStore {
    private final Path root;

    public PublicMediaStore(@Value("${unavora.media.public-dir:${user.dir}/data/public-media}") String dir) {
        this.root = Path.of(dir).toAbsolutePath().normalize();
    }

    /** Writes a copy under a new random key (never the private key, so the two stores cannot be linked by name). */
    public String publish(byte[] bytes, String contentType) {
        String key = UUID.randomUUID() + switch (contentType) { case "image/png" -> ".png"; case "image/webp" -> ".webp"; default -> ".jpg"; };
        try {
            Files.createDirectories(root);
            Files.write(root.resolve(key), bytes);
            return key;
        } catch (IOException e) {
            throw new IllegalStateException("could not write public media", e);
        }
    }

    public byte[] load(String key) {
        if (key == null || !key.matches("[0-9a-f-]{36}\\.(jpg|png|webp)")) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Not found");
        Path p = root.resolve(key).normalize();
        if (!p.startsWith(root)) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Not found");
        try {
            return Files.readAllBytes(p);
        } catch (IOException e) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Not found");
        }
    }

    public void delete(String key) {
        if (key == null || !key.matches("[0-9a-f-]{36}\\.(jpg|png|webp)")) return;
        try { Files.deleteIfExists(root.resolve(key).normalize()); } catch (IOException ignored) { /* best effort */ }
    }
}
