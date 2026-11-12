import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { isLang } from "@/i18n/dictionaries";
import { getSiteDictionary } from "@/i18n/site";
import { getArticles, getCompany, getSiteBlocks } from "@/lib/api";
import { getExtraDictionary } from "@/i18n/extra";

/** Public website chrome. Staff/director screens use staff/layout.tsx and are not affected. */
export default async function SiteLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getSiteDictionary(lang);
  const [company, insights, blocks] = await Promise.all([getCompany(), getArticles(lang, { limit: 1 }), getSiteBlocks(lang)]);
  const x = getExtraDictionary(lang);
  const extra = { insights: x.insights.nav, listProperty: x.owner.nav, hasInsights: insights.total > 0, careers: x.careers.nav, hasCareers: !!blocks.careers };
  return (
    <div className="site flex min-h-dvh flex-col">
      <a href="#main" className="sr-only z-50 bg-gold px-4 py-3 font-semibold text-navy focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        {t.skip}
      </a>
      <Header lang={lang} t={t} extra={extra} />
      <main id="main" className="flex-1">{children}</main>
      <Footer lang={lang} t={t} company={company} extra={extra} x={x} />
    </div>
  );
}
