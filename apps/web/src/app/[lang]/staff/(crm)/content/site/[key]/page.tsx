import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/staff/Flash";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getSiteDictionary } from "@/i18n/site";
import { getStaffDictionary } from "@/i18n/staff";
import { can, staffApi, type MediaItem } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { blockAction, saveBlock } from "../../../cms-actions";

export const metadata: Metadata = { title: "Website block" };
type Props = { params: Promise<{ lang: string; key: string }>; searchParams: Promise<Record<string, string | undefined>> };
type Json = Record<string, unknown>;
const KEY = /^(home\.(hero|tiles|sections)|careers\.page|seo\.[a-z-]{2,40})$/;
const SECTIONS = ["launches", "featured", "categories", "locations", "why", "about", "owner", "partner", "insights", "videos", "testimonials", "associations", "enquiry"];

/** Editor for one website block: draft form, workflow buttons (submit / publish / unpublish) and history. */
export default async function BlockEditor({ params, searchParams }: Props) {
  const { lang, key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  if (!isLang(lang) || !KEY.test(key)) notFound();
  const sp = await searchParams;
  const { session, me } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const s = getSiteDictionary(lang);
  const c = x.cms;
  const [b, lib] = await Promise.all([staffApi.cmsBlock(session, key), staffApi.cmsLibrary(session)]);
  const block = handle(lang, b);
  if (isError(block)) return <p role="alert" data-testid="not-permitted">{block.status === 403 ? t.notPermitted : (t.errors[block.error] ?? t.errors.generic)}</p>;
  const images: MediaItem[] = lib.ok ? lib.data : [];
  const d = (block.draft ?? block.published ?? {}) as Json;
  const tx = (l: "en" | "hi", f: string) => String(((d[l] ?? {}) as Json)[f] ?? "");
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2";
  const card = "rounded-xl border border-slate/20 bg-white p-4";
  const hidden = <><input type="hidden" name="lang" value={lang} /><input type="hidden" name="key" value={key} /></>;
  const imageSelect = (name: string, value: string) => (
    <label className="block text-sm">{c.image}
      <select name={name} defaultValue={value} className={field}>
        <option value="">{c.noImage}</option>
        {images.map((m) => <option key={m.id} value={m.id}>{(m.altEn ?? m.id.slice(0, 8))} · {c.kinds[m.kind] ?? m.kind}{m.approvedAt ? "" : " (not approved)"}</option>)}
      </select>
    </label>
  );
  const langFields = (names: [string, string, number, boolean?][]) => (["en", "hi"] as const).map((l) => (
    <fieldset key={l} className="grid gap-3 rounded-lg bg-ivory p-3 sm:grid-cols-2">
      <legend className="px-1 text-sm font-semibold">{l === "en" ? x.crm.english : x.crm.hindi}</legend>
      {names.map(([f, label, max, long]) => (
        <label key={f} className={`block text-sm ${long ? "sm:col-span-2" : ""}`}>{label}
          {long ? <textarea name={`${l}.${f}`} maxLength={max} rows={4} defaultValue={tx(l, f)} className={field} />
            : <input name={`${l}.${f}`} maxLength={max} defaultValue={tx(l, f)} className={field} />}
        </label>
      ))}
    </fieldset>
  ));

  let form: React.ReactNode;
  if (key === "home.hero") {
    form = <>{langFields([["eyebrow", c.eyebrow, 80], ["title", c.title, 120], ["sub", c.sub, 300, true], ["primaryLabel", c.primaryLabel, 40], ["secondaryLabel", c.secondaryLabel, 40]])}{imageSelect("imageId", String(d.imageId ?? ""))}</>;
  } else if (key === "home.tiles") {
    const items = (d.items as Json[] | undefined) ?? [];
    form = (["residential", "commercial", "land", "office"] as const).map((k) => {
      const it = items.find((i) => i.key === k) ?? {};
      const en = (it.en ?? {}) as Json, hi = (it.hi ?? {}) as Json;
      return (
        <fieldset key={k} className="grid gap-3 rounded-lg bg-ivory p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold">{s.category[k].title}</legend>
          <input type="hidden" name="tileKey" value={k} />
          <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name={`visible.${k}`} defaultChecked={it.visible !== false} className="size-5" />{c.visible}</label>
          <label className="block text-sm">{x.crm.english} · {c.title}<input name="en.title" required maxLength={60} defaultValue={String(en.title ?? s.category[k].title)} className={field} /></label>
          <label className="block text-sm">{x.crm.english} · {c.body}<input name="en.body" maxLength={200} defaultValue={String(en.body ?? s.category[k].body)} className={field} /></label>
          <label className="block text-sm">{x.crm.hindi} · {c.title}<input name="hi.title" maxLength={60} defaultValue={String(hi.title ?? "")} className={field} /></label>
          <label className="block text-sm">{x.crm.hindi} · {c.body}<input name="hi.body" maxLength={200} defaultValue={String(hi.body ?? "")} className={field} /></label>
          {imageSelect("imageId", String(it.imageId ?? ""))}
        </fieldset>
      );
    });
  } else if (key === "home.sections") {
    const order = (d.order as string[] | undefined) ?? SECTIONS;
    const hiddenSet = new Set((d.hidden as string[] | undefined) ?? []);
    form = (
      <ol className="grid gap-2">
        {order.map((k, i) => (
          <li key={k} className="flex flex-wrap items-center gap-3 rounded-lg bg-ivory p-2">
            <input type="hidden" name="section" value={k} />
            <label className="text-sm">{c.order} <input name="order" type="number" min={1} max={20} defaultValue={i + 1} className="ml-1 min-h-11 w-20 rounded-lg border border-slate/40 px-2" /></label>
            <span className="min-w-48 font-semibold">{c.sections[k] ?? k}</span>
            {k !== "enquiry" && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name={`hidden.${k}`} defaultChecked={hiddenSet.has(k)} className="size-5" />{c.hidden}</label>}
          </li>
        ))}
      </ol>
    );
  } else if (key === "careers.page") {
    const jobs = [...((d.openings as Json[] | undefined) ?? []), {}, {}];
    form = <>
      {langFields([["title", c.title, 120], ["intro", c.intro, 2000, true]])}
      {jobs.map((j, i) => (
        <fieldset key={i} className="grid gap-3 rounded-lg border border-slate/20 p-3 sm:grid-cols-4">
          <legend className="px-1 text-sm font-semibold">{c.job} {i + 1}</legend>
          <input type="hidden" name="job.id" value={String(j.id ?? "")} />
          <label className="block text-sm sm:col-span-2">{c.title}<input name="job.title" maxLength={120} defaultValue={String(j.title ?? "")} className={field} /></label>
          <label className="block text-sm">{c.location}<input name="job.location" maxLength={100} defaultValue={String(j.location ?? "")} className={field} /></label>
          <label className="block text-sm">{c.type}
            <select name="job.type" defaultValue={String(j.type ?? "full_time")} className={field}>{Object.entries(x.careers.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label className="block text-sm sm:col-span-3">{c.description}<textarea name="job.description" maxLength={3000} rows={3} defaultValue={String(j.description ?? "")} className={field} /></label>
          <label className="block text-sm">{c.active}
            <select name="job.active" defaultValue={j.active === false ? "no" : "yes"} className={field}><option value="yes">{c.yes}</option><option value="no">{c.no}</option></select>
          </label>
        </fieldset>
      ))}
    </>;
  } else {
    form = <><p className="text-sm text-slate">{c.seoNote}</p>{langFields([["title", c.title, 70], ["description", c.description, 170, true]])}</>;
  }

  return (
    <div className="space-y-4">
      <Link href={`/${lang}/staff/content/site`} className="text-sm underline">← {c.site}</Link>
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{c.blocks[key] ?? `${c.seoFor}${key.slice(4)}`}</h1>
        <span className="rounded bg-gold/30 px-2 py-0.5 text-sm font-semibold" data-testid="block-status">{c.status[block.status] ?? block.status}</span>
        <span className={`rounded px-2 py-0.5 text-sm ${block.published ? "bg-navy text-ivory" : "bg-slate/10"}`}>{block.published ? c.live : c.notLive}</span>
      </div>
      <p className="text-xs text-slate">{c.workflow}</p>
      <form action={saveBlock} className={`${card} grid gap-4`} data-testid="block-form">
        {hidden}
        {form}
        <button className="min-h-11 justify-self-start rounded-lg bg-navy px-6 font-semibold text-ivory">{c.saveDraft}</button>
      </form>
      <form action={blockAction} className="flex flex-wrap gap-2">
        {hidden}
        {block.status === "draft" && <button name="action" value="submit" className="min-h-11 rounded-lg border border-navy px-4 font-semibold">{c.submit}</button>}
        {can(me, "cms.publish") && block.draft && <button name="action" value="publish" className="min-h-11 rounded-lg bg-gold px-4 font-semibold text-navy">{c.publish}</button>}
        {can(me, "cms.publish") && block.published && <button name="action" value="unpublish" className="min-h-11 rounded-lg border border-red-700 px-4 text-red-800">{c.unpublish}</button>}
        {key.startsWith("home.") && <Link href={`/${lang}/staff/preview`} target="_blank" className="inline-flex min-h-11 items-center rounded-lg border border-slate/40 px-4">{c.preview} ↗</Link>}
      </form>
      {block.history.length > 0 && (
        <section className={card}>
          <h2 className="font-semibold">{c.history}</h2>
          <ol className="mt-2 grid gap-1 text-sm">{block.history.map((h, i) => <li key={i}>{new Date(h.at).toLocaleString(lang === "hi" ? "hi-IN" : "en-IN")} · {h.action.replace("cms.block.", "")}{h.by ? ` · ${h.by}` : ""}</li>)}</ol>
        </section>
      )}
    </div>
  );
}
