import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeView } from "@/components/site/HomeView";
import { isLang } from "@/i18n/dictionaries";
import { getSiteDictionary } from "@/i18n/site";
import { getSiteBlocks } from "@/lib/api";
import { pageMeta } from "@/lib/seo";
import { BRAND, brandName } from "@/lib/brand";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const s = getSiteDictionary(lang);
  const blocks = await getSiteBlocks(lang);
  const seo = blocks.seo["/"];
  // Home: "<brand> — <tagline>" without the layout's "| brand" suffix (no duplicated brand in the tab title)
  const meta = pageMeta(lang, "", seo?.title ?? `${brandName(lang)} — ${BRAND.tagline}`, seo?.description ?? s.hero.sub);
  return { ...meta, title: { absolute: String(meta.title) } };
}

/** Public homepage: published CMS blocks only (drafts are visible in the staff preview). */
export default async function Home({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return <HomeView lang={lang} blocks={await getSiteBlocks(lang)} />;
}
