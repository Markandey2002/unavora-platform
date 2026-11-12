import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";

export const metadata: Metadata = { title: "Owner submissions" };
type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> };
const STATUSES = ["submitted", "reviewed", "approved", "rejected"] as const;

/** Owner property submissions visible to the caller (director: all; employee: leads assigned to them). */
export default async function SubmissionsPage({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const rows = handle(lang, await staffApi.submissions(session, status));
  if (isError(rows)) return <p role="alert">{t.errors[rows.error] ?? t.errors.generic}</p>;
  const chip = (on: boolean) => `min-h-10 content-center rounded-lg border px-3 text-sm ${on ? "border-navy bg-navy text-ivory" : "border-slate/30 bg-white"}`;
  return (
    <section>
      <h1 className="text-2xl font-semibold">{x.staff.submissions}</h1>
      <nav className="mt-4 flex flex-wrap gap-2" aria-label={t.stage}>
        <Link href={`/${lang}/staff/submissions`} className={chip(!status)}>{t.allStages}</Link>
        {STATUSES.map((st) => <Link key={st} href={`/${lang}/staff/submissions?status=${st}`} className={chip(status === st)}>{x.staff.subStatus[st]}</Link>)}
      </nav>
      {rows.length === 0 ? <p className="mt-6">{x.staff.noSubmissions}</p> : (
        <ul className="mt-6 grid gap-3" data-testid="submission-list">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate/20 bg-white p-4">
              <Link href={`/${lang}/staff/submissions/${r.id}`} className="font-semibold underline-offset-4 hover:underline">{r.leadReference} · {r.ownerName}</Link>
              <span className="ml-2 rounded bg-gold/30 px-2 py-0.5 text-xs">{x.staff.subStatus[r.status] ?? r.status}</span>
              <p className="mt-1 text-sm text-slate">{r.propertyType} · {r.purpose} · {[r.locality, r.city].filter(Boolean).join(", ")} · {r.files} {x.staff.photos.toLowerCase()}
                {r.assignedUserName ? ` · ${t.assignee}: ${r.assignedUserName}` : ` · ${t.unassigned}`}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
