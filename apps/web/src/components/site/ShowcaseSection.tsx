"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { ExtraDictionary } from "@/i18n/extra";
import type { ShowcaseItem } from "@/lib/api";
import { SectionHeading } from "./ui";

/** Where "Browse listings" leads for each showcase category (real, approved listings only). */
const BROWSE: Record<ShowcaseItem["category"], string> = {
  residential: "/residential", villa: "/residential", commercial: "/commercial", office: "/properties?type=office", land: "/plots", project_style: "/projects",
};

/** "Unsplash photo-123 (https://unsplash.com)" -> "Unsplash"; named credits are kept. */
export function creditLabel(credit: string): string {
  return credit.replace(/\s*\(https?:[^)]*\)$/, "").replace(/^Unsplash photo-\S+$/, "Unsplash");
}

export function showcaseHref(lang: string, it: ShowcaseItem): string {
  if (it.cta === "view_record" && it.link) return `/${lang}/${it.link.type === "property" ? "properties" : "projects"}/${it.link.slug}`;
  if (it.cta === "browse") return `/${lang}${BROWSE[it.category]}`;
  return `/${lang}/contact?showcase=${it.id}#enquiry`;
}

/**
 * "Explore property styles": CMS-managed illustrative showcase cards. Each card carries a visible "Illustrative
 * example" label and the section opens with a plain-language disclosure. No prices, sizes, dates or availability are
 * shown (the API has none). Never titled "Featured" or "Available now"; never part of property search.
 */
export function ShowcaseSection({ lang, items, x }: { lang: string; items: ShowcaseItem[]; x: ExtraDictionary }) {
  const sc = x.showcase;
  const present = Array.from(new Set(items.map((i) => i.category)));
  const [cat, setCat] = useState<string>("all");
  const shown = cat === "all" ? items : items.filter((i) => i.category === cat);
  const chip = (active: boolean) =>
    `inline-flex min-h-10 items-center border px-4 text-xs font-semibold uppercase tracking-[0.14em] transition-colors [:lang(hi)_&]:text-sm [:lang(hi)_&]:tracking-normal ${
      active ? "border-navy bg-navy text-ivory" : "border-navy/20 text-navy hover:border-navy"}`;

  return (
    <section aria-labelledby="showcase-title" className="py-16 lg:py-24" data-testid="showcase">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="showcase-title" eyebrow={sc.eyebrow} title={sc.title} sub={sc.sub} />
        <p className="mt-5 max-w-3xl border-l-2 border-gold pl-4 text-sm leading-relaxed text-navy/80" data-testid="showcase-disclosure">
          {sc.disclosure}
        </p>
        {present.length > 1 && (
          <div role="group" aria-label={sc.title} className="-mx-4 mt-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            <button type="button" aria-pressed={cat === "all"} onClick={() => setCat("all")} className={chip(cat === "all")}>{sc.all}</button>
            {present.map((c) => (
              <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={`${chip(cat === c)} shrink-0`}>
                {sc.categories[c] ?? c}
              </button>
            ))}
          </div>
        )}
        <ul className="-mx-4 mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 [&>li]:w-[85%] [&>li]:shrink-0 [&>li]:snap-start sm:[&>li]:w-auto">
          {shown.map((it) => <ShowcaseCard key={it.id} lang={lang} it={it} sc={sc} />)}
        </ul>
      </div>
    </section>
  );
}

/**
 * One showcase card (also used by the CMS preview). The label is "Illustrative example" unless the item is linked to a
 * published real record AND its image is an actual photograph or a project render of it.
 */
export function ShowcaseCard({ lang, it, sc, unoptimized = false, as = "li" }: {
  lang: string; it: ShowcaseItem; sc: ExtraDictionary["showcase"]; unoptimized?: boolean; as?: "li" | "div";
}) {
  const Tag = as;
  const real = it.link != null && (it.image.kind === "actual_photo" || it.image.kind === "render");
  const label = !real ? sc.label : it.image.kind === "render" ? sc.labelRender : sc.labelActual;
  return (
    <Tag className="group flex flex-col bg-white shadow-[var(--shadow-card)]" data-testid="showcase-card" data-category={it.category}>
      <div className="relative aspect-[4/3] overflow-hidden bg-sand">
        {it.image.url && (
          <Image src={it.image.url} alt={it.image.alt} fill unoptimized={unoptimized} sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 85vw"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.03] motion-reduce:transition-none" />
        )}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 bg-navy/80 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-gold backdrop-blur-sm [:lang(hi)_&]:text-xs [:lang(hi)_&]:tracking-normal"
          data-testid={real ? "record-label" : "illustrative-label"}>
          <span aria-hidden className="size-1.5 rounded-full bg-gold" />{label}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-6">
        <p className="eyebrow text-gold-700">{sc.categories[it.category] ?? it.category}</p>
        <h3 className="font-display mt-2 text-xl font-semibold text-navy">{it.title}</h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{it.description}</p>
        <Link href={showcaseHref(lang, it)} className="mt-5 inline-flex min-h-11 items-center gap-2 self-start border-b border-gold pb-0.5 text-sm font-semibold text-navy hover:text-gold-700">
          {sc.cta[it.cta] ?? sc.cta.enquire}<span aria-hidden>→</span>
        </Link>
        {it.image.credit && !real && <p className="mt-3 text-[0.7rem] text-muted/80">{sc.imageNote} · {creditLabel(it.image.credit)}</p>}
      </div>
    </Tag>
  );
}
