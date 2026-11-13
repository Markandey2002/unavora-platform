import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShowcaseCard } from "@/components/site/ShowcaseSection";
import { Flash } from "@/components/staff/Flash";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import type { ShowcaseItem } from "@/lib/api";
import { can, staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { saveShowcase, showcaseAction } from "../../../cms-actions";

export const metadata: Metadata = { title: "Showcase item" };
type Props = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> };

const PICKABLE = new Set(["representative", "actual_photo", "render", "editorial", "brand"]);

/**
 * Edit one showcase item: English/Hindi text, category, position, button, image (from the approved library), optional
 * link to a PUBLISHED real property/project; submit / publish / unpublish / archive; history; desktop and phone preview
 * rendered with the same card component as the website.
 */
export default async function ShowcaseEditPage({ params, searchParams }: Props) {
  const { lang, id } = await params;
  if (!isLang(lang) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const sp = await searchParams;
  const { session, me } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const c = x.cms, sc = x.cms.sc;
  const [itemR, libR, listingsR, projectsR] = await Promise.all([
    staffApi.showcaseItem(session, id), staffApi.cmsLibrary(session),
    staffApi.listings(session, { status: "published" }), staffApi.projects(session),
  ]);
  const it = handle(lang, itemR);
  if (isError(it)) {
    if (it.status === 404) notFound();
    return <p role="alert" data-testid="not-permitted">{it.status === 403 ? t.notPermitted : (t.errors[it.error] ?? t.errors.generic)}</p>;
  }
  const images = libR.ok ? libR.data.filter((m) => PICKABLE.has(m.kind) && m.scanStatus === "clean") : [];
  const listings = listingsR.ok ? listingsR.data.filter((p) => p.status === "published" && p.slug) : [];
  const projects = projectsR.ok ? projectsR.data.filter((p) => p.status === "published" && p.slug) : [];
  const archived = it.status === "archived";
  const canPublish = can(me, "cms.publish");
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2 text-sm";
  const link = it.linkedPropertyId ? `property:${it.linkedPropertyId}` : it.linkedProjectId ? `project:${it.linkedProjectId}` : "";

  // Preview = the website card built from this item's CURRENT (saved) content.
  const preview = (l: "en" | "hi"): ShowcaseItem => {
    const prop = listings.find((p) => p.id === it.linkedPropertyId), proj = projects.find((p) => p.id === it.linkedProjectId);
    const media = images.find((m) => m.id === it.imageMediaId);
    return {
      id: it.id, category: it.category, illustrative: true,
      title: (l === "hi" && it.titleHi) || it.titleEn, description: (l === "hi" && it.descriptionHi) || it.descriptionEn,
      image: { url: it.imageMediaId ? `/_bff/staff/cms-file?m=${it.imageMediaId}` : "", alt: media?.altEn ?? "", kind: it.imageKind ?? "representative", credit: media?.credit ?? "" },
      cta: it.cta === "view_record" && !prop && !proj ? "enquire" : it.cta,
      link: prop?.slug ? { type: "property", slug: prop.slug } : proj?.slug ? { type: "project", slug: proj.slug } : null,
    };
  };
  const enX = getExtraDictionary("en"), hiX = getExtraDictionary("hi");

  return (
    <div className="space-y-5">
      <Link href={`/${lang}/staff/content/showcase`} className="text-sm underline">← {c.showcase}</Link>
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="showcase-title">{it.titleEn}</h1>
        <span className="rounded bg-gold/30 px-2 py-0.5 text-xs font-semibold" data-testid="showcase-status">{archived ? sc.archived : c.status[it.status] ?? it.status}</span>
        {it.status === "published" && <span className="text-xs text-green-800">● {sc.live}</span>}
      </div>
      <p className="max-w-3xl text-sm text-slate">{sc.editNote}</p>

      <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
        <form action={saveShowcase} className="grid content-start gap-4 rounded-xl border border-slate/20 bg-white p-4 sm:grid-cols-2">
          <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={it.id} />
          <fieldset disabled={archived} className="contents">
            <label className="block text-sm">{sc.category}
              <select name="category" defaultValue={it.category} className={field}>{Object.entries(x.showcase.categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label className="block text-sm">{sc.sortOrder}<input name="sortOrder" type="number" min={0} max={999} defaultValue={it.sortOrder} className={field} /></label>
            <label className="block text-sm">{sc.titleEn}<input name="titleEn" required maxLength={90} defaultValue={it.titleEn} className={field} /></label>
            <label className="block text-sm" lang="hi">{sc.titleHi}<input name="titleHi" maxLength={90} defaultValue={it.titleHi ?? ""} className={field} /></label>
            <label className="block text-sm">{sc.descEn}<textarea name="descriptionEn" required maxLength={300} rows={3} defaultValue={it.descriptionEn} className={field} /></label>
            <label className="block text-sm" lang="hi">{sc.descHi}<textarea name="descriptionHi" maxLength={300} rows={3} defaultValue={it.descriptionHi ?? ""} className={field} /></label>
            <label className="block text-sm">{sc.cta}
              <select name="cta" defaultValue={it.cta} className={field}>{Object.entries(x.showcase.cta).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label className="block text-sm">{sc.link}
              <select name="link" defaultValue={link} className={field} data-testid="showcase-link">
                <option value="">{sc.noLink}</option>
                {listings.length > 0 && <optgroup label={sc.properties}>{listings.map((p) => <option key={p.id} value={`property:${p.id}`}>{p.title}{p.sample ? " [sample]" : ""}</option>)}</optgroup>}
                {projects.length > 0 && <optgroup label={sc.projects}>{projects.map((p) => <option key={p.id} value={`project:${p.id}`}>{p.name}{p.sample ? " [sample]" : ""}</option>)}</optgroup>}
              </select>
              <span className="mt-1 block text-xs text-slate">{sc.linkHelp}</span>
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="text-sm">{sc.image}</legend>
              <p className="text-xs text-slate">{sc.imageHelp} <Link href={`/${lang}/staff/content/library`} className="underline">{c.library}</Link>. {sc.replaceHint}</p>
              <div className="mt-2 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4" data-testid="showcase-images">
                {images.map((m) => (
                  <label key={m.id} className="relative block cursor-pointer rounded-lg border border-slate/30 p-1 has-[:checked]:border-navy has-[:checked]:ring-2 has-[:checked]:ring-navy">
                    <input type="radio" name="imageMediaId" value={m.id} defaultChecked={m.id === it.imageMediaId} className="sr-only" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/_bff/staff/cms-file?m=${m.id}`} alt={m.altEn ?? ""} className="aspect-[4/3] w-full rounded bg-sand object-cover" />
                    <span className="mt-1 block truncate text-[0.7rem]">{m.altEn ?? m.id.slice(0, 8)}</span>
                    <span className="block text-[0.65rem] text-slate">{m.kind}{m.approvedAt ? "" : ` · ${sc.notApproved}`}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="min-h-11 justify-self-start rounded-lg bg-navy px-5 font-semibold text-ivory">{c.save}</button>
          </fieldset>
        </form>

        <aside className="space-y-4">
          <form action={showcaseAction} className="flex flex-wrap gap-2 rounded-xl border border-slate/20 bg-white p-4">
            <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={it.id} />
            {(it.status === "draft" || it.status === "unpublished") && <button name="action" value="submit" className="min-h-10 rounded-lg border border-navy px-3 text-sm">{c.submit}</button>}
            {canPublish && !archived && it.status !== "published" && <button name="action" value="publish" className="min-h-10 rounded-lg bg-gold px-3 text-sm font-semibold text-navy">{c.publish}</button>}
            {canPublish && it.status === "published" && <button name="action" value="unpublish" className="min-h-10 rounded-lg border border-red-700 px-3 text-sm text-red-800">{c.unpublish}</button>}
            {canPublish && !archived && <button name="action" value="archive" className="min-h-10 rounded-lg border border-slate px-3 text-sm">{sc.archive}</button>}
          </form>

          <section className="rounded-xl border border-slate/20 bg-white p-4" data-testid="showcase-preview">
            <h2 className="font-semibold">{sc.preview}</h2>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate">{sc.desktop} · English</p>
            <div className="mt-2 w-[380px] max-w-full bg-ivory p-3"><ShowcaseCard as="div" lang="en" it={preview("en")} sc={enX.showcase} unoptimized /></div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate">{sc.mobile} · हिन्दी</p>
            <div className="mt-2 w-[300px] max-w-full bg-ivory p-2" lang="hi"><ShowcaseCard as="div" lang="hi" it={preview("hi")} sc={hiX.showcase} unoptimized /></div>
          </section>

          <section className="rounded-xl border border-slate/20 bg-white p-4">
            <h2 className="font-semibold">{sc.history}</h2>
            <ul className="mt-2 space-y-1 text-xs" data-testid="showcase-history">
              {(it.history ?? []).map((h, i) => <li key={i}>{new Date(h.at).toLocaleString(lang === "hi" ? "hi-IN" : "en-IN", { timeZone: "Asia/Kolkata" })} · {h.action.replace("cms.showcase.", "")} · {h.by || "—"}</li>)}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

