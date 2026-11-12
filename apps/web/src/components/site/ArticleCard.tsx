import Image from "next/image";
import Link from "next/link";
import type { ExtraDictionary } from "@/i18n/extra";
import type { ArticleSummary } from "@/lib/api";
import { Arrow } from "./ui";

export function fmtDate(iso: string, lang: string) {
  return new Date(iso).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** Insight card: approved cover image (or the video's own thumbnail) when present, otherwise typographic. */
export function ArticleCard({ a, lang, x, headingLevel = "h3", large = false }: { a: ArticleSummary; lang: string; x: ExtraDictionary; headingLevel?: "h2" | "h3"; large?: boolean }) {
  const H = headingLevel;
  const cover = a.coverImage ?? (a.kind === "video" && a.youtubeId ? `https://i.ytimg.com/vi/${a.youtubeId}/hqdefault.jpg` : null);
  return (
    <li className={`card-lift group relative flex flex-col bg-white shadow-[var(--shadow-card)] ${large ? "lg:col-span-3 lg:grid lg:grid-cols-2" : ""}`}>
      {cover && (
        <div className={`relative overflow-hidden bg-sand ${large ? "aspect-[16/9] lg:aspect-auto lg:min-h-80" : "aspect-[16/9]"}`}>
          <Image src={cover} alt={a.coverImage ? (a.coverAlt ?? a.title) : ""} fill sizes={large ? "(min-width:1024px) 50vw, 100vw" : "(min-width:1024px) 33vw, 100vw"} className="object-cover" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow !text-[0.65rem] text-gold-700">{x.insights.categories[a.category] ?? a.category}</span>
        {a.kind === "video" && <span className="bg-navy px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-gold">▶ {x.insights.videos}</span>}
      </div>
      {a.featured && large && <span className="eyebrow mt-3 !text-[0.65rem] text-navy">{x.insights.featured}</span>}
      <H className={`font-display mt-4 font-semibold leading-snug ${large ? "text-3xl lg:text-4xl" : "text-2xl"}`}>
        <Link href={`/${lang}/insights/${a.slug}`} className="after:absolute after:inset-0 after:content-['']">{a.title}</Link>
      </H>
      {a.excerpt && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted">{a.excerpt}</p>}
      <p className="mt-auto pt-5 text-xs text-muted">{x.insights.by} {a.authorName} · <time dateTime={a.publishedAt}>{fmtDate(a.publishedAt, lang)}</time></p>
      <span className="mt-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-navy [:lang(hi)_&]:tracking-normal">
        {a.kind === "video" ? x.insights.watch : x.insights.read}<Arrow className="size-4 transition-transform group-hover:translate-x-1" />
      </span>
      </div>
    </li>
  );
}
