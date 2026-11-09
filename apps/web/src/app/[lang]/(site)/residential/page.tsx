import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingView } from "@/components/site/ListingView";
import { isLang } from "@/i18n/dictionaries";
import { getSiteDictionary } from "@/i18n/site";
import { pageMeta } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const c = getSiteDictionary(lang).category.residential;
  return pageMeta(lang, "/residential", c.long, c.body, { noindex: Object.keys(await searchParams).length > 0 });
}

/** residential listings: same listing view with the category fixed (API: category=residential). */
export default async function CategoryPage({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const c = getSiteDictionary(lang).category.residential;
  return <ListingView lang={lang} sp={await searchParams} lockCategory="residential" title={c.long} sub={c.body} base="/residential" />;
}
