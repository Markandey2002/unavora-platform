import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnquiryForm } from "@/components/EnquiryForm";
import { PageHero } from "@/components/site/PageHero";
import { ProjectCard } from "@/components/site/ProjectCard";
import { typesByCategory } from "@/components/site/SearchPanel";
import { btn } from "@/components/site/ui";
import { getDictionary, isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getSiteDictionary } from "@/i18n/site";
import { getLocations, getProjects, type ProjectFilters } from "@/lib/api";
import { seoMeta } from "@/lib/seo";
import { cityLabel } from "@/lib/site";

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> };
const STATUSES = ["under_construction", "ready_to_move", "completed", "planned"] as const;
const CATEGORIES = ["residential", "commercial", "mixed_use", "land"] as const;
const TYPES = Object.values(typesByCategory).flat() as string[];
const PAGE = 12;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const x = getExtraDictionary(lang);
  // filtered/paged variants are not separate pages for search engines
  return seoMeta(lang, "/projects", x.launch.pageTitle, x.launch.pageSub, { noindex: Object.keys(await searchParams).length > 0 });
}

/**
 * New launches (published, approved projects only), newest first. Search by project, verified developer or location;
 * filters for status, category, property type and city; 12 per page. With nothing published: an honest empty state
 * and an interest form that creates a CRM lead. No project is ever invented to fill the page.
 */
export default async function NewLaunchesPage({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDictionary(lang);
  const s = getSiteDictionary(lang);
  const x = getExtraDictionary(lang);
  const sp = await searchParams;
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (allowed as readonly string[]).includes(v ?? "") ? (v as T) : undefined;
  const page = Math.max(1, Math.min(500, Number.parseInt(sp.page ?? "1", 10) || 1));
  const f: ProjectFilters = {
    status: pick(sp.status, STATUSES), category: pick(sp.category, CATEGORIES), type: pick(sp.type, TYPES),
    city: sp.city && sp.city.length <= 100 ? sp.city : undefined, q: sp.q?.trim().slice(0, 80) || undefined,
  };
  const filtered = Object.values(f).some(Boolean);
  const [result, any, locations] = await Promise.all([
    getProjects(lang, { ...f, limit: PAGE, offset: (page - 1) * PAGE }),
    filtered ? getProjects(lang, { limit: 1 }) : Promise.resolve(null),
    getLocations(lang).catch(() => []),
  ]);
  const publishedAtAll = (any ?? result).total > 0;
  const pages = Math.max(1, Math.ceil(result.total / PAGE));
  const cities = [...new Set(locations.map((l) => l.city))];
  const qs = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, page: undefined, ...over })) if (v) q.set(k, String(v));
    const str = q.toString();
    return `/${lang}/projects${str ? `?${str}` : ""}`;
  };
  const field = "mt-1 block min-h-12 w-full border border-navy/15 bg-white px-3 text-base";
  const lab = "block text-xs font-semibold uppercase tracking-[0.14em] text-muted [:lang(hi)_&]:tracking-normal";
  const chip = (active: boolean) => `inline-flex min-h-10 items-center border px-4 text-sm ${active ? "border-navy bg-navy text-ivory" : "border-navy/15 bg-white hover:border-navy"}`;
  const count = result.total === 1 ? x.launch.result1 : x.launch.results.replace("{n}", String(result.total));

  return (
    <>
      <PageHero lang={lang} home={s.detail.home} breadcrumbLabel={s.detail.breadcrumb} crumbs={[{ label: x.launch.pageTitle }]}
        eyebrow={x.launch.eyebrow} title={x.launch.pageTitle} sub={x.launch.pageSub} />
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {publishedAtAll ? (
          <>
            <form action={`/${lang}/projects`} method="get" role="search" aria-label={x.launch.pageTitle}
              className="grid gap-4 bg-white p-5 shadow-[var(--shadow-card)] sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
              <label className={lab}>{x.launch.search}
                <input type="search" name="q" defaultValue={f.q ?? ""} maxLength={80} className={field} />
              </label>
              <label className={lab}>{x.launch.category}
                <select name="category" defaultValue={f.category ?? ""} className={field}>
                  <option value="">{x.launch.any}</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{x.launch.categories[c]}</option>)}
                </select>
              </label>
              <label className={lab}>{x.launch.type}
                <select name="type" defaultValue={f.type ?? ""} className={field}>
                  <option value="">{x.launch.any}</option>
                  {TYPES.map((c) => <option key={c} value={c}>{s.types[c as keyof typeof s.types] ?? c}</option>)}
                </select>
              </label>
              <label className={lab}>{x.launch.city}
                <select name="city" defaultValue={f.city ?? ""} className={field}>
                  <option value="">{x.launch.any}</option>
                  {cities.map((c) => <option key={c} value={c}>{cityLabel(c, lang)}</option>)}
                </select>
              </label>
              {f.status && <input type="hidden" name="status" value={f.status} />}
              <button className={`${btn.navy} w-full lg:w-auto`}>{x.launch.apply}</button>
            </form>

            <nav aria-label={x.projectStatus.label} className="mt-6 flex flex-wrap gap-2">
              <Link href={qs({ status: undefined })} aria-current={!f.status ? "page" : undefined} className={chip(!f.status)}>{x.projectStatus.all}</Link>
              {STATUSES.map((st) => (
                <Link key={st} href={qs({ status: st })} aria-current={f.status === st ? "page" : undefined} className={chip(f.status === st)}>{x.projectStatus[st]}</Link>
              ))}
            </nav>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <p aria-live="polite" className="text-sm font-semibold">{count}</p>
              {filtered && <Link href={`/${lang}/projects`} className="text-sm underline underline-offset-4">{x.launch.clear}</Link>}
            </div>

            {result.items.length > 0 ? (
              <ul className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {result.items.map((p, i) => <ProjectCard key={p.id} p={p} lang={lang} s={s} x={x} headingLevel="h2" eager={i < 3} />)}
              </ul>
            ) : (
              <p className="mt-8 bg-white p-8 text-center text-muted">{x.launch.noMatch}</p>
            )}

            {pages > 1 && (
              <nav aria-label={x.launch.page.replace("{p}", String(page)).replace("{n}", String(pages))} className="mt-10 flex items-center justify-center gap-3">
                {page > 1 ? <Link href={qs({ page: String(page - 1) })} rel="prev" className={btn.outline}>{x.launch.prev}</Link> : <span className="min-w-24" />}
                <span className="text-sm">{x.launch.page.replace("{p}", String(page)).replace("{n}", String(pages))}</span>
                {page < pages ? <Link href={qs({ page: String(page + 1) })} rel="next" className={btn.outline}>{x.launch.next}</Link> : <span className="min-w-24" />}
              </nav>
            )}
          </>
        ) : (
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="font-display text-3xl font-semibold leading-snug">{x.launch.empty}</p>
              <p className="mt-4 max-w-lg leading-relaxed text-muted">{x.launch.emptyNote}</p>
              <Link href={`/${lang}/properties`} className={`${btn.outline} mt-8`}>{s.featured.viewAll}</Link>
            </div>
            <div className="bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
              <EnquiryForm lang={lang} t={t} f={s.form} variant="callback" context="new_launches" title={x.launch.emptyCta} id="project-interest" locationLabel={x.showcase.location} />
            </div>
          </div>
        )}
      </section>
    </>
  );
}
