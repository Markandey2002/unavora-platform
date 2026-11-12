package com.unavora.platform;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Private uploads (e.g. owner property photos). Files live OUTSIDE any public path under random names and are only
 * returned to authorised staff through the API. Type is decided by the file's magic bytes, never by its name or the
 * browser-supplied content type. No malware scanner exists locally: files are recorded as "not_scanned" and must not
 * be published until scanned (staging/production: S3 private bucket + scanning, SECURITY_ARCHITECTURE "Files").
 */
@Component
public class PrivateFileStore {
    public static final int MAX_BYTES = 5 * 1024 * 1024;

    public record Stored(String key, String contentType, int size, String sha256) {}

    private final Path root;

    public PrivateFileStore(@Value("${unavora.files.private-dir:${user.dir}/data/private-uploads}") String dir) {
        this.root = Path.of(dir).toAbsolutePath().normalize();
    }

    public Stored store(byte[] bytes) {
        if (bytes == null || bytes.length == 0) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "file_empty", "The file is empty");
        if (bytes.length > MAX_BYTES) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "file_too_large", "Each photo must be 5 MB or smaller");
        String type = sniff(bytes);
        if (type == null) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "file_type", "Only JPEG, PNG or WebP photos are accepted");
        String key = UUID.randomUUID() + switch (type) { case "image/png" -> ".png"; case "image/webp" -> ".webp"; default -> ".jpg"; };
        try {
            Files.createDirectories(root);
            Files.write(root.resolve(key), bytes);
            String sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
            return new Stored(key, type, bytes.length, sha);
        } catch (IOException | java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("could not store upload", e);
        }
    }

    public byte[] load(String key) {
        if (key == null || !key.matches("[0-9a-f-]{36}\\.(jpg|png|webp)")) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "File not found");
        Path p = root.resolve(key).normalize();
        if (!p.startsWith(root)) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "File not found");
        try {
            return Files.readAllBytes(p);
        } catch (IOException e) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "File not found");
        }
    }

    public void delete(String key) {
        try { Files.deleteIfExists(root.resolve(key).normalize()); } catch (IOException ignored) { /* best effort */ }
    }

    static String sniff(byte[] b) {
        if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) return "image/jpeg";
        if (b.length >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') return "image/png";
        if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return "image/webp";
        return null;
    }
}
