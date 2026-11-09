import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EnquiryForm } from "@/components/EnquiryForm";
import { PropertyArt, seedOf } from "@/components/site/Art";
import { PageHero } from "@/components/site/PageHero";
import { Icon } from "@/components/site/ui";
import { getDictionary, isLang } from "@/i18n/dictionaries";
import { getSiteDictionary } from "@/i18n/site";
import { formatPrice, getProject } from "@/lib/api";
import { jsonLd, pageMeta, siteUrl } from "@/lib/seo";
import { cityLabel } from "@/lib/site";

type Props = { params: Promise<{ lang: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLang(lang)) return {};
  const d = await getProject(lang, slug);
  return d ? pageMeta(lang, `/projects/${slug}`, d.summary.name, (d.description ?? d.summary.name).slice(0, 300)) : {};
}

/** Published project detail. RERA number appears only when the API returns it (business-verified). */
export default async function ProjectPage({ params }: Props) {
  const { lang, slug } = await params;
  if (!isLang(lang)) notFound();
  const d = await getProject(lang, slug);
  if (!d) notFound();
  const t = getDictionary(lang);
  const s = getSiteDictionary(lang);
  const p = d.summary;
  const place = [p.locality, p.city && cityLabel(p.city, lang)].filter(Boolean).join(", ");
  const facts: [string, string][] = [
    ...(p.constructionStatus ? [[s.project.status, s.project.statuses[p.constructionStatus] ?? p.constructionStatus] as [string, string]] : []),
    ...(p.possessionDate ? [[s.project.possession, new Date(p.possessionDate).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { month: "long", year: "numeric" })] as [string, string]] : []),
    ...(p.startingPrice != null ? [[s.project.from, formatPrice(p.startingPrice)] as [string, string]] : []),
    ...(p.reraNumber ? [[s.project.rera, p.reraNumber] as [string, string]] : []),
  ];
  const ld = {
    "@context": "https://schema.org", "@type": "Residence", name: p.name, url: `${siteUrl()}/${lang}/projects/${slug}`,
    ...(d.description ? { description: d.description } : {}),
    ...(place ? { address: { "@type": "PostalAddress", addressLocality: place, addressCountry: "IN" } } : {}),
  };
  return (
    <>
      <script {...jsonLd(ld)} />
      <PageHero lang={lang} home={s.detail.home} breadcrumbLabel={s.detail.breadcrumb}
        crumbs={[{ label: s.nav.projects, href: `/${lang}/projects` }, { label: p.name }]}
        eyebrow={s.launches.eyebrow} title={p.name} sub={place || undefined} />
      <section className="mx-auto max-w-7xl sm:px-6 lg:px-8">
        <figure className="relative aspect-[16/9] overflow-hidden bg-navy sm:mt-10 sm:aspect-[16/7]">
          <PropertyArt kind="tower" seed={seedOf(p.id)} wide label={`${s.card.illustration}: ${p.name}`} />
          <figcaption className="absolute bottom-3 left-4 bg-ivory/15 px-2 py-0.5 text-xs uppercase tracking-[0.16em] text-ivory/85 backdrop-blur">{s.card.illustration}</figcaption>
        </figure>
      </section>
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-14 lg:px-8">
        <article className="min-w-0">
          {facts.length > 0 && (
            <dl className={`grid grid-cols-2 border-l border-t border-navy/10 ${facts.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
              {facts.map(([k, v]) => (
                <div key={k} className="border-b border-r border-navy/10 p-4"><dt className="text-xs uppercase tracking-[0.14em] text-muted">{k}</dt><dd className="mt-1 font-semibold">{v}</dd></div>
              ))}
            </dl>
          )}
          {d.description && <p className="mt-10 max-w-3xl leading-relaxed text-navy/85">{d.description}</p>}
          <section aria-labelledby="units" className="mt-10">
            <h2 id="units" className="font-display text-2xl font-semibold">{s.project.units}</h2>
            {d.units.length === 0 ? <p className="mt-3 text-muted">{s.project.noUnits}</p> : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead><tr className="border-b border-navy/20 text-xs uppercase tracking-[0.12em] text-muted">
                    <th className="py-3 pr-4 font-semibold">{s.project.unit}</th><th className="py-3 pr-4 font-semibold">{s.detail.bedrooms}</th>
                    <th className="py-3 pr-4 font-semibold">{s.project.area}</th><th className="py-3 font-semibold">{s.project.price}</th>
                  </tr></thead>
                  <tbody>
                    {d.units.map((u) => (
                      <tr key={u.label} className="border-b border-navy/10">
                        <td className="py-3 pr-4 font-semibold">{u.label}</td>
                        <td className="py-3 pr-4">{u.bedrooms ?? "—"}</td>
                        <td className="py-3 pr-4">{u.areaValue != null ? `${Number(u.areaValue).toLocaleString("en-IN")} ${s.areaUnit[u.areaUnit ?? ""] ?? u.areaUnit ?? ""}` : "—"}</td>
                        <td className="py-3">{u.basePrice != null ? formatPrice(u.basePrice) : t.priceOnRequest}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {place && (
            <p className="mt-10 flex items-center gap-2 bg-sand/60 p-5 text-sm"><Icon name="pin" className="size-5 text-gold-700" />{place} · {s.detail.locationNote}</p>
          )}
        </article>
        <aside id="enquire" className="lg:sticky lg:top-24 lg:self-start">
          <div className="bg-white p-6 shadow-[var(--shadow-card)]">
            <EnquiryForm lang={lang} t={t} f={s.form} variant="callback" enquiryType="project" message={`Project: ${p.name} (#${p.number})`} title={s.project.enquire} id="project-enquiry" />
          </div>
        </aside>
      </div>
    </>
  );
}
