import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/site/ArticleCard";
import { PageHero } from "@/components/site/PageHero";
import { btn } from "@/components/site/ui";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getSiteDictionary } from "@/i18n/site";
import { getArticles } from "@/lib/api";
import { seoMeta } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> };
const CATEGORIES = ["market", "guide", "education", "investment", "location", "company"] as const;
const PAGE = 12;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const x = getExtraDictionary(lang);
  return seoMeta(lang, "/insights", x.insights.title, x.insights.sub, { noindex: Object.keys(await searchParams).length > 0 });
}

/** Insights: published CMS articles and videos; category/type filters, search, simple paging. */
export default async function InsightsPage({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const s = getSiteDictionary(lang);
  const x = getExtraDictionary(lang);
  const sp = await searchParams;
  const category = (CATEGORIES as readonly string[]).includes(sp.category ?? "") ? sp.category : undefined;
  const kind = sp.kind === "article" || sp.kind === "video" ? sp.kind : undefined;
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const page = Math.max(1, Math.min(Number(sp.page) || 1, 100));
  const unfiltered = !category && !kind && !q && page === 1;
  const [{ items, total }, featured] = await Promise.all([
    getArticles(lang, { category, kind, q, limit: PAGE, offset: (page - 1) * PAGE }),
    unfiltered ? getArticles(lang, { featured: true, limit: 1 }) : Promise.resolve({ items: [], total: 0 }),
  ]);
  const lead = featured.items[0];
  const url = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ category, kind, q, ...over })) if (v) p.set(k, v);
    const str = p.toString();
    return `/${lang}/insights${str ? `?${str}` : ""}`;
  };
  const chip = (active: boolean) => `inline-flex min-h-10 items-center border px-4 text-sm ${active ? "border-navy bg-navy text-ivory" : "border-navy/15 bg-white hover:border-navy"}`;
  return (
    <>
      <PageHero lang={lang} home={s.detail.home} breadcrumbLabel={s.detail.breadcrumb} crumbs={[{ label: x.insights.nav }]}
        eyebrow={x.insights.eyebrow} title={x.insights.title} sub={x.insights.sub}>
        <form action={`/${lang}/insights`} method="get" role="search" className="mt-8 flex max-w-xl gap-2">
          {category && <input type="hidden" name="category" value={category} />}
          {kind && <input type="hidden" name="kind" value={kind} />}
          <label className="sr-only" htmlFor="insights-q">{x.insights.search}</label>
          <input id="insights-q" name="q" defaultValue={q} maxLength={80} placeholder={x.insights.search}
            className="min-h-12 min-w-0 flex-1 border border-navy/15 bg-white px-4 text-base focus:border-gold-600 focus:outline-none" />
          <button className={`${btn.navy} shrink-0`}>{x.insights.searchButton}</button>
        </form>
      </PageHero>
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <nav aria-label={x.insights.eyebrow} className="flex flex-wrap gap-2">
          <Link href={url({ category: undefined, page: undefined })} aria-current={!category ? "page" : undefined} className={chip(!category)}>{x.insights.all}</Link>
          {CATEGORIES.map((c) => <Link key={c} href={url({ category: c, page: undefined })} aria-current={category === c ? "page" : undefined} className={chip(category === c)}>{x.insights.categories[c]}</Link>)}
          <span className="mx-2 hidden w-px bg-navy/15 sm:block" aria-hidden />
          <Link href={url({ kind: kind === "article" ? undefined : "article", page: undefined })} aria-current={kind === "article" ? "true" : undefined} className={chip(kind === "article")}>{x.insights.articles}</Link>
          <Link href={url({ kind: kind === "video" ? undefined : "video", page: undefined })} aria-current={kind === "video" ? "true" : undefined} className={chip(kind === "video")}>{x.insights.videos}</Link>
        </nav>
        {items.length === 0 ? (
          <p className="mt-12 border border-dashed border-navy/20 bg-white px-6 py-14 text-center text-muted">{x.insights.empty}</p>
        ) : (
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {lead && <ArticleCard key={`featured-${lead.id}`} a={lead} lang={lang} x={x} headingLevel="h2" large />}
            {items.filter((a) => a.id !== lead?.id).map((a) => <ArticleCard key={a.id} a={a} lang={lang} x={x} headingLevel="h2" />)}
          </ul>
        )}
        {page * PAGE < total && (
          <div className="mt-10 text-center"><Link href={url({ page: String(page + 1) })} className={btn.outline}>{x.insights.more}</Link></div>
        )}
      </section>
    </>
  );
}
