import Link from "next/link";
import { notFound } from "next/navigation";
import { isLang } from "@/i18n/dictionaries";
import { fmtDateTime, getStaffDictionary } from "@/i18n/staff";
import type { DashboardVisit } from "@/lib/staff";
import { staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const { session } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const d = handle(lang, await staffApi.dashboard(session));
  if (isError(d)) return <p role="alert">{t.errors[d.error] ?? t.errors.generic}</p>;
  const card = "rounded-xl border border-slate/20 bg-white p-4";
  const visitList = (items: DashboardVisit[], testId: string) => items.length === 0 ? <p className="mt-2 text-sm">{t.noVisits}</p> : (
    <ul data-testid={testId} className="mt-2 space-y-2 text-sm">
      {items.map((v) => (
        <li key={v.id}><Link className="underline" href={`/${lang}/staff/visits/${v.id}`}>{fmtDateTime(v.scheduledAt, lang)}</Link> · {v.customerName} · {v.propertyTitle ?? "—"} · {v.leadReference}</li>
      ))}
    </ul>
  );
  const tile = (label: string, value: number, testId: string, warn = false) => (
    <div className={card}><p className="text-sm text-slate">{label}</p><p data-testid={testId} className={`mt-1 text-3xl font-semibold tabular-nums ${warn && value > 0 ? "text-red-700" : ""}`}>{value}</p></div>
  );
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t.dashboard}</h1>
      <div className="grid grid-cols-3 gap-3">
        {tile(t.pending, d.followUps.pending, "fu-pending")}
        {tile(t.dueToday, d.followUps.dueToday, "fu-today")}
        {tile(t.overdue, d.followUps.overdue, "fu-overdue", true)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}><h2 className="font-semibold">{t.todaysVisits}</h2>{visitList(d.todaysVisits, "dash-today-visits")}</section>
        <section className={card}><h2 className="font-semibold">{t.upcomingVisits}</h2>{visitList(d.upcomingVisits, "dash-upcoming-visits")}</section>
        <section className={card}>
          <h2 className="font-semibold">{t.myPipeline}</h2>
          <ul data-testid="dash-pipeline" className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {d.myLeadsByStage.map((s) => (
              <li key={s.stage} className="flex justify-between gap-2">
                <Link className="underline" href={`/${lang}/staff/leads?stage=${s.stage}`}>{t.stages[s.stage] ?? s.name}</Link>
                <span className="tabular-nums">{s.count}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className={card}>
          <h2 className="font-semibold">{t.recentLeads}</h2>
          <ul data-testid="dash-recent" className="mt-2 space-y-1 text-sm">
            {d.recentlyUpdatedLeads.map((l) => (
              <li key={l.id}><Link className="underline" href={`/${lang}/staff/leads/${l.id}`}>{l.reference}</Link> · {l.customerName} · {t.stages[l.stage] ?? l.stage} · {fmtDateTime(l.updatedAt, lang)}</li>
            ))}
            {d.recentlyUpdatedLeads.length === 0 && <li>{t.noLeads}</li>}
          </ul>
        </section>
      </div>
    </section>
  );
}
