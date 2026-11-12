"use server";

import { cookies, headers } from "next/headers";
import { submitEnquiry, submitOwnerProperty, submitPartner } from "@/lib/api";
import { customerApi, sessionFrom } from "@/lib/customer";

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
      enquiryType: str("enquiryType") || undefined,
    },
    str("idempotencyKey"),
    clientIp(await headers()),
  );
  return result.ok ? { status: "ok", reference: result.reference } : { status: "error", code: result.code };
}

/** Channel-partner application (POST /api/v1/public/channel-partners): partner record + CRM lead. */
export async function applyPartner(_prev: EnquiryState, formData: FormData): Promise<EnquiryState> {
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const consent = formData.get("consent") === "on";
  if (!consent) return { status: "error", code: "validation_failed" };
  const result = await submitPartner(
    {
      name: str("name"), phone: str("phone"), email: str("email") || undefined, companyName: str("companyName") || undefined,
      city: str("city"), areasOfInterest: str("areas") || undefined, reraNumber: str("rera") || undefined,
      message: str("message") || undefined, language: str("language") || "en", consent,
    },
    str("idempotencyKey"),
    clientIp(await headers()),
  );
  return result.ok ? { status: "ok", reference: result.reference } : { status: "error", code: result.code };
}

/** Save or unsave a listing for the signed-in customer. Returns false when not signed in or the listing is gone. */
export async function toggleFavourite(propertyId: string, save: boolean): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(propertyId)) return false;
  const session = sessionFrom(await cookies());
  if (!session) return false;
  const r = save ? await customerApi.saveFavourite(session, propertyId) : await customerApi.removeFavourite(session, propertyId);
  return r.ok;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Owner property submission ("List your property"): validated here, again (authoritatively) by the API. */
export async function submitOwner(_prev: EnquiryState, formData: FormData): Promise<EnquiryState> {
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  if (formData.get("consent") !== "on") return { status: "error", code: "validation_failed" };
  const photos = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (photos.length > 5 || photos.some((f) => f.size > 5 * 1024 * 1024 || !IMAGE_TYPES.has(f.type))) return { status: "error", code: "file_type" };
  const out = new FormData();
  for (const k of ["name", "phone", "email", "city", "locality", "propertyType", "purpose", "expectedPrice", "area", "areaUnit", "message", "language"]) {
    const v = str(k);
    if (v) out.set(k, v);
  }
  if (!str("area")) out.delete("areaUnit");
  out.set("consent", "true");
  for (const f of photos) out.append("photos", f, f.name.slice(0, 120));
  const result = await submitOwnerProperty(out, str("idempotencyKey"), clientIp(await headers()));
  return result.ok ? { status: "ok", reference: result.reference } : { status: "error", code: result.code };
}
