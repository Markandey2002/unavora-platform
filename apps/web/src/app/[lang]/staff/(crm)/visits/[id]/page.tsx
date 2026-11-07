import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactActions } from "@/components/staff/ContactActions";
import { Flash, istInput } from "@/components/staff/Flash";
import { FollowUpForm } from "@/components/staff/FollowUpForm";
import { isLang } from "@/i18n/dictionaries";
import { fmtDateTime, getStaffDictionary } from "@/i18n/staff";
import { staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { visitAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Site visit" };

export default async function VisitDetailPage({
  params, searchParams,
}: { params: Promise<{ lang: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { lang, id } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const d = handle(lang, await staffApi.visit(session, id));
  if (isError(d)) return <p role="alert" data-testid="not-found">{d.status === 404 ? t.notFound : (t.errors[d.error] ?? t.errors.generic)}</p>;
  const v = d.visit;
  const active = v.status === "scheduled" || v.status === "confirmed";
  const started = v.scheduledAt != null && new Date(v.scheduledAt).getTime() <= Date.now();
  const returnTo = `/${lang}/staff/visits/${id}`;
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2";
  const card = "rounded-xl border border-slate/20 bg-white p-4";
  const hidden = (action: string) => (<>
    <input type="hidden" name="lang" value={lang} /><input type="hidden" name="returnTo" value={returnTo} />
    <input type="hidden" name="visitId" value={id} /><input type="hidden" name="version" value={v.version} />
    <input type="hidden" name="action" value={action} />
  </>);

  return (
    <div className="space-y-4">
      <Link href={`/${lang}/staff/visits`} className="text-sm underline">← {t.back}</Link>
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <section className={`${card} grid gap-4 md:grid-cols-[1fr_auto]`}>
        <div>
          <h1 data-testid="visit-reference" className="text-2xl font-semibold">{v.reference}</h1>
          <p className="mt-1"><span data-testid="visit-status" className="rounded-full bg-navy/10 px-3 py-0.5 text-sm">{t.visitStatus[v.status] ?? v.status}</span></p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate">{t.visitTime}</dt><dd data-testid="visit-time">{fmtDateTime(v.scheduledAt, lang)}</dd>
            <dt className="text-slate">{t.property}</dt><dd>{v.propertyTitle ?? "—"}</dd>
            <dt className="text-slate">{t.customer}</dt><dd>{v.customerName}</dd>
            <dt className="text-slate">{t.assignee}</dt><dd>{v.assignedUserName ?? "—"}</dd>
            <dt className="text-slate">{t.reference}</dt><dd><Link className="underline" href={`/${lang}/staff/leads/${v.leadId}`}>{v.leadReference}</Link></dd>
            {v.locationNote && <><dt className="text-slate">{t.locationNote}</dt><dd>{v.locationNote}</dd></>}
            {d.feedback && <><dt className="text-slate">{t.feedback}</dt><dd>{d.feedback}</dd></>}
            {d.interestAfter && <><dt className="text-slate">{t.interest}</dt><dd>{t.interestLevels[d.interestAfter] ?? d.interestAfter}</dd></>}
            {d.employeeNotes && <><dt className="text-slate">{t.employeeNotes}</dt><dd>{d.employeeNotes}</dd></>}
            {d.nextAction && <><dt className="text-slate">{t.nextActionField}</dt><dd>{d.nextAction}</dd></>}
          </dl>
        </div>
        <ContactActions phone={v.customerPhone} whatsapp={null} t={t} />
      </section>

      {active && (
        <div className="grid gap-4 lg:grid-cols-2">
          <form action={visitAction} data-testid="complete-form" className={`${card} grid gap-3`}>
            <h2 className="font-semibold">{t.completeVisit}</h2>
            {hidden("complete")}
            {!started && <p className="text-sm text-slate">{t.visitAfterTime}</p>}
            <label className="block text-sm">{t.feedback}<textarea name="feedback" maxLength={2000} rows={2} className={field} /></label>
            <label className="block text-sm">{t.interest}
              <select name="interestAfter" defaultValue="" className={field}>
                <option value="">—</option>{(["none", "low", "medium", "high"] as const).map((x) => <option key={x} value={x}>{t.interestLevels[x]}</option>)}
              </select>
            </label>
            <label className="block text-sm">{t.employeeNotes}<textarea name="employeeNotes" maxLength={2000} rows={2} className={field} /></label>
            <label className="block text-sm">{t.nextActionField}<input name="nextAction" maxLength={500} className={field} /></label>
            <button className="min-h-12 rounded-lg bg-navy px-5 font-semibold text-ivory">{t.completeVisit}</button>
          </form>
          <div className="space-y-4">
            <form action={visitAction} data-testid="reschedule-form" className={`${card} grid gap-3`}>
              <h2 className="font-semibold">{t.reschedule}</h2>
              {hidden("reschedule")}
              <label className="block text-sm">{t.visitTime}
                <input name="scheduledAt" type="datetime-local" required defaultValue={istInput(new Date(Date.now() + 50 * 3600_000))} className={field} />
              </label>
              <label className="block text-sm">{t.reasonLabel}<input name="reason" required minLength={3} maxLength={1000} className={field} /></label>
              <button className="min-h-12 rounded-lg border border-navy px-5 font-semibold">{t.reschedule}</button>
            </form>
            <form action={visitAction} data-testid="cancel-form" className={`${card} grid gap-3`}>
              <h2 className="font-semibold">{t.cancelVisit}</h2>
              {hidden("cancel")}
              <label className="block text-sm">{t.reasonLabel}<input name="reason" required minLength={3} maxLength={1000} className={field} /></label>
              <button className="min-h-12 rounded-lg border border-red-700 px-5 font-semibold text-red-800">{t.cancelVisit}</button>
            </form>
            <form action={visitAction} data-testid="no-show-form" className={`${card} grid gap-3`}>
              <h2 className="font-semibold">{t.noShow}</h2>
              {hidden("no-show")}
              <label className="block text-sm">{t.note}<input name="reason" maxLength={1000} className={field} /></label>
              <button className="min-h-12 rounded-lg border border-navy px-5 font-semibold">{t.noShow}</button>
            </form>
          </div>
        </div>
      )}

      <section className={card}>
        <h2 className="font-semibold">{t.addFollowUp}</h2>
        <div className="mt-3"><FollowUpForm lang={lang} t={t} returnTo={returnTo} siteVisitId={id} /></div>
      </section>

      <section className={card}>
        <h2 className="font-semibold">{t.visitHistory}</h2>
        <ol data-testid="visit-history" className="mt-2 space-y-2 text-sm">
          {d.history.map((h, i) => (
            <li key={i}>{h.fromStatus ? `${t.visitStatus[h.fromStatus] ?? h.fromStatus} → ` : ""}<b>{t.visitStatus[h.toStatus] ?? h.toStatus}</b>
              {h.fromScheduledAt && h.toScheduledAt && h.fromScheduledAt !== h.toScheduledAt ? ` · ${fmtDateTime(h.fromScheduledAt, lang)} → ${fmtDateTime(h.toScheduledAt, lang)}` : ""}
              {" · "}{fmtDateTime(h.changedAt, lang)}{h.changedBy ? ` · ${t.by} ${h.changedBy}` : ""}{h.reason ? ` — ${h.reason}` : ""}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
