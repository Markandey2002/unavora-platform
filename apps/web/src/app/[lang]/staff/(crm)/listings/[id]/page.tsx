import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/staff/Flash";
import { MediaManager } from "@/components/staff/MediaManager";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { can, staffApi, type ListingDetail } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { listingAction, reviewListing, saveListing } from "../../listing-actions";

export const metadata: Metadata = { title: "Listing" };
type Props = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> };

/** Listing editor + workflow + photographs. id = "new" creates a draft. */
export default async function ListingPage({ params, searchParams }: Props) {
  const { lang, id } = await params;
  const isNew = id === "new";
  if (!isLang(lang) || (!isNew && !/^[0-9a-f-]{36}$/.test(id))) notFound();
  const sp = await searchParams;
  const { session, me } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const c = getExtraDictionary(lang).crm;
  const [opts, loaded] = await Promise.all([staffApi.listingOptions(session), isNew ? Promise.resolve(null) : staffApi.listing(session, id)]);
  const o = handle(lang, opts);
  if (isError(o)) return <p role="alert" data-testid="not-permitted">{o.status === 403 ? t.notPermitted : (t.errors[o.error] ?? t.errors.generic)}</p>;
  let d: ListingDetail | null = null;
  if (loaded) {
    const r = handle(lang, loaded);
    if (isError(r)) return <p role="alert" data-testid="not-found">{r.status === 404 ? t.notFound : (t.errors[r.error] ?? t.errors.generic)}</p>;
    d = r;
  }
  if (isNew && !can(me, "property.create")) return <p role="alert" data-testid="not-permitted">{t.notPermitted}</p>;
  const editable = isNew || d!.canEdit;
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2 disabled:bg-slate/5";
  const card = "rounded-xl border border-slate/20 bg-white p-4";
  const hidden = <><input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={isNew ? "" : id} /></>;
  const v = (k: keyof ListingDetail) => (d && d[k] != null ? String(d[k]) : "");
  const cities = [...new Set(o.localities.map((l) => l.city))];

  return (
    <div className="space-y-4">
      <Link href={`/${lang}/staff/listings`} className="text-sm underline">← {c.listings}</Link>
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{d?.en?.title ?? c.newListing}</h1>
        {d && <span className="rounded bg-gold/30 px-2 py-0.5 text-sm font-semibold" data-testid="listing-status">{c.status[d.status] ?? d.status}</span>}
        {d?.isSample && <span className="rounded border border-dashed border-red-700 px-2 py-0.5 text-sm font-semibold text-red-800">{c.sample}</span>}
        {d?.status === "published" && d.en && <Link href={`/${lang}/properties/${d.en.slug}`} className="text-sm underline" target="_blank">↗ website</Link>}
      </div>
      {d?.submissionRef && <p className="text-sm">{c.fromSubmission}: <Link className="underline" href={`/${lang}/staff/submissions/${d.submissionId}`}>{d.submissionRef}</Link></p>}
      {d?.rejectionReason && d.status === "rejected" && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{c.rejected}: {d.rejectionReason}</p>}

      {d && (
        <section className={card} aria-labelledby="wf">
          <h2 id="wf" className="font-semibold">{c.workflow}</h2>
          <p className="mt-1 text-xs text-slate">{c.workflowNote}</p>
          <form action={listingAction} className="mt-3 flex flex-wrap gap-2">
            {hidden}
            {d.canSubmit && <button name="action" value="submit" className="min-h-11 rounded-lg bg-navy px-4 font-semibold text-ivory">{c.submit}</button>}
            {d.canPublish && <button name="action" value="publish" className="min-h-11 rounded-lg bg-gold px-4 font-semibold text-navy">{c.publish}</button>}
            {d.canUnpublish && <button name="action" value="unpublish" className="min-h-11 rounded-lg border border-navy px-4 font-semibold">{c.unpublish}</button>}
            {d.canUnpublish && <button name="action" value="sold" className="min-h-11 rounded-lg border border-slate/40 px-4">{c.sold}</button>}
          </form>
          {d.canReview && (
            <form action={reviewListing} className="mt-3 grid gap-2" data-testid="listing-review">
              {hidden}
              <label className="block text-sm">{c.reviewNote}<textarea name="note" maxLength={2000} rows={2} className={field} /></label>
              <div className="flex gap-2">
                <button name="decision" value="approved" className="min-h-11 rounded-lg bg-navy px-4 font-semibold text-ivory">{c.approve}</button>
                <button name="decision" value="rejected" className="min-h-11 rounded-lg border border-red-700 px-4 font-semibold text-red-800">{c.reject}</button>
              </div>
            </form>
          )}
        </section>
      )}

      <form action={saveListing} className={`${card} grid gap-4`} data-testid="listing-form">
        {hidden}
        <h2 className="font-semibold">{c.details}</h2>
        <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm">{c.type}
            <select name="typeCode" required defaultValue={v("typeCode")} className={field}><option value="" />{o.types.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select>
          </label>
          <label className="block text-sm">{c.locality}
            <select name="localityId" required defaultValue={v("localityId")} className={field}>
              <option value="" />
              {cities.map((city) => <optgroup key={city} label={city}>{o.localities.filter((l) => l.city === city).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>)}
            </select>
          </label>
          <label className="block text-sm">{c.purpose}
            <select name="purpose" defaultValue={v("purpose") || "sale"} className={field}><option value="sale">{c.sale}</option><option value="rent">{c.rent}</option></select>
          </label>
          <label className="block text-sm">{c.price}<input name="priceAmount" inputMode="numeric" defaultValue={v("priceAmount")} className={field} /></label>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" name="priceOnRequest" defaultChecked={d?.priceOnRequest} className="size-5" />{c.priceOnRequest}</label>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" name="priceNegotiable" defaultChecked={d?.priceNegotiable} className="size-5" />{c.negotiable}</label>
          <label className="block text-sm">{c.areaUnit}
            <select name="areaUnit" defaultValue={v("areaUnit") || "sq_ft"} className={field}>{["sq_ft", "sq_yd", "sq_m", "acre"].map((u) => <option key={u} value={u}>{u.replace("_", " ")}</option>)}</select>
          </label>
          <label className="block text-sm">{c.builtUp}<input name="builtUpArea" inputMode="decimal" defaultValue={v("builtUpArea")} className={field} /></label>
          <label className="block text-sm">{c.carpet}<input name="carpetArea" inputMode="decimal" defaultValue={v("carpetArea")} className={field} /></label>
          <label className="block text-sm">{c.plot}<input name="plotArea" inputMode="decimal" defaultValue={v("plotArea")} className={field} /></label>
          <label className="block text-sm">{c.bedrooms}<input name="bedrooms" type="number" min={0} max={50} defaultValue={v("bedrooms")} className={field} /></label>
          <label className="block text-sm">{c.bathrooms}<input name="bathrooms" type="number" min={0} max={50} defaultValue={v("bathrooms")} className={field} /></label>
          <label className="block text-sm">{c.parking}<input name="parkingSpaces" type="number" min={0} max={50} defaultValue={v("parkingSpaces")} className={field} /></label>
          <label className="block text-sm">{c.furnishing}
            <select name="furnishing" defaultValue={v("furnishing")} className={field}><option value="" />{["unfurnished", "semi_furnished", "furnished"].map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</select>
          </label>
          <label className="block text-sm">{c.possession}
            <select name="possessionStatus" defaultValue={v("possessionStatus")} className={field}><option value="" />{["ready_to_move", "under_construction", "upcoming"].map((x) => <option key={x} value={x}>{x.replaceAll("_", " ")}</option>)}</select>
          </label>
          <label className="block text-sm">{c.possessionDate}<input name="possessionDate" type="date" defaultValue={v("possessionDate")} className={field} /></label>
          <label className="block text-sm">{c.floor}<input name="floorNumber" type="number" defaultValue={v("floorNumber")} className={field} /></label>
          <label className="block text-sm">{c.totalFloors}<input name="totalFloors" type="number" defaultValue={v("totalFloors")} className={field} /></label>
          <label className="block text-sm">{c.project}
            <select name="projectId" defaultValue={v("projectId")} className={field}><option value="" />{o.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </label>
          {o.staff.length > 0 && (
            <label className="block text-sm">{c.assignee}
              <select name="ownerUserId" defaultValue={v("ownerUserId")} className={field}><option value="" />{o.staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            </label>
          )}
          <label className="block text-sm sm:col-span-2 lg:col-span-3">{c.address}<input name="addressLine" maxLength={300} defaultValue={v("addressLine")} className={field} /></label>
          <label className="block text-sm">{c.lat}<input name="latitude" inputMode="decimal" defaultValue={v("latitude")} className={field} /></label>
          <label className="block text-sm">{c.lon}<input name="longitude" inputMode="decimal" defaultValue={v("longitude")} className={field} /></label>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" name="showExactLocation" defaultChecked={d ? !d.hideExactLocation : false} className="size-5" />{c.showExact}</label>
          <fieldset className="sm:col-span-2 lg:col-span-3">
            <legend className="text-sm">{c.amenities}</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {o.amenities.map((a) => <label key={a.code} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="amenity" value={a.code} defaultChecked={d?.amenityCodes.includes(a.code)} className="size-5" />{a.name}</label>)}
            </div>
          </fieldset>
          {(["en", "hi"] as const).map((l) => (
            <fieldset key={l} className="grid gap-3 rounded-lg bg-ivory p-3 sm:col-span-2 lg:col-span-3 sm:grid-cols-2">
              <legend className="px-1 text-sm font-semibold">{l === "en" ? c.english : c.hindi}</legend>
              <label className="block text-sm">{c.title}<input name={`${l}Title`} required={l === "en"} maxLength={200} defaultValue={d?.[l]?.title ?? ""} className={field} /></label>
              <label className="block text-sm">{c.slug}<input name={`${l}Slug`} required={l === "en"} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={200} defaultValue={d?.[l]?.slug ?? ""} className={field} /></label>
              <label className="block text-sm sm:col-span-2">{c.description}<textarea name={`${l}Description`} rows={4} maxLength={5000} defaultValue={d?.[l]?.description ?? ""} className={field} /></label>
            </fieldset>
          ))}
        </fieldset>
        {editable && <button className="min-h-11 justify-self-start rounded-lg bg-navy px-6 font-semibold text-ivory">{c.save}</button>}
      </form>

      {d && <MediaManager lang={lang} owner="properties" ownerId={id} items={d.media} canUpload={can(me, "property.create") || can(me, "property.publish")} canApprove={d.canApproveMedia} x={getExtraDictionary(lang)} />}

      {d && d.history.length > 0 && (
        <section className={card} aria-labelledby="hist">
          <h2 id="hist" className="font-semibold">{c.history}</h2>
          <ol className="mt-2 grid gap-1 text-sm">
            {d.history.map((h, i) => (
              <li key={i}>{new Date(h.at).toLocaleString(lang === "hi" ? "hi-IN" : "en-IN")} · {h.from ? `${c.status[h.from] ?? h.from} → ` : ""}{c.status[h.to] ?? h.to}{h.by ? ` · ${h.by}` : ""}{h.note ? ` — ${h.note}` : ""}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
