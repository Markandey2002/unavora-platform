import Link from "next/link";
import { notFound } from "next/navigation";
import { isLang } from "@/i18n/dictionaries";
import { fmtDateTime, getStaffDictionary } from "@/i18n/staff";
import type { FollowUpItem } from "@/lib/staff";
import { staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { completeFollowUp } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "My follow-ups" };

/** Calendar day in India time, for grouping. */
const istDay = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

export default async function FollowUpsPage({
  params, searchParams,
}: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const items = handle(lang, await staffApi.followUps(session));
  if (isError(items)) return <p role="alert">{t.errors[items.error] ?? t.errors.generic}</p>;

  const today = istDay(new Date());
  const groups: [string, string, FollowUpItem[]][] = [
    ["overdue", t.overdue, items.filter((f) => f.overdue)],
    ["today", t.today, items.filter((f) => !f.overdue && istDay(new Date(f.dueAt)) === today)],
    ["upcoming", t.upcoming, items.filter((f) => !f.overdue && istDay(new Date(f.dueAt)) > today)],
  ];
  return (
    <section>
      <h1 className="text-2xl font-semibold">{t.myFollowUps}</h1>
      {sp.saved && <p role="status" className="mt-4 rounded-lg bg-gold/30 p-3">{t.saved}</p>}
      {sp.error && <p role="alert" className="mt-4 text-sm font-medium text-red-700">{t.errors[sp.error] ?? t.notFound}</p>}
      {items.length === 0 && <p className="mt-6">{t.noFollowUps}</p>}
      {groups.filter(([, , list]) => list.length > 0).map(([key, label, list]) => (
        <section key={key} className="mt-6" data-testid={`follow-ups-${key}`}>
          <h2 className={`font-semibold ${key === "overdue" ? "text-red-700" : ""}`}>{label} ({list.length})</h2>
          <ul className="mt-2 grid gap-3">
            {list.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate/20 bg-white p-4">
                <div>
                  <p className="font-semibold">{f.title} <span className={`ml-1 rounded px-2 py-0.5 text-xs ${f.priority === "high" ? "bg-red-100 text-red-800" : "bg-navy/10"}`}>{t.priorities[f.priority] ?? f.priority}</span></p>
                  <p className="text-sm text-slate">
                    {fmtDateTime(f.dueAt, lang)} · <Link className="underline" href={`/${lang}/staff/customers/${f.customerId}`}>{f.customerName}</Link>
                    {f.leadId && <> · <Link className="underline" href={`/${lang}/staff/leads/${f.leadId}`}>{f.leadReference}</Link></>}
                    {f.siteVisitId && <> · <Link className="underline" href={`/${lang}/staff/visits/${f.siteVisitId}`}>{f.siteVisitReference}</Link></>}
                  </p>
                  {f.description && <p className="mt-1 text-sm">{f.description}</p>}
                </div>
                <form action={completeFollowUp}>
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="followUpId" value={f.id} />
                  <button className="min-h-11 rounded-lg border border-navy px-4 font-semibold">{t.markDone}</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
