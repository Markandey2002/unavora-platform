"use server";

import { headers } from "next/headers";
import { submitEnquiry } from "@/lib/api";

export type EnquiryState = { status: "idle" | "ok" | "error"; reference?: string; code?: string };

// The API rate-limits enquiries per client IP. Without this, every website enquiry would arrive from the Next.js
// server's own address and the whole site would share one 10/hour bucket. In AWS the first X-Forwarded-For hop is
// set by CloudFront/ALB; WAF rate rules remain the primary control.
function clientIp(h: Headers): string | undefined {
  const first = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || h.get("x-real-ip") || undefined;
}

export async function enquire(_prev: EnquiryState, formData: FormData): Promise<EnquiryState> {
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const consent = formData.get("consent") === "on";
  if (!consent) return { status: "error", code: "validation_failed" };
  const result = await submitEnquiry(
    {
      name: str("name"), phone: str("phone"), email: str("email") || undefined, message: str("message") || undefined,
      propertyId: str("propertyId") || undefined, language: str("language") || "en", consent,
      marketingConsent: formData.get("marketingConsent") === "on",
    },
    str("idempotencyKey"),
    clientIp(await headers()),
  );
  return result.ok ? { status: "ok", reference: result.reference } : { status: "error", code: result.code };
}
