package com.unavora.customers.internal;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedDeque;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * LOCAL/TEST ONLY. Nothing leaves the machine: messages go to an in-memory inbox that local tools and tests read via
 * GET /internal/v1/dev/mock-whatsapp/latest (service credential required, endpoint exists only in mock mode).
 * The code is never written to the log.
 */
class MockWhatsAppOtpSender implements WhatsAppOtpSender {
    private static final Logger log = LoggerFactory.getLogger(MockWhatsAppOtpSender.class);
    private static final int CAPACITY = 200;

    record MockMessage(String phoneE164, String code, String language, String providerMessageId, Instant sentAt) {}

    private final ConcurrentLinkedDeque<MockMessage> inbox = new ConcurrentLinkedDeque<>();

    @Override
    public Sent send(String phoneE164, String code, String language) {
        String id = "mock-" + UUID.randomUUID();
        inbox.addFirst(new MockMessage(phoneE164, code, language, id, Instant.now()));
        while (inbox.size() > CAPACITY) inbox.pollLast();
        log.info("MOCK WhatsApp OTP queued for {} (id {}); not sent to any provider", mask(phoneE164), id);
        return new Sent("mock", id);
    }

    Optional<MockMessage> latestFor(String phoneE164) {
        return inbox.stream().filter(m -> m.phoneE164().equals(phoneE164)).findFirst();
    }

    static String mask(String phone) {
        return phone.length() <= 4 ? "****" : phone.substring(0, 3) + "*".repeat(phone.length() - 7) + phone.substring(phone.length() - 4);
    }
}
