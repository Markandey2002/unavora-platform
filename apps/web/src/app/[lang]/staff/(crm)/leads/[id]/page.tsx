import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactActions } from "@/components/staff/ContactActions";
import { Flash, istInput } from "@/components/staff/Flash";
import { FollowUpForm } from "@/components/staff/FollowUpForm";
import { isLang } from "@/i18n/dictionaries";
import { fmtDateTime, getStaffDictionary } from "@/i18n/staff";
import { can, staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { assignLead, changeStage, scheduleVisit } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead" };

export default async function LeadDetail({
  params, searchParams,
}: { params: Promise<{ lang: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { lang, id } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session, me } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const lead = handle(lang, await staffApi.lead(session, id));
  if (isError(lead)) {
    return <p role="alert" data-testid="not-found">{lead.status === 404 ? t.notFound : (t.errors[lead.error] ?? t.errors.generic)}</p>;
  }
  const canAssign = can(me, "lead.assign");
  const canVisitAll = can(me, "visit.manage_all");
  const [activities, customer, history, pipeline, visits, assignees] = await Promise.all([
    staffApi.leadActivities(session, id), staffApi.customer(session, lead.customerId), staffApi.leadHistory(session, id),
    staffApi.pipeline(session), staffApi.visits(session, { scope: "all", leadId: id }),
    canAssign || canVisitAll ? staffApi.assignees(session) : Promise.resolve(null),
  ]);
  const c = customer.ok ? customer.data : null;
  const stageName = (code: string | null): string => {
    if (!code) return "—";
    const fromPipeline = pipeline.ok ? pipeline.data.stages.find((s) => s.code === code)?.name : undefined;
    return t.stages[code] ?? fromPipeline ?? code;
  };
  const closed = lead.outcome !== "open";
  const targets = pipeline.ok
    ? pipeline.data.transitions.filter((x) => x.from === lead.stage)
        .filter((x) => !closed || can(me, "lead.reopen"))
        .filter((x) => !pipeline.data.stages.find((s) => s.code === x.to)?.requiresCompletedDeal)
    : [];
  const returnTo = `/${lang}/staff/leads/${id}`;
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2";
  const card = "rounded-xl border border-slate/20 bg-white p-4";
  const people = assignees?.ok ? assignees.data : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Link href={`/${lang}/staff/leads`} className="text-sm underline">← {t.back}</Link>
        <Flash saved={sp.saved} error={sp.error} t={t} />
        <h1 data-testid="lead-reference" className="text-2xl font-semibold">{lead.reference}</h1>
        <dl className={`${card} grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm`}>
          <dt className="text-slate">{t.stage}</dt><dd data-testid="lead-stage">{stageName(lead.stage)}</dd>
          <dt className="text-slate">{t.type}</dt><dd>{lead.enquiryType}</dd>
          <dt className="text-slate">{t.property}</dt><dd>{lead.propertyTitle ?? "—"}</dd>
          <dt className="text-slate">{t.priority}</dt><dd>{lead.priority}</dd>
          <dt className="text-slate">{t.created}</dt><dd>{fmtDateTime(lead.createdAt, lang)}</dd>
          <dt className="text-slate">{t.nextAction}</dt><dd>{lead.nextActionAt ? `${fmtDateTime(lead.nextActionAt, lang)} ${lead.nextActionNote ?? ""}` : "—"}</dd>
          <dt className="text-slate">{t.assignee}</dt><dd data-testid="lead-assignee">{lead.assignedUserName ?? t.unassigned}</dd>
        </dl>

        {can(me, "lead.update") && (
          <section className={card}>
            <h2 className="font-semibold">{t.changeStage}</h2>
            {targets.length === 0 ? <p className="mt-2 text-sm">{t.noTransitions}</p> : (
              <form action={changeStage} data-testid="stage-form" className="mt-3 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="lang" value={lang} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <input type="hidden" name="leadId" value={id} />
                <input type="hidden" name="version" value={lead.version} />
                <label className="block text-sm">{t.moveTo}
                  <select name="toStage" required className={field}>
                    {targets.map((x) => <option key={x.to} value={x.to}>{stageName(x.to)}</option>)}
                  </select>
                </label>
                <label className="block text-sm">{t.lostReason}
                  <select name="reasonCode" defaultValue="" className={field}>
                    <option value="">—</option>
                    {pipeline.ok && pipeline.data.lostReasons.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                  </select>
                </label>
                <label className="block text-sm sm:col-span-2">{t.note}<textarea name="note" maxLength={1000} rows={2} className={field} /></label>
                <p className="text-xs text-slate sm:col-span-2">{t.stageHint}</p>
                <button className="min-h-12 rounded-lg bg-navy px-5 font-semibold text-ivory sm:col-span-2">{t.changeStage}</button>
              </form>
            )}
          </section>
        )}

        {canAssign && !closed && (
          <section className={card}>
            <h2 className="font-semibold">{t.reassign}</h2>
            <form action={assignLead} data-testid="assign-form" className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="leadId" value={id} />
              <input type="hidden" name="version" value={lead.version} />
              <label className="block text-sm">{t.assignTo}
                <select name="assigneeId" required className={field}>
                  {people.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <label className="block text-sm">{t.reasonLabel}<input name="reason" maxLength={1000} className={field} /></label>
              <button className="min-h-12 rounded-lg border border-navy px-5 font-semibold sm:col-span-2">{t.reassign}</button>
            </form>
          </section>
        )}

        <section className={card}>
          <h2 className="font-semibold">{t.visits}</h2>
          <ul data-testid="lead-visits" className="mt-2 space-y-2 text-sm">
            {visits.ok && visits.data.map((v) => (
              <li key={v.id}><Link className="underline" href={`/${lang}/staff/visits/${v.id}`}>{v.reference}</Link> · {fmtDateTime(v.scheduledAt, lang)} · {t.visitStatus[v.status] ?? v.status} · {v.assignedUserName ?? "—"}</li>
            ))}
            {visits.ok && visits.data.length === 0 && <li>{t.noVisits}</li>}
          </ul>
          {!closed && (can(me, "visit.manage_own") || canVisitAll) && (
            <form action={scheduleVisit} data-testid="schedule-form" className="mt-4 grid gap-3 border-t border-slate/20 pt-4 sm:grid-cols-2">
              <h3 className="font-semibold sm:col-span-2">{t.scheduleVisit}</h3>
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="leadId" value={id} />
              <label className="block text-sm">{t.visitTime}
                <input name="scheduledAt" type="datetime-local" required defaultValue={istInput(new Date(Date.now() + 26 * 3600_000))} className={field} />
              </label>
              {canVisitAll && (
                <label className="block text-sm">{t.assignee}
                  <select name="assigneeId" defaultValue={lead.assignedUserId ?? ""} className={field}>
                    {people.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              )}
              <label className="block text-sm sm:col-span-2">{t.locationNote}<input name="locationNote" maxLength={300} className={field} /></label>
              <button className="min-h-12 rounded-lg bg-navy px-5 font-semibold text-ivory sm:col-span-2">{t.schedule}</button>
            </form>
          )}
        </section>

        <section className={card}>
          <h2 className="font-semibold">{t.addFollowUp}</h2>
          <div className="mt-3"><FollowUpForm lang={lang} t={t} returnTo={returnTo} leadId={id} assignees={can(me, "task.manage_all") ? people : undefined} /></div>
        </section>

        <section className={card}>
          <h2 className="font-semibold">{t.stageHistory}</h2>
          <ol data-testid="stage-history" className="mt-2 space-y-2 text-sm">
            {history.ok && history.data.stages.map((h, i) => (
              <li key={i}>{stageName(h.fromStage)} → <b>{stageName(h.toStage)}</b> · {fmtDateTime(h.changedAt, lang)}{h.changedBy ? ` · ${t.by} ${h.changedBy}` : ""}{h.reason ? ` — ${h.reason}` : ""}</li>
            ))}
          </ol>
          <h2 className="mt-4 font-semibold">{t.assignmentHistory}</h2>
          <ol data-testid="assignment-history" className="mt-2 space-y-2 text-sm">
            {history.ok && history.data.assignments.map((a, i) => (
              <li key={i}>{a.previousUser ? `${a.previousUser} → ` : ""}<b>{a.assignedTo}</b> · {fmtDateTime(a.assignedAt, lang)}{a.assignedBy ? ` · ${t.by} ${a.assignedBy}` : ""}{a.reason ? ` — ${a.reason}` : ""}</li>
            ))}
          </ol>
        </section>

        <section className={card}>
          <h2 className="font-semibold">{t.timeline}</h2>
          {!activities.ok || activities.data.length === 0 ? <p className="mt-2 text-sm">{t.noActivity}</p> : (
            <ol data-testid="lead-timeline" className="mt-3 space-y-3 border-l-2 border-gold pl-4">
              {activities.data.map((a, i) => (
                <li key={i} className="text-sm"><p>{a.summary}</p><p className="text-xs text-slate">{fmtDateTime(a.occurredAt, lang)}{a.actorName ? ` · ${a.actorName}` : ""}</p></li>
              ))}
            </ol>
          )}
        </section>
      </div>
      <aside className="h-fit space-y-4 rounded-xl border border-slate/20 bg-white p-4">
        <h2 className="font-semibold">{t.customer}: {lead.customerName}</h2>
        <ContactActions phone={c?.customer.phone ?? lead.phone} whatsapp={c?.customer.whatsappVerified ? c.customer.whatsapp : null} t={t} />
        <Link href={`/${lang}/staff/customers/${lead.customerId}`} className="inline-flex min-h-11 items-center underline">{t.openCustomer}</Link>
      </aside>
    </div>
  );
}
