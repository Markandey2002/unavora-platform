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
  const s = getSiteDictionary(lang);
  const filtered = Object.keys(await searchParams).length > 0;
  // Filtered result pages are not indexed; the canonical points at the unfiltered listing.
  return pageMeta(lang, "/properties", s.listing.title, s.listing.sub, { noindex: filtered });
}

export default async function PropertiesPage({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const s = getSiteDictionary(lang);
  return <ListingView lang={lang} sp={await searchParams} title={s.listing.title} sub={s.listing.sub} base="/properties" />;
}
