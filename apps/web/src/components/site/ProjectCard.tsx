import Image from "next/image";
import Link from "next/link";
import type { ExtraDictionary } from "@/i18n/extra";
import type { SiteDictionary } from "@/i18n/site";
import { formatPrice, type ProjectSummary } from "@/lib/api";
import { cityLabel } from "@/lib/site";
import { PhotoPending } from "./PhotoPending";
import { SampleBadge } from "./SampleBadge";
import { Icon } from "./ui";

/**
 * Published new launch. Every fact comes from the API, which returns only approved values (developer when verified,
 * price/possession when approved, RERA when verified, approved images). Missing facts are simply not shown.
 */
export function ProjectCard({ p, lang, s, x, headingLevel = "h3", eager = false }: {
  p: ProjectSummary; lang: string; s: SiteDictionary; x: ExtraDictionary; headingLevel?: "h2" | "h3"; eager?: boolean;
}) {
  const H = headingLevel;
  const href = `/${lang}/projects/${p.slug}`;
  const status = p.constructionStatus ? (s.project.statuses[p.constructionStatus] ?? p.constructionStatus) : null;
  const category = p.category ? x.launch.categories[p.category] : null;
  const where = [p.locality, p.city && cityLabel(p.city, lang)].filter(Boolean).join(", ");
  return (
    <li className="card-lift group relative flex flex-col bg-white shadow-[var(--shadow-card)]">
      <div className="zoom-on-hover relative aspect-[16/10] overflow-hidden bg-sand">
        {p.coverImage ? (
          <>
            <Image src={p.coverImage} alt={p.coverAlt ?? p.name} fill sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 90vw"
              preload={eager} className="object-cover" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-navy/60 to-transparent" />
          </>
        ) : (
          <PhotoPending label={x.photo.projectPending} compact />
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {status && <span className="eyebrow bg-navy px-2.5 py-1 !text-[0.62rem] text-gold">{status}</span>}
          {category && <span className="eyebrow bg-ivory/95 px-2.5 py-1 !text-[0.62rem] text-navy">{category}</span>}
          {p.sample && <SampleBadge label={x.sample.badge} note={x.sample.note} />}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        {where && (
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted [:lang(hi)_&]:tracking-normal">
            <Icon name="pin" className="size-4 text-gold-700" />{where}
          </p>
        )}
        <H className="font-display mt-2 text-2xl font-semibold leading-snug">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">{p.name}</Link>
        </H>
        {p.developerName && <p className="mt-1 text-sm text-muted">{x.launch.developer}: {p.developerName}</p>}
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-navy/10 pt-4 text-sm">
          <div><dt className="text-xs text-muted">{s.project.from}</dt><dd className="font-semibold">{p.startingPrice != null ? formatPrice(p.startingPrice) : x.launch.priceOnRequest}</dd></div>
          {p.possessionDate && <div><dt className="text-xs text-muted">{s.project.possession}</dt><dd className="font-semibold">{new Date(p.possessionDate).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { month: "short", year: "numeric" })}</dd></div>}
          {p.typeName && <div><dt className="text-xs text-muted">{x.launch.type}</dt><dd className="font-semibold">{p.typeName}</dd></div>}
          {p.unitTypes > 0 && <div><dt className="text-xs text-muted">{s.project.units}</dt><dd className="font-semibold">{p.unitTypes}</dd></div>}
        </dl>
        <div className="relative z-10 mt-auto flex items-center justify-between gap-3 pt-5">
          <Link href={href} tabIndex={-1} aria-hidden className="text-xs font-semibold uppercase tracking-[0.16em] text-navy hover:text-gold-700 [:lang(hi)_&]:text-sm [:lang(hi)_&]:tracking-normal">
            {x.launch.details} →
          </Link>
          <Link href={`${href}#enquire`} className="inline-flex min-h-10 items-center border border-navy/20 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-navy hover:border-navy [:lang(hi)_&]:tracking-normal"
            aria-label={`${x.launch.enquire}: ${p.name}`}>
            {x.launch.enquire}
          </Link>
        </div>
      </div>
    </li>
  );
}
