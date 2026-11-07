// Server-side API client. API_INTERNAL_URL is the Spring Boot base URL (never exposed to the browser).
const base = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

export type PropertySummary = {
  id: string; number: number; title: string; slug: string; city: string; locality: string; propertyType: string;
  price: number | null; priceOnRequest: boolean; priceNegotiable: boolean; bedrooms: number | null;
  bathrooms: number | null; builtUpArea: number | null; plotArea: number | null; areaUnit: string;
  availability: string; verified: boolean; language: string;
};
export type PropertyPage = { items: PropertySummary[]; nextCursor: string | null };
export type PropertyDetail = { summary: PropertySummary; description: string | null; amenities: string[]; availableLanguages: string[] };

export async function searchProperties(lang: string, params: Record<string, string | undefined> = {}): Promise<PropertyPage> {
  const qs = new URLSearchParams({ lang });
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const res = await fetch(`${base}/api/v1/public/properties?${qs}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`properties search failed: ${res.status}`);
  return res.json();
}

export async function getProperty(lang: string, slug: string): Promise<PropertyDetail | null> {
  const res = await fetch(`${base}/api/v1/public/properties/${encodeURIComponent(slug)}?lang=${lang}`, { next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`property fetch failed: ${res.status}`);
  return res.json();
}

export type EnquiryInput = {
  name: string; phone: string; email?: string; message?: string; propertyId?: string; language: string; consent: boolean;
  marketingConsent?: boolean;
};
export type EnquiryOutcome = { ok: true; reference: string } | { ok: false; code: string };

export async function submitEnquiry(input: EnquiryInput, idempotencyKey: string, clientIp?: string): Promise<EnquiryOutcome> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey };
  if (clientIp) headers["X-Forwarded-For"] = clientIp;
  const res = await fetch(`${base}/api/v1/public/enquiries`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (res.ok) return { ok: true, reference: (await res.json()).reference };
  let code = "generic";
  try { code = (await res.json()).code ?? code; } catch { /* ignore */ }
  return { ok: false, code };
}

export function formatPrice(amount: number): string {
  if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`;
  if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(2)} L`;
  return `₹${amount.toLocaleString("en-IN")}`;
}
