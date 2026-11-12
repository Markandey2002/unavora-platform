import type { Metadata } from "next";

/** Public origin of the website. SITE_URL is set per environment; local default for development. */
export function siteUrl(): string {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Page metadata with canonical URL, English/Hindi alternates (hreflang, x-default = English) and Open Graph.
 * `path` is the part after the language prefix, e.g. "/properties".
 */
export function pageMeta(lang: string, path: string, title: string, description: string,
  opts: { noindex?: boolean; ogType?: "website" | "article"; paths?: Partial<Record<"en" | "hi", string>> } = {}): Metadata {
  // Detail pages pass their per-language paths: a language without a translation gets no hreflang (never a 404 link).
  const paths: Partial<Record<"en" | "hi", string>> = opts.paths ?? { en: path, hi: path };
  const url = (l: string) => `${siteUrl()}/${l}${paths[l as "en" | "hi"] ?? path}`;
  const languages: Record<string, string> = {};
  for (const l of ["en", "hi"] as const) if (typeof paths[l] === "string") languages[l] = url(l);   // "" = home page
  if (typeof paths.en === "string") languages["x-default"] = url("en");
  return {
    title,
    description,
    metadataBase: new URL(siteUrl()),
    alternates: { canonical: url(lang), languages },
    openGraph: {
      type: opts.ogType ?? "website", url: url(lang), title, description, siteName: "UNAVORA ANANT INFRA",
      locale: lang === "hi" ? "hi_IN" : "en_IN", alternateLocale: lang === "hi" ? ["en_IN"] : ["hi_IN"],
    },
    twitter: { card: "summary", title, description },
    robots: opts.noindex ? { index: false, follow: true } : undefined,
  };
}

/** JSON-LD script props; content is serialised safely (no "</script>" injection). */
export function jsonLd(data: unknown): { type: string; dangerouslySetInnerHTML: { __html: string } } {
  return { type: "application/ld+json", dangerouslySetInnerHTML: { __html: JSON.stringify(data).replace(/</g, "\\u003c") } };
}

/**
 * pageMeta with the director's published SEO override for this page (CRM -> Website content -> SEO), if any.
 * Overrides exist only for the fixed list of main pages; everything else keeps its built-in title/description.
 */
export async function seoMeta(lang: string, path: string, title: string, description: string, opts: { noindex?: boolean; ogType?: "website" | "article" } = {}): Promise<Metadata> {
  const { getSiteBlocks } = await import("./api");
  const o = (await getSiteBlocks(lang)).seo[path];
  return pageMeta(lang, path, o?.title ?? title, o?.description ?? description, opts);
}
