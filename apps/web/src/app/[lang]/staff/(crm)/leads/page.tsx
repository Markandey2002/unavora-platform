import Link from "next/link";
import { notFound } from "next/navigation";
import { isLang } from "@/i18n/dictionaries";
import { STAGE_CODES, fmtDateTime, getStaffDictionary } from "@/i18n/staff";
import { can, staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads" };

export default async function LeadsPage({
  params, searchParams,
}: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session, me } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const all = can(me, "lead.read_all");
  const stage = sp.stage && (STAGE_CODES as readonly string[]).includes(sp.stage) ? sp.stage : undefined;
  const assignee = all && (sp.assignee === "me" || sp.assignee === "unassigned") ? sp.assignee : undefined;
  const page = handle(lang, await staffApi.leads(session, { stage, assignee, cursor: sp.cursor }));
  const stageName = (code: string, fallback: string) => t.stages[code] ?? fallback;
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3";

  return (
    <section>
      <h1 className="text-2xl font-semibold">{t.leads}</h1>
      <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" method="get">
        <label className="block text-sm">{t.stage}
          <select name="stage" defaultValue={stage ?? ""} className={field}>
            <option value="">{t.allStages}</option>
            {STAGE_CODES.map((s) => <option key={s} value={s}>{stageName(s, s.replaceAll("_", " "))}</option>)}
          </select>
        </label>
        {all ? (
          <label className="block text-sm">{t.assignee}
            <select name="assignee" defaultValue={assignee ?? ""} className={field}>
              <option value="">{t.everyone}</option>
              <option value="me">{t.mine}</option>
              <option value="unassigned">{t.unassigned}</option>
            </select>
          </label>
        ) : <div />}
        <button className="min-h-11 rounded-lg bg-navy px-5 font-semibold text-ivory">{t.filter}</button>
      </form>

      {isError(page) ? (
        <p role="alert" className="mt-6 text-red-700">{t.errors[page.error] ?? t.errors.generic}</p>
      ) : page.items.length === 0 ? (
        <p className="mt-6">{t.noLeads}</p>
      ) : (
        <>
          <ul data-testid="lead-list" className="mt-6 grid gap-3">
            {page.items.map((l) => (
              <li key={l.id} className="rounded-xl border border-slate/20 bg-white p-4">
                <Link href={`/${lang}/staff/leads/${l.id}`} className="block min-h-11">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{l.reference} · {l.customerName}</span>
                    <span className="rounded-full bg-navy/10 px-3 py-0.5 text-xs">{stageName(l.stage, l.stageName)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate">
                    {l.propertyTitle ?? l.enquiryType} · {t.created} {fmtDateTime(l.createdAt, lang)}
                    {all && <> · {t.assignee}: {l.assignedUserName ?? t.unassigned}</>}
                  </p>
                  {l.nextActionAt && <p className="mt-1 text-sm">{t.nextAction}: {fmtDateTime(l.nextActionAt, lang)}{l.nextActionNote ? ` — ${l.nextActionNote}` : ""}</p>}
                </Link>
              </li>
            ))}
          </ul>
          {page.nextCursor && (
            <Link className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-navy px-4"
              href={`/${lang}/staff/leads?${new URLSearchParams({ ...(stage ? { stage } : {}), ...(assignee ? { assignee } : {}), cursor: page.nextCursor })}`}>
              {t.next}
            </Link>
          )}
        </>
      )}
    </section>
  );
}
