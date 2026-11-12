import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeView } from "@/components/site/HomeView";
import { isLang } from "@/i18n/dictionaries";
import { getSiteDictionary } from "@/i18n/site";
import { getSiteBlocks } from "@/lib/api";
import { pageMeta } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const s = getSiteDictionary(lang);
  const blocks = await getSiteBlocks(lang);
  const seo = blocks.seo["/"];
  return pageMeta(lang, "", seo?.title ?? s.hero.eyebrow, seo?.description ?? s.hero.sub);
}

/** Public homepage: published CMS blocks only (drafts are visible in the staff preview). */
export default async function Home({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return <HomeView lang={lang} blocks={await getSiteBlocks(lang)} />;
}
