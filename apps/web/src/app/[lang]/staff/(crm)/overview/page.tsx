import { notFound } from "next/navigation";
import { isLang } from "@/i18n/dictionaries";
import { getStaffDictionary } from "@/i18n/staff";
import { can, staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Director overview" };

export default async function OverviewPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const { session, me } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  // UI gate for clarity only; the API enforces report.director AND director MFA on the call below.
  if (!can(me, "report.director")) return <p role="alert" data-testid="not-permitted">{t.notPermitted}</p>;
  const o = handle(lang, await staffApi.overview(session));
  if (isError(o)) return <p role="alert" data-testid="not-permitted">{o.status === 403 ? t.notPermitted : (t.errors[o.error] ?? t.errors.generic)}</p>;

  const max = Math.max(1, ...o.leadsByStage.map((s) => s.count));
  const tile = (label: string, value: string, testId: string) => (
    <div className="rounded-xl border border-slate/20 bg-white p-4">
      <p className="text-sm text-slate">{label}</p>
      <p data-testid={testId} className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
  return (
    <section>
      <h1 className="text-2xl font-semibold">{t.overview}</h1>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tile(t.totalLeads, String(o.totalLeads), "kpi-total")}
        {tile(t.newLeads, String(o.newLast7Days), "kpi-new")}
        {tile(t.unassignedLeads, String(o.unassigned), "kpi-unassigned")}
        {tile(t.published, String(o.publishedProperties), "kpi-published")}
        {tile(t.firstResponse, o.avgFirstResponseMinutes == null ? "—" : `${Math.round(o.avgFirstResponseMinutes)} ${t.minutes}`, "kpi-response")}
      </div>
      <section className="mt-6 rounded-xl border border-slate/20 bg-white p-4">
        <h2 className="font-semibold">{t.funnel}</h2>
        <ul data-testid="stage-funnel" className="mt-3 space-y-2">
          {o.leadsByStage.map((s) => (
            <li key={s.stage} className="grid grid-cols-[minmax(8rem,12rem)_1fr_3rem] items-center gap-3 text-sm">
              <span>{t.stages[s.stage] ?? s.name}</span>
              <span className="h-3 rounded bg-navy/10" aria-hidden>
                <span className="block h-3 rounded bg-gold" style={{ width: `${(s.count / max) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums">{s.count}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate/20 bg-white p-4">
          <h2 className="font-semibold">{t.visitsSummary}</h2>
          <dl data-testid="visit-stats" className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate">{t.upcoming}</dt><dd data-testid="kpi-visits-upcoming" className="tabular-nums">{o.visits.upcoming}</dd>
            <dt className="text-slate">{t.completed30}</dt><dd className="tabular-nums">{o.visits.completedLast30Days}</dd>
            <dt className="text-slate">{t.cancelled30}</dt><dd className="tabular-nums">{o.visits.cancelledLast30Days}</dd>
            <dt className="text-slate">{t.noShow30}</dt><dd className="tabular-nums">{o.visits.noShowLast30Days}</dd>
          </dl>
        </section>
        <section className="rounded-xl border border-slate/20 bg-white p-4">
          <h2 className="font-semibold">{t.conversion}</h2>
          <dl data-testid="conversion" className="mt-3 grid grid-cols-[1fr_auto] gap-2 text-sm">
            <dt className="text-slate">{t.winRate}</dt><dd className="tabular-nums">{pct(o.conversion.winRate)}</dd>
            <dt className="text-slate">{t.visitConversion}</dt><dd className="tabular-nums">{pct(o.conversion.visitConversion)}</dd>
            <dt className="text-slate">{t.wonLost}</dt><dd className="tabular-nums">{o.conversion.won} / {o.conversion.lost} / {o.conversion.invalid}</dd>
          </dl>
        </section>
      </div>

      <section tabIndex={0} className="mt-6 overflow-x-auto rounded-xl border border-slate/20 bg-white p-4">
        <h2 className="font-semibold">{t.workload}</h2>
        <table data-testid="workload" className="mt-3 w-full min-w-[40rem] text-left text-sm">
          <thead><tr className="text-slate">
            <th className="py-1 pr-3">{t.employee}</th><th className="pr-3">{t.openLeads}</th><th className="pr-3">{t.openFollowUpsCol}</th>
            <th className="pr-3">{t.overdueCol}</th><th className="pr-3">{t.onTimeCol}</th><th>{t.upcomingVisitsCol}</th>
          </tr></thead>
          <tbody>
            {o.workload.map((w) => (
              <tr key={w.userId} className="border-t border-slate/20">
                <td className="py-1 pr-3">{w.name}</td><td className="pr-3 tabular-nums">{w.openLeads}</td>
                <td className="pr-3 tabular-nums">{w.openFollowUps}</td>
                <td className={`pr-3 tabular-nums ${w.overdueFollowUps > 0 ? "text-red-700" : ""}`}>{w.overdueFollowUps}</td>
                <td className="pr-3 tabular-nums">{w.completedOnTimeLast30Days}/{w.completedFollowUpsLast30Days} ({pct(w.onTimeRate)})</td>
                <td className="tabular-nums">{w.upcomingVisits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section tabIndex={0} className="mt-6 overflow-x-auto rounded-xl border border-slate/20 bg-white p-4">
        <h2 className="font-semibold">{t.pipelineByEmployee}</h2>
        <table data-testid="pipeline-by-employee" className="mt-3 w-full min-w-[30rem] text-left text-sm">
          <thead><tr className="text-slate"><th className="py-1 pr-3">{t.employee}</th><th className="pr-3">{t.stage}</th><th>#</th></tr></thead>
          <tbody>
            {o.leadsByEmployeeAndStage.map((r) => (
              <tr key={`${r.userId}-${r.stage}`} className="border-t border-slate/20">
                <td className="py-1 pr-3">{r.name}</td><td className="pr-3">{t.stages[r.stage] ?? r.stage}</td><td className="tabular-nums">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}

function pct(x: number | null): string {
  return x == null ? "—" : `${Math.round(x * 100)}%`;
}
