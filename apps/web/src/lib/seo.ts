import type { Metadata } from "next";

/** Public origin of the website. SITE_URL is set per environment; local default for development. */
export function siteUrl(): string {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Page metadata with canonical URL, English/Hindi alternates (hreflang, x-default = English) and Open Graph.
 * `path` is the part after the language prefix, e.g. "/properties".
 */
export function pageMeta(lang: string, path: string, title: string, description: string, opts: { noindex?: boolean; ogType?: "website" | "article" } = {}): Metadata {
  const url = (l: string) => `${siteUrl()}/${l}${path}`;
  return {
    title,
    description,
    metadataBase: new URL(siteUrl()),
    alternates: { canonical: url(lang), languages: { en: url("en"), hi: url("hi"), "x-default": url("en") } },
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
