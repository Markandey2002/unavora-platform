import Link from "next/link";
import type { SiteDictionary } from "@/i18n/site";
import { formatPrice, type ProjectSummary } from "@/lib/api";
import { cityLabel } from "@/lib/site";
import { PropertyArt, seedOf } from "./Art";
import { Icon } from "./ui";

/** Published project (new launch). Every field comes from the API; missing data is simply not shown. */
export function ProjectCard({ p, lang, s, headingLevel = "h3" }: { p: ProjectSummary; lang: string; s: SiteDictionary; headingLevel?: "h2" | "h3" }) {
  const H = headingLevel;
  const status = p.constructionStatus ? (s.project.statuses[p.constructionStatus] ?? p.constructionStatus) : null;
  return (
    <li className="card-lift group relative bg-white shadow-[var(--shadow-card)]">
      <div className="zoom-on-hover relative aspect-[16/10] overflow-hidden bg-navy">
        <PropertyArt kind="tower" seed={seedOf(p.id)} wide label={`${s.card.illustration}: ${p.name}`} />
        <div className="absolute inset-0 bg-gradient-to-t from-navy/70 to-transparent" />
        {status && <span className="eyebrow absolute left-4 top-4 bg-ivory/95 px-2.5 py-1 !text-[0.65rem] text-navy">{status}</span>}
        <span className="absolute bottom-3 right-4 text-[0.65rem] uppercase tracking-[0.18em] text-ivory/70">{s.card.illustration}</span>
      </div>
      <div className="p-5">
        {(p.locality || p.city) && (
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted [:lang(hi)_&]:tracking-normal">
            <Icon name="pin" className="size-4 text-gold-700" />{[p.locality, p.city && cityLabel(p.city, lang)].filter(Boolean).join(", ")}
          </p>
        )}
        <H className="font-display mt-2 text-2xl font-semibold">
          <Link href={`/${lang}/projects/${p.slug}`} className="after:absolute after:inset-0 after:content-['']">{p.name}</Link>
        </H>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-navy/10 pt-4 text-sm">
          {p.startingPrice != null && <div><dt className="text-xs text-muted">{s.project.from}</dt><dd className="font-semibold">{formatPrice(p.startingPrice)}</dd></div>}
          {p.possessionDate && <div><dt className="text-xs text-muted">{s.project.possession}</dt><dd className="font-semibold">{new Date(p.possessionDate).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { month: "short", year: "numeric" })}</dd></div>}
          {p.unitTypes > 0 && <div><dt className="text-xs text-muted">{s.project.units}</dt><dd className="font-semibold">{p.unitTypes}</dd></div>}
        </dl>
      </div>
    </li>
  );
}
