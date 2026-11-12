// Server-side API client. API_INTERNAL_URL is the Spring Boot base URL (never exposed to the browser).
const base = process.env.API_INTERNAL_URL ?? "http://localhost:8080";
/** Cache tag on every public API fetch; staff actions that change public content expire it (updateTag). */
export const PUBLIC_TAG = "public-content";

export type PropertySummary = {
  id: string; number: number; title: string; slug: string; city: string; locality: string; propertyType: string;
  price: number | null; priceOnRequest: boolean; priceNegotiable: boolean; bedrooms: number | null;
  bathrooms: number | null; builtUpArea: number | null; plotArea: number | null; areaUnit: string;
  availability: string; verified: boolean; language: string;
  /** Stable codes from the API (0.5.0+): e.g. "apartment" / "residential". */
  typeCode: string; category: Category;
  /** Director-chosen featured listing; coverImage only when approved public media exists (never stock). */
  featured: boolean; coverImage: string | null;
  /** Synthetic test record (only ever true in local/test deployments). */
  sample: boolean;
  /** "representative" = licensed stock image (always labelled on the site). */
  coverKind: string | null;
};
/** Approved, scanned, public media only. kind: actual_photo | render | floor_plan (stock never belongs to a listing). */
export type Media = { url: string; alt: string | null; caption: string | null; kind: "actual_photo" | "render" | "floor_plan" | "representative"; primary: boolean };
export type Category = "residential" | "commercial" | "land";
export const categories: readonly Category[] = ["residential", "commercial", "land"];
export function isCategory(v: string | undefined): v is Category {
  return !!v && (categories as readonly string[]).includes(v);
}
export type PropertyPage = { items: PropertySummary[]; nextCursor: string | null };
export type PropertyDetail = {
  summary: PropertySummary; description: string | null; amenities: string[]; availableLanguages: string[];
  images: Media[]; floorPlans: Media[];
  /** Exact only when approved by the business; otherwise the locality's approximate area; null = no map. */
  map: { latitude: number; longitude: number; precision: "exact" | "approximate" } | null;
  slugs: Partial<Record<"en" | "hi", string>>;
};

export async function searchProperties(lang: string, params: Record<string, string | undefined> = {}): Promise<PropertyPage> {
  const qs = new URLSearchParams({ lang });
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const res = await fetch(`${base}/api/v1/public/properties?${qs}`, { next: { revalidate: 60, tags: [PUBLIC_TAG] } });
  if (!res.ok) throw new Error(`properties search failed: ${res.status}`);
  return res.json();
}

export type LocationRow = { city: string; locality: string; publishedCount: number };

/** Cities/localities that currently have public listings (live counts; same visibility rules as search). */
export async function getLocations(lang: string): Promise<LocationRow[]> {
  const res = await fetch(`${base}/api/v1/public/locations?lang=${lang}`, { next: { revalidate: 60, tags: [PUBLIC_TAG] } });
  if (!res.ok) throw new Error(`locations failed: ${res.status}`);
  return (await res.json()).items;
}

export async function getProperty(lang: string, slug: string): Promise<PropertyDetail | null> {
  const res = await fetch(`${base}/api/v1/public/properties/${encodeURIComponent(slug)}?lang=${lang}`, { next: { revalidate: 60, tags: [PUBLIC_TAG] } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`property fetch failed: ${res.status}`);
  return res.json();
}

export type EnquiryInput = {
  name: string; phone: string; email?: string; message?: string; propertyId?: string; language: string; consent: boolean;
  marketingConsent?: boolean;
  /** general | callback | site_visit | residential | commercial | project (API validates; ignored with propertyId). */
  enquiryType?: string;
  /** Published illustrative showcase card the visitor came from (never a property id). */
  showcaseId?: string;
  /** "new_launches" = Register Your Interest while no real launch is published. */
  context?: string;
  preferredLocation?: string;
};

/** Illustrative showcase card (GET /api/v1/public/showcase). Deliberately has no price or property facts. */
export type ShowcaseItem = {
  id: string; category: "residential" | "villa" | "commercial" | "office" | "land" | "project_style";
  title: string; description: string; illustrative: true;
  image: { url: string; alt: string; kind: string; credit: string };
  cta: "enquire" | "register_interest" | "browse" | "view_record";
  link: { type: "property" | "project"; slug: string } | null;
};

export async function getShowcase(lang: string): Promise<ShowcaseItem[]> {
  try {
    const res = await fetch(`${base}/api/v1/public/showcase?lang=${lang === "hi" ? "hi" : "en"}`, { next: { revalidate: 60, tags: [PUBLIC_TAG] } });
    if (res.ok) return res.json();
  } catch { /* the section hides itself */ }
  return [];
}

export type ProjectSummary = {
  id: string; number: number; name: string; slug: string; city: string | null; locality: string | null;
  constructionStatus: string | null; possessionDate: string | null; startingPrice: number | null; unitTypes: number;
  reraNumber: string | null; language: string;
  /** Only when the business verified the developer relationship. */
  developerName: string | null;
  category: "residential" | "commercial" | "mixed_use" | "land" | null; typeCode: string | null; typeName: string | null;
  /** Approved project photograph/render, or null (an honest placeholder is shown). */
  coverImage: string | null; coverAlt: string | null; publishedAt: string;
  /** Synthetic test record (only ever true in local/test deployments). */
  sample: boolean;
  /** "representative" = licensed stock image (always labelled on the site). */
  coverKind: string | null;
};
export type ProjectDetail = {
  summary: ProjectSummary; description: string | null;
  units: { label: string; bedrooms: number | null; areaValue: number | null; areaUnit: string | null; basePrice: number | null }[];
  images: Media[]; floorPlans: Media[];
  map: { latitude: number; longitude: number; precision: "exact" | "approximate" } | null;
  slugs: Partial<Record<"en" | "hi", string>>;
};
export type ProjectPage = { items: ProjectSummary[]; total: number };
export type ProjectFilters = { status?: string; category?: string; type?: string; city?: string; q?: string; limit?: number; offset?: number };

/** New launches, newest first (published, non-sample projects; approved facts only). */
export async function getProjects(lang: string, f: ProjectFilters = {}): Promise<ProjectPage> {
  const qs = new URLSearchParams({ lang });
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  const res = await fetch(`${base}/api/v1/public/projects?${qs}`, { next: { revalidate: 60, tags: [PUBLIC_TAG] } });
  if (!res.ok) throw new Error(`projects failed: ${res.status}`);
  return res.json();
}

export async function getProject(lang: string, slug: string): Promise<ProjectDetail | null> {
  const res = await fetch(`${base}/api/v1/public/projects/${encodeURIComponent(slug)}?lang=${lang}`, { next: { revalidate: 60, tags: [PUBLIC_TAG] } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`project fetch failed: ${res.status}`);
  return res.json();
}

/** Company facts the business has confirmed (verified only). Unverified values never reach the site. */
export type CompanyInfo = {
  settings: Partial<Record<"display_name" | "tagline" | "legal_name" | "phone" | "whatsapp" | "email" | "cin" | "rera_number" | "hours", string>>;
  social: Record<string, string>;
  offices: { kind: string; city: string; locality: string | null; address: string | null; pinCode: string | null; phone: string | null;
    hours: string | null; directionsUrl: string | null }[];
};

/** Approved site-library image. kind "representative" = licensed stock: the website always labels it. */
export type SiteImage = { url: string; alt: string | null; kind: string; credit: string | null };
export type SiteBlocks = {
  hero?: { eyebrow?: string; title?: string; sub?: string; primaryLabel?: string; secondaryLabel?: string; image: SiteImage | null };
  tiles?: { key: "residential" | "commercial" | "land" | "office"; visible: boolean; title?: string; body?: string; image: SiteImage | null }[];
  sections?: { order: string[]; hidden: string[] };
  careers?: { title?: string; intro?: string; openings: { id: string; title: string; location: string; type: string; description?: string }[] };
  seo: Record<string, { title?: string; description?: string }>;
};
export type Association = { name: string; relationship: string; websiteUrl: string | null; logo: { url: string; alt: string } | null };

/** Published CMS blocks (hero, tiles, section order, careers, SEO overrides). Never fails the page: defaults apply. */
export async function getSiteBlocks(lang: string): Promise<SiteBlocks> {
  try {
    const res = await fetch(`${base}/api/v1/public/site-blocks?lang=${lang === "hi" ? "hi" : "en"}`, { next: { revalidate: 60, tags: [PUBLIC_TAG] } });
    if (res.ok) return res.json();
  } catch { /* defaults */ }
  return { seo: {} };
}

/** Published, confirmed associations (logos only with recorded permission). */
export async function getAssociations(): Promise<Association[]> {
  try {
    const res = await fetch(`${base}/api/v1/public/associations`, { next: { revalidate: 300, tags: [PUBLIC_TAG] } });
    if (res.ok) return res.json();
  } catch { /* none */ }
  return [];
}

export async function getCompany(): Promise<CompanyInfo> {
  try {
    const res = await fetch(`${base}/api/v1/public/company`, { next: { revalidate: 300, tags: [PUBLIC_TAG] } });
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

// ---------- Insights, testimonials, city content (published CMS content only) ----------
export type ArticleSummary = {
  id: string; kind: "article" | "video"; category: string; title: string; slug: string; excerpt: string | null;
  authorName: string; publishedAt: string; youtubeId: string | null; languages: string[];
  /** Director-chosen featured Insight; cover only when an approved library image is set. */
  featured: boolean; coverImage: string | null; coverAlt: string | null;
};
export type ArticleDetail = { article: ArticleSummary; body: string; related: ArticleSummary[]; videoDescription: string | null; slugs: Partial<Record<"en" | "hi", string>> };

/** All language slugs of a public listing / project / Insight, found by ANY of its slugs (null when not public). */
export async function findSlugs(kind: "properties" | "projects" | "articles", slug: string): Promise<Partial<Record<"en" | "hi", string>> | null> {
  try {
    const res = await fetch(`${base}/api/v1/public/${kind}/slugs/${encodeURIComponent(slug)}`, { next: { revalidate: 60, tags: [PUBLIC_TAG] } });
    if (res.ok) return res.json();
  } catch { /* none */ }
  return null;
}
export type Testimonial = { displayName: string; rating: number | null; body: string; propertyTitle: string | null };

export async function getArticles(lang: string, p: { kind?: string; category?: string; q?: string; limit?: number; offset?: number; featured?: boolean } = {}): Promise<{ items: ArticleSummary[]; total: number }> {
  const qs = new URLSearchParams({ lang });
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== "") qs.set(k, String(v));
  try {
    const res = await fetch(`${base}/api/v1/public/articles?${qs}`, { next: { revalidate: 60, tags: [PUBLIC_TAG] } });
    if (res.ok) return res.json();
  } catch { /* fall through */ }
  return { items: [], total: 0 };
}

export async function getArticle(lang: string, slug: string): Promise<ArticleDetail | null> {
  const res = await fetch(`${base}/api/v1/public/articles/${encodeURIComponent(slug)}?lang=${lang}`, { next: { revalidate: 60, tags: [PUBLIC_TAG] } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`article failed: ${res.status}`);
  return res.json();
}

export async function getTestimonials(lang: string): Promise<Testimonial[]> {
  try {
    const res = await fetch(`${base}/api/v1/public/testimonials?lang=${lang}`, { next: { revalidate: 300, tags: [PUBLIC_TAG] } });
    if (res.ok) return res.json();
  } catch { /* fall through */ }
  return [];
}

export async function getLocationContent(lang: string, citySlug: string): Promise<{ title: string; intro: string } | null> {
  try {
    const res = await fetch(`${base}/api/v1/public/location-content/${encodeURIComponent(citySlug)}?lang=${lang}`, { next: { revalidate: 300, tags: [PUBLIC_TAG] } });
    if (res.ok) return res.json();
  } catch { /* fall through */ }
  return null;
}

/** Owner property submission: forwards the multipart form (with optional photos) to the API. */
export async function submitOwnerProperty(form: FormData, idempotencyKey: string, clientIp?: string): Promise<EnquiryOutcome> {
  const headers: Record<string, string> = { "Idempotency-Key": idempotencyKey };
  if (clientIp) headers["X-Forwarded-For"] = clientIp;
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/public/property-submissions`, { method: "POST", headers, body: form, cache: "no-store" });
  } catch {
    return { ok: false, code: "generic" };
  }
  if (res.ok) return { ok: true, reference: (await res.json()).reference };
  let code = "generic";
  try { code = (await res.json()).code ?? code; } catch { /* ignore */ }
  return { ok: false, code };
}
