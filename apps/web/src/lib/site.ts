// Public-site helpers (unit-tested in site.test.ts). Company contact details come from GET /api/v1/public/company,
// which returns only values the business has verified; nothing here hard-codes a phone, email or address.
import type { Category, CompanyInfo, LocationRow } from "./api";

export type SiteContact = { phone?: string; whatsapp?: string; email?: string; social: { label: string; href: string }[] };

const E164 = /^\+[1-9]\d{7,14}$/;

/** Contact channels the site may show: verified, and well-formed (a bad value is hidden, not "fixed"). */
export function contactFrom(company: CompanyInfo): SiteContact {
  const { phone, whatsapp, email } = company.settings;
  return {
    phone: phone && E164.test(phone) ? phone : undefined,
    whatsapp: whatsapp && E164.test(whatsapp) ? whatsapp : undefined,
    email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : undefined,
    social: Object.entries(company.social)
      .filter(([, href]) => /^https:\/\/\S+$/.test(href))
      .map(([label, href]) => ({ label: label.charAt(0).toUpperCase() + label.slice(1), href })),
  };
}

export function whatsappHref(e164: string, text?: string): string {
  return `https://wa.me/${e164.replace(/^\+/, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** City names come from the database in English; Hindi labels for the cities we serve (draft translations). */
const cityHi: Record<string, string> = { Noida: "नोएडा", "Greater Noida": "ग्रेटर नोएडा", Lucknow: "लखनऊ", Prayagraj: "प्रयागराज" };
/** URL slug for a city (same rule as the API: lowercase, non-alphanumerics -> hyphen). */
export function citySlug(city: string): string {
  return city.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function cityLabel(city: string, lang: string): string {
  return lang === "hi" ? (cityHi[city] ?? city) : city;
}

export type CitySummary = { city: string; total: number; localities: { name: string; count: number }[] };

/** Groups API location rows by city, keeping API order; only places with listings are ever returned by the API. */
export function groupByCity(rows: LocationRow[]): CitySummary[] {
  const map = new Map<string, CitySummary>();
  for (const r of rows) {
    const c = map.get(r.city) ?? { city: r.city, total: 0, localities: [] };
    c.total += r.publishedCount;
    c.localities.push({ name: r.locality, count: r.publishedCount });
    map.set(r.city, c);
  }
  return [...map.values()];
}

/** Budget options in rupees (lakh / crore steps), used for the min/max price filters. */
export const budgetSteps = [2_000_000, 3_000_000, 5_000_000, 7_500_000, 10_000_000, 15_000_000, 20_000_000, 30_000_000, 50_000_000];

export const sorts = ["newest", "price_asc", "price_desc", "featured"] as const;
export type SearchFilters = { city?: string; category?: Category; type?: string; minPrice?: string; maxPrice?: string; bedrooms?: string; q?: string; sort?: string };

/** Keeps only well-formed filter values from the query string, so nothing odd is forwarded to the API. */
export function cleanFilters(sp: Record<string, string | undefined>, isCat: (v?: string) => v is Category): SearchFilters {
  const num = (v?: string) => (v && /^\d{1,10}$/.test(v) ? v : undefined);
  const word = (v?: string) => (v && /^[\p{L}\p{N} .'-]{1,60}$/u.test(v.trim()) ? v.trim() : undefined);
  let minPrice = num(sp.minPrice);
  let maxPrice = num(sp.maxPrice);
  if (minPrice && maxPrice && Number(minPrice) > Number(maxPrice)) [minPrice, maxPrice] = [maxPrice, minPrice];
  return {
    city: word(sp.city),
    category: isCat(sp.category) ? sp.category : undefined,
    type: sp.type && /^[a-z_]{2,30}$/.test(sp.type) ? sp.type : undefined,
    minPrice,
    maxPrice,
    bedrooms: sp.bedrooms && /^[1-9]$/.test(sp.bedrooms) ? sp.bedrooms : undefined,
    q: sp.q?.trim() ? sp.q.trim().slice(0, 80) : undefined,
    sort: sp.sort && (sorts as readonly string[]).includes(sp.sort) && sp.sort !== "newest" ? sp.sort : undefined,
  };
}

/** Query string for a listing URL, optionally without one filter (for "remove filter" chips). */
export function filterQuery(f: SearchFilters, without?: keyof SearchFilters, extra: Record<string, string> = {}): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && k !== without) qs.set(k, v);
  for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  const s = qs.toString();
  return s ? `?${s}` : "";
}
