import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/staff/Flash";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { formatPrice } from "@/lib/api";
import { staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { decideSubmission, reviewSubmission } from "../../content-actions";
import { convertSubmission } from "../../listing-actions";

export const metadata: Metadata = { title: "Owner submission" };
type Props = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function SubmissionPage({ params, searchParams }: Props) {
  const { lang, id } = await params;
  if (!isLang(lang) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const sp = await searchParams;
  const { session } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const d = handle(lang, await staffApi.submission(session, id));
  if (isError(d)) return <p role="alert" data-testid="not-found">{d.status === 404 ? t.notFound : (t.errors[d.error] ?? t.errors.generic)}</p>;
  const s = d.submission;
  const opts = d.canDecide && s.status === "approved" && !d.propertyId ? await staffApi.listingOptions(session) : null;
  const localities = opts?.ok ? opts.data.localities : [];
  const card = "rounded-xl border border-slate/20 bg-white p-4";
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2";
  const hidden = <><input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={id} /></>;
  return (
    <div className="space-y-4">
      <Link href={`/${lang}/staff/submissions`} className="text-sm underline">← {t.back}</Link>
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <section className={card}>
        <h1 className="text-2xl font-semibold" data-testid="submission-reference">{s.leadReference}</h1>
        <p className="mt-1"><span className="rounded bg-gold/30 px-2 py-0.5 text-sm" data-testid="submission-status">{x.staff.subStatus[s.status] ?? s.status}</span></p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate">{x.staff.owner}</dt><dd>{s.ownerName}{d.phone ? ` · ${d.phone}` : ""}{d.email ? ` · ${d.email}` : ""}</dd>
          <dt className="text-slate">{t.property}</dt><dd>{s.propertyType} · {s.purpose} · {[s.locality, s.city].filter(Boolean).join(", ")}</dd>
          {s.expectedPrice != null && <><dt className="text-slate">₹</dt><dd>{formatPrice(s.expectedPrice)}</dd></>}
          {s.area != null && <><dt className="text-slate">Area</dt><dd>{s.area} {s.areaUnit}</dd></>}
          <dt className="text-slate">CRM</dt><dd><Link className="underline" href={`/${lang}/staff/leads/${s.leadId}`}>{s.leadReference}</Link>{s.assignedUserName ? ` · ${s.assignedUserName}` : ` · ${t.unassigned}`}</dd>
        </dl>
        {d.message && <p className="mt-3 whitespace-pre-line text-sm">{d.message}</p>}
      </section>
      <section className={card}>
        <h2 className="font-semibold">{x.staff.photos} ({d.photos.length})</h2>
        {d.photos.some((p) => p.scanStatus !== "clean") && <p className="mt-1 text-xs text-red-800">{x.staff.notScanned}</p>}
        <ul className="mt-2 grid gap-1 text-sm">
          {d.photos.map((p) => (
            <li key={p.id}><a className="underline" target="_blank" rel="noopener" href={`/_bff/staff/submission-file?s=${id}&f=${p.id}`}>{p.name}</a> · {Math.round(p.size / 1024)} KB · <span data-testid="photo-scan">{x.crm.scan[p.scanStatus] ?? p.scanStatus}</span></li>
          ))}
        </ul>
      </section>
      <section className={card}>
        <h2 className="font-semibold">{x.staff.reviewTitle}</h2>
        {d.reviewNote ? <p className="mt-2 text-sm">{d.reviewNote} <span className="text-slate">— {d.reviewedBy}</span></p>
          : d.canReview && s.status === "submitted" ? (
            <form action={reviewSubmission} className="mt-2 grid gap-3" data-testid="review-form">
              {hidden}
              <label className="block text-sm">{x.staff.reviewNote}<textarea name="note" required maxLength={2000} rows={2} className={field} /></label>
              <button className="min-h-11 justify-self-start rounded-lg bg-navy px-5 font-semibold text-ivory">{x.staff.markReviewed}</button>
            </form>
          ) : <p className="mt-2 text-sm text-slate">—</p>}
      </section>
      <section className={card}>
        <h2 className="font-semibold">{x.staff.decisionTitle}</h2>
        <p className="mt-1 text-xs text-slate">{x.staff.approvedNote}</p>
        {d.decisionNote ? <p className="mt-2 text-sm">{d.decisionNote} <span className="text-slate">— {d.decidedBy}</span></p>
          : d.canDecide && s.status === "reviewed" ? (
            <form action={decideSubmission} className="mt-2 grid gap-3" data-testid="decision-form">
              {hidden}
              <label className="block text-sm">{x.staff.decisionNote}<textarea name="note" required maxLength={2000} rows={2} className={field} /></label>
              <div className="flex gap-3">
                <button name="decision" value="approved" className="min-h-11 rounded-lg bg-navy px-5 font-semibold text-ivory">{x.staff.approve}</button>
                <button name="decision" value="rejected" className="min-h-11 rounded-lg border border-red-700 px-5 font-semibold text-red-800">{x.staff.reject}</button>
              </div>
            </form>
          ) : <p className="mt-2 text-sm text-slate">—</p>}
      </section>
      {d.propertyId ? (
        <section className={card} data-testid="converted">
          <h2 className="font-semibold">{x.crm.convertedTo}</h2>
          <p className="mt-2 text-sm"><Link className="underline" href={`/${lang}/staff/listings/${d.propertyId}`}>{x.crm.convertedTo} →</Link></p>
        </section>
      ) : d.canDecide && s.status === "approved" && localities.length > 0 ? (
        <form action={convertSubmission} className={`${card} grid gap-3`} data-testid="convert-form">
          {hidden}
          <h2 className="font-semibold">{x.crm.convert}</h2>
          <p className="text-xs text-slate">{x.crm.convertNote}</p>
          <label className="block text-sm">{x.crm.chooseLocality}
            <select name="localityId" required className={field} defaultValue={localities.find((l) => l.city.toLowerCase() === s.city.toLowerCase() && s.locality && l.name.toLowerCase() === s.locality.toLowerCase())?.id ?? ""}>
              <option value="" />
              {localities.map((l) => <option key={l.id} value={l.id}>{l.name}, {l.city}</option>)}
            </select>
          </label>
          {d.photos.length > 0 && (
            <fieldset>
              <legend className="text-sm">{x.crm.carryPhotos}</legend>
              {d.photos.map((p) => (
                <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" name="fileId" value={p.id} disabled={p.scanStatus !== "clean"} defaultChecked={p.scanStatus === "clean"} className="size-5" />
                  {p.name} · {x.crm.scan[p.scanStatus] ?? p.scanStatus}
                </label>
              ))}
            </fieldset>
          )}
          <button className="min-h-11 justify-self-start rounded-lg bg-navy px-5 font-semibold text-ivory">{x.crm.convert}</button>
        </form>
      ) : null}
    </div>
  );
}
