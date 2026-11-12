import type { MetadataRoute } from "next";
import { getArticles, getLocations, getProjects, getSiteBlocks, searchProperties, type PropertySummary } from "@/lib/api";
import { citySlug } from "@/lib/site";
import { siteUrl } from "@/lib/seo";

export const revalidate = 3600;

const STATIC = ["", "/about", "/properties", "/residential", "/commercial", "/plots", "/projects", "/channel-partner", "/list-your-property", "/contact", "/privacy", "/terms"];

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
      for (let offset = 0; offset < 2400; offset += 24) {
        const page = await getProjects(lang, { limit: 24, offset });
        for (const p of page.items) out.push({ url: `${base}/${lang}/projects/${p.slug}`, priority: 0.8, changeFrequency: "weekly" });
        if (offset + 24 >= page.total) break;
      }
      // City pages exist only for cities with published listings (no empty SEO pages).
      for (const city of new Set((await getLocations(lang)).map((l) => l.city))) out.push({ url: `${base}/${lang}/locations/${citySlug(city)}`, priority: 0.7, changeFrequency: "weekly" });
      const articles = await getArticles(lang, { limit: 24 });
      if (articles.total > 0) out.push({ url: `${base}/${lang}/insights`, priority: 0.6, changeFrequency: "weekly" });
      // Careers only while the director has published it (unpublished/draft CMS content is never listed).
      if ((await getSiteBlocks(lang)).careers) out.push({ url: `${base}/${lang}/careers`, priority: 0.4, changeFrequency: "weekly" });
      for (const a of articles.items) out.push({ url: `${base}/${lang}/insights/${a.slug}`, priority: 0.6, changeFrequency: "monthly" });
    }
  } catch (e) {
    // API unreachable: fail instead of caching an incomplete sitemap for an hour. With ISR the last complete sitemap
    // keeps being served; at build time (no API) only the static pages are listed.
    if (process.env.NEXT_PHASE !== "phase-production-build") throw e;
  }
  return out;
}
