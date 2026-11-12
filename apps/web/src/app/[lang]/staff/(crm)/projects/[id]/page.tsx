import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/staff/Flash";
import { MediaManager } from "@/components/staff/MediaManager";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { can, staffApi, type StaffProjectDetail } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { projectAction, saveProject } from "../../listing-actions";

export const metadata: Metadata = { title: "Project" };
type Props = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> };

/** Project editor (director). Every public fact has its own approval switch; id = "new" creates a draft. */
export default async function StaffProjectPage({ params, searchParams }: Props) {
  const { lang, id } = await params;
  const isNew = id === "new";
  if (!isLang(lang) || (!isNew && !/^[0-9a-f-]{36}$/.test(id))) notFound();
  const sp = await searchParams;
  const { session, me } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const c = x.crm;
  const [opts, loaded] = await Promise.all([staffApi.listingOptions(session), isNew ? Promise.resolve(null) : staffApi.project(session, id)]);
  const o = handle(lang, opts);
  if (isError(o)) return <p role="alert" data-testid="not-permitted">{o.status === 403 ? t.notPermitted : (t.errors[o.error] ?? t.errors.generic)}</p>;
  let d: StaffProjectDetail | null = null;
  if (loaded) {
    const r = handle(lang, loaded);
    if (isError(r)) return <p role="alert" data-testid="not-found">{r.status === 404 ? t.notFound : r.status === 403 ? t.notPermitted : (t.errors[r.error] ?? t.errors.generic)}</p>;
    d = r;
  }
  const editable = can(me, "property.publish");
  if (isNew && !editable) return <p role="alert" data-testid="not-permitted">{t.notPermitted}</p>;
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2";
  const card = "rounded-xl border border-slate/20 bg-white p-4";
  const hidden = <><input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={isNew ? "" : id} /></>;
  const units = [...(d?.units ?? []), { label: "", bedrooms: null, areaValue: null, areaUnit: null, basePrice: null }, { label: "", bedrooms: null, areaValue: null, areaUnit: null, basePrice: null }];
  const cities = [...new Set(o.localities.map((l) => l.city))];
  const check = (name: string, label: string, on?: boolean) => (
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={on} className="size-5" />{label}</label>
  );

  return (
    <div className="space-y-4">
      <Link href={`/${lang}/staff/projects`} className="text-sm underline">← {c.projects}</Link>
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{d?.en?.name ?? c.newProject}</h1>
        {d && <span className="rounded bg-gold/30 px-2 py-0.5 text-sm font-semibold" data-testid="project-status">{c.status[d.status] ?? d.status}</span>}
        {d?.sample && <span className="rounded border border-dashed border-red-700 px-2 py-0.5 text-sm font-semibold text-red-800">{c.sample}</span>}
        {d?.status === "published" && d.en && <Link href={`/${lang}/projects/${d.en.slug}`} className="text-sm underline" target="_blank">↗ website</Link>}
      </div>
      <p className="text-xs text-slate">{c.projectNote}</p>

      {d && editable && (
        <form action={projectAction} className="flex flex-wrap gap-2">
          {hidden}
          {d.status !== "published" && <button name="action" value="publish" className="min-h-11 rounded-lg bg-gold px-4 font-semibold text-navy">{c.publish}</button>}
          {d.status === "published" && <button name="action" value="unpublish" className="min-h-11 rounded-lg border border-navy px-4 font-semibold">{c.unpublish}</button>}
          {d.status !== "archived" && <button name="action" value="archive" className="min-h-11 rounded-lg border border-slate/40 px-4">{c.archive}</button>}
        </form>
      )}

      <form action={saveProject} className={`${card} grid gap-4`} data-testid="project-form">
        {hidden}
        <h2 className="font-semibold">{c.projectFacts}</h2>
        <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm">{c.locality}
            <select name="localityId" defaultValue={d?.localityId ?? ""} className={field}>
              <option value="" />
              {cities.map((city) => <optgroup key={city} label={city}>{o.localities.filter((l) => l.city === city).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>)}
            </select>
          </label>
          <label className="block text-sm">{c.category}
            <select name="category" defaultValue={d?.category ?? ""} className={field}><option value="" />{Object.entries(x.launch.categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label className="block text-sm">{c.primaryType}
            <select name="primaryTypeCode" defaultValue={d?.primaryTypeCode ?? ""} className={field}><option value="" />{o.types.map((ty) => <option key={ty.code} value={ty.code}>{ty.name}</option>)}</select>
          </label>
          <label className="block text-sm">{c.constructionStatus}
            <select name="constructionStatus" defaultValue={d?.constructionStatus ?? ""} className={field}>
              <option value="" />{(["planned", "under_construction", "ready_to_move", "completed"] as const).map((st) => <option key={st} value={st}>{x.projectStatus[st]}</option>)}
            </select>
          </label>
          <label className="block text-sm">{c.possessionDate}<input type="date" name="possessionDate" defaultValue={d?.possessionDate ?? ""} className={field} /></label>
          {check("possessionPublic", c.possessionPublic, d?.possessionPublic)}
          <label className="block text-sm">{c.developer}<input name="developerName" maxLength={200} defaultValue={d?.developerName ?? ""} className={field} /></label>
          {check("developerVerified", c.developerVerified, d?.developerVerified)}
          <span />
          <label className="block text-sm">{c.rera}<input name="reraNumber" maxLength={60} defaultValue={d?.reraNumber ?? ""} className={field} /></label>
          {check("reraVerified", c.reraVerified, d?.reraVerified)}
          {check("pricePublic", c.pricePublic, d?.pricePublic)}
          <fieldset className="sm:col-span-2 lg:col-span-3">
            <legend className="text-sm font-semibold">{c.units}</legend>
            <p className="text-xs text-slate">{c.addUnitNote}</p>
            <div className="mt-2 grid gap-2">
              {units.map((u, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-5">
                  <label className="block text-xs">{c.unitLabel}<input name="unitLabel" maxLength={100} defaultValue={u.label} className={field} /></label>
                  <label className="block text-xs">{c.bedrooms}<input name="unitBedrooms" type="number" min={0} max={50} defaultValue={u.bedrooms ?? ""} className={field} /></label>
                  <label className="block text-xs">{c.unitArea}<input name="unitArea" inputMode="decimal" defaultValue={u.areaValue ?? ""} className={field} /></label>
                  <label className="block text-xs">{c.areaUnit}
                    <select name="unitAreaUnit" defaultValue={u.areaUnit ?? "sq_ft"} className={field}>{["sq_ft", "sq_yd", "sq_m", "acre"].map((au) => <option key={au} value={au}>{au.replace("_", " ")}</option>)}</select>
                  </label>
                  <label className="block text-xs">{c.unitPrice}<input name="unitPrice" inputMode="numeric" defaultValue={u.basePrice ?? ""} className={field} /></label>
                </div>
              ))}
            </div>
          </fieldset>
          {(["en", "hi"] as const).map((l) => (
            <fieldset key={l} className="grid gap-3 rounded-lg bg-ivory p-3 sm:col-span-2 lg:col-span-3 sm:grid-cols-2">
              <legend className="px-1 text-sm font-semibold">{l === "en" ? c.english : c.hindi}</legend>
              <label className="block text-sm">{c.title}<input name={`${l}Name`} required={l === "en"} maxLength={200} defaultValue={d?.[l]?.name ?? ""} className={field} /></label>
              <label className="block text-sm">{c.slug}<input name={`${l}Slug`} required={l === "en"} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={200} defaultValue={d?.[l]?.slug ?? ""} className={field} /></label>
              <label className="block text-sm sm:col-span-2">{c.description}<textarea name={`${l}Description`} rows={4} maxLength={5000} defaultValue={d?.[l]?.description ?? ""} className={field} /></label>
            </fieldset>
          ))}
        </fieldset>
        {editable && <button className="min-h-11 justify-self-start rounded-lg bg-navy px-6 font-semibold text-ivory">{c.save}</button>}
      </form>

      {d && <MediaManager lang={lang} owner="projects" ownerId={id} items={d.media} canUpload={editable} canApprove={editable} x={x} />}
    </div>
  );
}
