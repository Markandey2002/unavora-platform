package com.unavora.customers.internal;

/**
 * Sends a one-time code to a WhatsApp number through an approved provider (WhatsApp Business Platform via a BSP).
 * Only {@link MockWhatsAppOtpSender} exists today; a real adapter needs the business's WhatsApp Business account,
 * an approved authentication template and provider credentials (PENDING_BUSINESS_CONFIRMATIONS #6).
 */
interface WhatsAppOtpSender {

    record Sent(String provider, String providerMessageId) {}

    Sent send(String phoneE164, String code, String language);
}
