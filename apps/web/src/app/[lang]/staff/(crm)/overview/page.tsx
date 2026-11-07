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
    </section>
  );
}
