// Server-side API client. API_INTERNAL_URL is the Spring Boot base URL (never exposed to the browser).
const base = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

export type PropertySummary = {
  id: string; number: number; title: string; slug: string; city: string; locality: string; propertyType: string;
  price: number | null; priceOnRequest: boolean; priceNegotiable: boolean; bedrooms: number | null;
  bathrooms: number | null; builtUpArea: number | null; plotArea: number | null; areaUnit: string;
  availability: string; verified: boolean; language: string;
  /** Stable codes from the API (0.5.0+): e.g. "apartment" / "residential". */
  typeCode: string; category: Category;
};
export type Category = "residential" | "commercial" | "land";
export const categories: readonly Category[] = ["residential", "commercial", "land"];
export function isCategory(v: string | undefined): v is Category {
  return !!v && (categories as readonly string[]).includes(v);
}
export type PropertyPage = { items: PropertySummary[]; nextCursor: string | null };
export type PropertyDetail = { summary: PropertySummary; description: string | null; amenities: string[]; availableLanguages: string[] };

export async function searchProperties(lang: string, params: Record<string, string | undefined> = {}): Promise<PropertyPage> {
  const qs = new URLSearchParams({ lang });
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const res = await fetch(`${base}/api/v1/public/properties?${qs}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`properties search failed: ${res.status}`);
  return res.json();
}

export type LocationRow = { city: string; locality: string; publishedCount: number };

/** Cities/localities that currently have public listings (live counts; same visibility rules as search). */
export async function getLocations(lang: string): Promise<LocationRow[]> {
  const res = await fetch(`${base}/api/v1/public/locations?lang=${lang}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`locations failed: ${res.status}`);
  return (await res.json()).items;
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
  /** general | callback | site_visit | residential | commercial | project (API validates; ignored with propertyId). */
  enquiryType?: string;
};

export type ProjectSummary = {
  id: string; number: number; name: string; slug: string; city: string | null; locality: string | null;
  constructionStatus: string | null; possessionDate: string | null; startingPrice: number | null; unitTypes: number;
  reraNumber: string | null; language: string;
};
export type ProjectDetail = {
  summary: ProjectSummary; description: string | null;
  units: { label: string; bedrooms: number | null; areaValue: number | null; areaUnit: string | null; basePrice: number | null }[];
};

export async function getProjects(lang: string): Promise<ProjectSummary[]> {
  const res = await fetch(`${base}/api/v1/public/projects?lang=${lang}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`projects failed: ${res.status}`);
  return (await res.json()).items;
}

export async function getProject(lang: string, slug: string): Promise<ProjectDetail | null> {
  const res = await fetch(`${base}/api/v1/public/projects/${encodeURIComponent(slug)}?lang=${lang}`, { next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`project fetch failed: ${res.status}`);
  return res.json();
}

/** Company facts the business has confirmed (verified only). Unverified values never reach the site. */
export type CompanyInfo = {
  settings: Partial<Record<"display_name" | "tagline" | "legal_name" | "phone" | "whatsapp" | "email" | "cin" | "rera_number", string>>;
  social: Record<string, string>;
  offices: { kind: string; city: string; locality: string | null; address: string | null; pinCode: string | null; phone: string | null }[];
};

export async function getCompany(): Promise<CompanyInfo> {
  try {
    const res = await fetch(`${base}/api/v1/public/company`, { next: { revalidate: 300 } });
    if (res.ok) return res.json();
  } catch { /* fall through: the site must render without company extras */ }
  return { settings: {}, social: {}, offices: [] };
}

export type PartnerInput = {
  name: string; phone: string; email?: string; companyName?: string; city: string; areasOfInterest?: string;
  reraNumber?: string; message?: string; language: string; consent: boolean;
};

export async function submitPartner(input: PartnerInput, idempotencyKey: string, clientIp?: string): Promise<EnquiryOutcome> {
  return post("/api/v1/public/channel-partners", input, idempotencyKey, clientIp);
}
export type EnquiryOutcome = { ok: true; reference: string } | { ok: false; code: string };

export async function submitEnquiry(input: EnquiryInput, idempotencyKey: string, clientIp?: string): Promise<EnquiryOutcome> {
  return post("/api/v1/public/enquiries", input, idempotencyKey, clientIp);
}

async function post(path: string, input: unknown, idempotencyKey: string, clientIp?: string): Promise<EnquiryOutcome> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey };
  if (clientIp) headers["X-Forwarded-For"] = clientIp;
  const res = await fetch(`${base}${path}`, {
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
