import Link from "next/link";
import { notFound } from "next/navigation";
import { isLang } from "@/i18n/dictionaries";
import { fmtDateTime, getStaffDictionary } from "@/i18n/staff";
import { staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Site visits" };

export default async function VisitsPage({
  params, searchParams,
}: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const scope = sp.scope === "today" || sp.scope === "past" ? sp.scope : "upcoming";
  const list = handle(lang, await staffApi.visits(session, { scope }));
  const tab = (value: string, label: string) => (
    <Link href={`/${lang}/staff/visits?scope=${value}`} aria-current={scope === value ? "page" : undefined}
      className={`min-h-11 content-center rounded-lg px-3 text-sm ${scope === value ? "bg-navy text-ivory" : "border border-slate/40"}`}>{label}</Link>
  );
  return (
    <section>
      <h1 className="text-2xl font-semibold">{t.visits}</h1>
      <div className="mt-4 flex flex-wrap gap-2">{tab("today", t.today)}{tab("upcoming", t.upcoming)}{tab("past", t.past)}</div>
      {isError(list) ? <p role="alert" className="mt-6">{t.errors[list.error] ?? t.errors.generic}</p>
        : list.length === 0 ? <p className="mt-6">{t.noVisits}</p> : (
          <ul data-testid="visit-list" className="mt-6 grid gap-3 md:grid-cols-2">
            {list.map((v) => (
              <li key={v.id} className="rounded-xl border border-slate/20 bg-white p-4">
                <Link href={`/${lang}/staff/visits/${v.id}`} className="block min-h-11">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{v.reference} · {v.customerName}</span>
                    <span className="rounded-full bg-navy/10 px-3 py-0.5 text-xs">{t.visitStatus[v.status] ?? v.status}</span>
                  </div>
                  <p className="mt-1 text-sm">{fmtDateTime(v.scheduledAt, lang)} · {v.propertyTitle ?? "—"}</p>
                  <p className="mt-1 text-sm text-slate">{v.leadReference} · {v.assignedUserName ?? "—"}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
