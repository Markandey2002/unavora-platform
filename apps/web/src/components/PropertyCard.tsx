import Link from "next/link";
import type { PropertySummary } from "@/lib/api";
import { formatPrice } from "@/lib/api";
import type { Dictionary } from "@/i18n/dictionaries";

export function PropertyCard({ p, lang, t }: { p: PropertySummary; lang: string; t: Dictionary }) {
  return (
    <li className="rounded-xl border border-slate/20 bg-white p-4 shadow-sm">
      <Link href={`/${lang}/properties/${p.slug}`} className="block min-h-11">
        <h2 className="text-lg font-semibold">{p.title}</h2>
        <p className="mt-1 text-sm text-slate">{p.propertyType} · {p.locality}, {p.city}</p>
        <p className="mt-3 text-xl font-semibold">
          {p.priceOnRequest || p.price == null ? t.priceOnRequest : formatPrice(p.price)}
          {p.priceNegotiable && <span className="ml-2 text-xs font-normal text-slate">{t.negotiable}</span>}
        </p>
        <p className="mt-2 text-sm text-slate">
          {p.bedrooms != null && <span>{p.bedrooms} {t.beds} · </span>}
          {p.bathrooms != null && <span>{p.bathrooms} {t.baths} · </span>}
          {(p.builtUpArea ?? p.plotArea) != null && <span>{p.builtUpArea ?? p.plotArea} {p.areaUnit.replace("_", " ")}</span>}
        </p>
        {p.verified && <span className="mt-2 inline-block rounded bg-gold/40 px-2 py-0.5 text-xs">{t.verified}</span>}
      </Link>
    </li>
  );
}
