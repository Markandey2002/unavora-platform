import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingView } from "@/components/site/ListingView";
import { isLang } from "@/i18n/dictionaries";
import { getSiteDictionary } from "@/i18n/site";
import { seoMeta } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const c = getSiteDictionary(lang).category.land;
  return seoMeta(lang, "/plots", c.long, c.body, { noindex: Object.keys(await searchParams).length > 0 });
}

/** land listings: same listing view with the category fixed (API: category=land). */
export default async function CategoryPage({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const c = getSiteDictionary(lang).category.land;
  return <ListingView lang={lang} sp={await searchParams} lockCategory="land" title={c.long} sub={c.body} base="/plots" />;
}
