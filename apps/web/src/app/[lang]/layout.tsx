import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter, Noto_Sans_Devanagari, Noto_Serif_Devanagari } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import "../globals.css";
import { isLang, languages } from "@/i18n/dictionaries";
import { siteUrl } from "@/lib/seo";
import { BRAND } from "@/lib/brand";

// Self-hosted at build time by next/font (no runtime request to Google). Devanagari faces are not preloaded:
// browsers fetch them only when Hindi glyphs are on the page (unicode-range).
const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--nf-display", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--nf-body", display: "swap" });
const displayHi = Noto_Serif_Devanagari({ subsets: ["devanagari"], weight: ["500", "700"], variable: "--nf-display-hi", display: "swap", preload: false });
const bodyHi = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600"], variable: "--nf-body-hi", display: "swap", preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${BRAND.name.en} — ${BRAND.tagline}`, template: `%s | ${BRAND.name.en}` },
  description: "Residential, commercial and plot listings in Noida, Lucknow and Prayagraj.",
  applicationName: BRAND.name.en,
  appleWebApp: { title: BRAND.name.en },
};

export const viewport: Viewport = { themeColor: "#101d35" };

export function generateStaticParams() {
  return languages.map((lang) => ({ lang }));
}

/** Document shell only. Public pages get the site header/footer from (site)/layout; staff pages from staff/layout. */
export default async function LangLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return (
    <html lang={lang} className={`${display.variable} ${body.variable} ${displayHi.variable} ${bodyHi.variable}`}>
      <body className="min-h-dvh bg-ivory text-navy antialiased">{children}</body>
    </html>
  );
}
