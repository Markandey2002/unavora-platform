import Link from "next/link";
import Image from "next/image";
import { PhotoPending } from "@/components/site/PhotoPending";
import { SampleBadge } from "@/components/site/SampleBadge";
import { Icon, RepresentativeTag } from "@/components/site/ui";
import type { Dictionary } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import type { SiteDictionary } from "@/i18n/site";
import type { PropertySummary } from "@/lib/api";
import { formatPrice } from "@/lib/api";
import { cityLabel } from "@/lib/site";

export function areaText(p: PropertySummary, s: SiteDictionary): string | null {
  const a = p.builtUpArea ?? p.plotArea;
  return a == null ? null : `${Number(a).toLocaleString("en-IN")} ${s.areaUnit[p.areaUnit] ?? p.areaUnit.replace("_", " ")}`;
}

export function priceText(p: PropertySummary, t: Dictionary): string {
  return p.priceOnRequest || p.price == null ? t.priceOnRequest : formatPrice(p.price);
}

/**
 * Listing card. The title is the card's single main link (the whole card is clickable through it); "View details" and
 * "Enquire" are secondary links above it. Only an approved photograph of THIS listing is shown; otherwise an honest
 * "photographs awaiting approval" state (never a stock or shared image).
 */
export function PropertyCard({ p, lang, t, s, headingLevel = "h3" }: {
  p: PropertySummary; lang: string; t: Dictionary; s: SiteDictionary; headingLevel?: "h2" | "h3";
}) {
  const href = `/${lang}/properties/${p.slug}`;
  const H = headingLevel;
  const area = areaText(p, s);
  const category = s.category[p.category ?? "residential"]?.title;
  const x = getExtraDictionary(lang);
  return (
    <li className="card-lift group relative flex flex-col bg-white shadow-[var(--shadow-card)]">
      <div className="zoom-on-hover relative aspect-[4/3] overflow-hidden bg-sand">
        {p.coverImage
          ? <><Image src={p.coverImage} alt={p.title} fill sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 90vw" className="object-cover" />
            {p.coverKind === "representative" && <RepresentativeTag label={s.photo.representative} className="bottom-2 right-2" />}</>
          : <PhotoPending label={x.photo.pending} compact />}
        <div className="absolute left-4 top-4 flex flex-wrap gap-1.5">
          {category && <span className="eyebrow bg-ivory/95 px-2.5 py-1 !text-[0.65rem] text-navy">{category}</span>}
          {p.sample && <SampleBadge label={x.sample.badge} note={x.sample.note} />}
        </div>
        {p.availability === "under_offer" && (
          <span className="absolute right-4 top-4 bg-navy/85 px-2.5 py-1 text-[0.7rem] font-semibold text-gold">{s.card.underOffer}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="font-display mb-2 text-2xl font-semibold text-navy">{priceText(p, t)}</p>
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted [:lang(hi)_&]:tracking-normal">
          <Icon name="pin" className="size-4 text-gold-700" />{p.locality}, {cityLabel(p.city, lang)}
        </p>
        <H className="font-display mt-2 text-xl font-semibold leading-snug text-navy">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">{p.title}</Link>
        </H>
        <p className="mt-1 text-sm text-muted">{p.propertyType}{p.priceNegotiable && !p.priceOnRequest && p.price != null ? ` · ${t.negotiable}` : ""}</p>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-navy/10 pt-4 text-sm text-navy/80">
          {p.bedrooms != null && <li className="flex items-center gap-1.5"><Icon name="bed" className="size-4 text-muted" />{p.bedrooms} {t.beds}</li>}
          {p.bathrooms != null && <li className="flex items-center gap-1.5"><Icon name="bath" className="size-4 text-muted" />{p.bathrooms} {t.baths}</li>}
          {area && <li className="flex items-center gap-1.5"><Icon name="area" className="size-4 text-muted" />{area}</li>}
        </ul>
        <div className="relative z-10 mt-auto flex items-center justify-between gap-3 pt-5">
          <Link href={href} tabIndex={-1} aria-hidden className="text-xs font-semibold uppercase tracking-[0.16em] text-navy hover:text-gold-700 [:lang(hi)_&]:text-sm [:lang(hi)_&]:tracking-normal">
            {s.card.details} →
          </Link>
          <Link href={`${href}#enquire`} className="inline-flex min-h-10 items-center border border-navy/20 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-navy transition-colors hover:border-navy hover:bg-navy hover:text-ivory [:lang(hi)_&]:text-sm [:lang(hi)_&]:tracking-normal">
            {s.card.enquire}
          </Link>
        </div>
      </div>
    </li>
  );
}
