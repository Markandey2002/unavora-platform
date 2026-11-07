"use server";

import { cookies } from "next/headers";
import { customerApi, sessionFrom } from "@/lib/customer";

export type OtpState = {
  step: "phone" | "code" | "done"; phone?: string; code?: string; message?: "sent" | "verified"; error?: string;
};

export async function whatsappAction(prev: OtpState, form: FormData): Promise<OtpState> {
  const session = sessionFrom(await cookies());
  if (!session) return { step: "phone", error: "session_required" };
  const intent = String(form.get("intent") ?? "");
  const lang = String(form.get("lang") ?? "en");
  const phone = String(form.get("phone") ?? prev.phone ?? "").trim();

  if (intent === "send") {
    const r = await customerApi.requestOtp(session, phone, lang);
    if (!r.ok) return { step: prev.step === "code" ? "code" : "phone", phone, error: r.code };
    return r.data.alreadyVerified ? { step: "done", phone, message: "verified" } : { step: "code", phone, message: "sent" };
  }
  const r = await customerApi.verifyOtp(session, phone, String(form.get("code") ?? "").trim());
  if (!r.ok) return { step: "code", phone, error: r.code };
  return { step: "done", phone: r.data.whatsappNumber ?? phone, message: "verified" };
}

export type RequestState = { status: "idle" | "ok" | "error"; reference?: string; code?: string };

export async function customerRequestAction(_prev: RequestState, form: FormData): Promise<RequestState> {
  const session = sessionFrom(await cookies());
  if (!session) return { status: "error", code: "session_required" };
  const type = String(form.get("type") ?? "enquiry");
  if (type !== "enquiry" && type !== "callback" && type !== "site_visit") return { status: "error", code: "validation_failed" };
  if (form.get("enquiryConsent") !== "on") return { status: "error", code: "validation_failed" };
  const r = await customerApi.createRequest(session, String(form.get("idempotencyKey") ?? crypto.randomUUID()), {
    type,
    propertyId: String(form.get("propertyId") ?? "") || undefined,
    message: String(form.get("message") ?? "").trim() || undefined,
    preferredDate: String(form.get("preferredDate") ?? "") || undefined,
    enquiryConsent: true,
    marketingConsent: form.get("marketingConsent") === "on",
  });
  return r.ok ? { status: "ok", reference: r.data.reference } : { status: "error", code: r.code };
}
