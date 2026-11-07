package com.unavora.platform;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * In-memory sliding window. This is a per-instance backstop only; the real control in AWS is WAF rate rules.
 * Keys are hashed identifiers, never raw IPs, so nothing personal is retained here.
 */
@Component
public class RateLimiter {
    private final ConcurrentHashMap<String, Deque<Instant>> windows = new ConcurrentHashMap<>();

    public boolean tryAcquire(String key, int max, Duration window) {
        Instant now = Instant.now();
        Deque<Instant> q = windows.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && q.peekFirst().isBefore(now.minus(window))) q.pollFirst();
            if (q.size() >= max) return false;
            q.addLast(now);
            return true;
        }
    }

    /** Test hook. */
    public void reset() { windows.clear(); }
}
