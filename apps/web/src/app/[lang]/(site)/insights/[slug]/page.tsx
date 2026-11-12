import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArticleCard, fmtDate } from "@/components/site/ArticleCard";
import { ArticleText } from "@/components/site/ArticleText";
import { CopyLink, LiteYouTube } from "@/components/site/InsightsParts";
import { Eyebrow } from "@/components/site/ui";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getSiteDictionary } from "@/i18n/site";
import { findSlugs, getArticle } from "@/lib/api";
import { jsonLd, pageMeta, siteUrl } from "@/lib/seo";

type Props = { params: Promise<{ lang: string; slug: string }> };

/** Search description: the summary, extended with the opening text when the summary alone is too short. */
function describe(excerpt: string | null, body: string): string {
  const plain = body.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/^(## |- )/, "").trim()).filter(Boolean).join(" ");
  const text = excerpt && excerpt.length >= 70 ? excerpt : [excerpt, plain].filter(Boolean).join(" — ");
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLang(lang)) return {};
  const d = await getArticle(lang, slug);
  return d ? pageMeta(lang, `/insights/${slug}`, d.article.title, describe(d.article.excerpt, d.body), { ogType: "article", paths: { en: d.slugs.en && `/insights/${d.slugs.en}`, hi: d.slugs.hi && `/insights/${d.slugs.hi}` } }) : {};
}


export default async function InsightPage({ params }: Props) {
  const { lang, slug } = await params;
  if (!isLang(lang)) notFound();
  const d = await getArticle(lang, slug);
  if (!d) {
    // A slug from the other language (language switch, shared link): go to this language's page, or to the language the
    // item exists in. Unknown or unpublished items stay 404.
    const other = await findSlugs("articles", slug);
    if (!other) notFound();
    redirect(other[lang] ? `/${lang}/insights/${other[lang]}` : other.en ? `/en/insights/${other.en}` : `/hi/insights/${other.hi}`);
  }
  const s = getSiteDictionary(lang);
  const x = getExtraDictionary(lang);
  const a = d.article;
  const url = `${siteUrl()}/${lang}/insights/${slug}`;
  const ld = a.kind === "video" && a.youtubeId
    ? { "@context": "https://schema.org", "@type": "VideoObject", name: a.title, description: a.excerpt ?? a.title, uploadDate: a.publishedAt,
        embedUrl: `https://www.youtube-nocookie.com/embed/${a.youtubeId}`, inLanguage: lang }
    : { "@context": "https://schema.org", "@type": "Article", headline: a.title, author: { "@type": "Person", name: a.authorName },
        datePublished: a.publishedAt, inLanguage: lang, mainEntityOfPage: url, publisher: { "@type": "Organization", name: "UNAVORA ANANT INFRA" } };
  const share = [
    ["WhatsApp", `https://wa.me/?text=${encodeURIComponent(`${a.title} ${url}`)}`],
    ["LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`],
    ["X", `https://twitter.com/intent/tweet?text=${encodeURIComponent(a.title)}&url=${encodeURIComponent(url)}`],
    ["Email", `mailto:?subject=${encodeURIComponent(a.title)}&body=${encodeURIComponent(url)}`],
  ];
  return (
    <>
      <script {...jsonLd(ld)} />
      <article className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6 lg:pt-12">
        <nav aria-label={s.detail.breadcrumb} className="text-xs text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href={`/${lang}`} className="inline-flex min-h-6 min-w-6 items-center hover:text-navy">{s.detail.home}</Link></li><li aria-hidden>/</li>
            <li><Link href={`/${lang}/insights`} className="inline-flex min-h-6 min-w-6 items-center hover:text-navy">{x.insights.nav}</Link></li><li aria-hidden>/</li>
            <li aria-current="page" className="line-clamp-1 text-navy">{a.title}</li>
          </ol>
        </nav>
        <div className="mt-6"><Eyebrow>{x.insights.categories[a.category] ?? a.category}</Eyebrow></div>
        <h1 className="font-display mt-3 text-4xl font-semibold leading-tight sm:text-5xl">{a.title}</h1>
        <p className="mt-4 text-sm text-muted">{x.insights.by} {a.authorName} · <time dateTime={a.publishedAt}>{fmtDate(a.publishedAt, lang)}</time></p>
        {a.coverImage && a.kind !== "video" && (
          <figure className="relative mt-8 aspect-[16/9] overflow-hidden bg-sand">
            <Image src={a.coverImage} alt={a.coverAlt ?? a.title} fill preload sizes="(min-width:768px) 768px, 100vw" className="object-cover" />
          </figure>
        )}
        {a.kind === "video" && a.youtubeId && <div className="mt-8"><LiteYouTube id={a.youtubeId} title={a.title} labels={{ play: x.insights.play, note: x.insights.videoNote }} /></div>}
        {d.videoDescription && <p className="mt-4 whitespace-pre-line text-muted">{d.videoDescription}</p>}
        <div className="mt-6 text-lg leading-relaxed text-navy/90"><ArticleText text={d.body} /></div>
        <div className="mt-12 flex flex-wrap items-center gap-2 border-t border-navy/10 pt-6">
          <span className="mr-2 text-sm font-semibold">{x.insights.share}</span>
          {share.map(([n, href]) => <a key={n} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center border border-navy/20 px-3 text-sm hover:border-navy">{n}</a>)}
          <CopyLink url={url} labels={{ copy: x.insights.copy, copied: x.insights.copied }} />
        </div>
      </article>
      {d.related.length > 0 && (
        <section aria-labelledby="related-insights" className="border-t border-navy/10 bg-sand/40">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <h2 id="related-insights" className="font-display text-3xl font-semibold">{x.insights.related}</h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{d.related.map((r) => <ArticleCard key={r.id} a={r} lang={lang} x={x} />)}</ul>
          </div>
        </section>
      )}
    </>
  );
}
