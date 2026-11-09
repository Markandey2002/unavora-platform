import type { MetadataRoute } from "next";
import { getProjects, searchProperties, type PropertySummary } from "@/lib/api";
import { siteUrl } from "@/lib/seo";

export const revalidate = 3600;

const STATIC = ["", "/about", "/properties", "/residential", "/commercial", "/plots", "/projects", "/channel-partner", "/contact", "/privacy", "/terms"];

/** Public pages in both languages with hreflang alternates; listings and projects from the live public API. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entry = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
    url: `${base}/en${path}`, priority, changeFrequency: "weekly",
    alternates: { languages: { en: `${base}/en${path}`, hi: `${base}/hi${path}` } },
  });
  const out: MetadataRoute.Sitemap = STATIC.map((p) => entry(p, p === "" ? 1 : 0.7));
  try {
    // Walk every page of English listings (each listing has its own slug per language).
    for (const lang of ["en", "hi"] as const) {
      let cursor: string | undefined;
      const seen: PropertySummary[] = [];
      for (let i = 0; i < 40; i++) {
        const page = await searchProperties(lang, { limit: "50", cursor });
        seen.push(...page.items);
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      for (const p of seen) out.push({ url: `${base}/${lang}/properties/${p.slug}`, priority: 0.8, changeFrequency: "daily" });
      for (const p of await getProjects(lang)) out.push({ url: `${base}/${lang}/projects/${p.slug}`, priority: 0.8, changeFrequency: "weekly" });
    }
  } catch {
    // API unreachable at build/request time: static pages are still listed.
  }
  return out;
}
