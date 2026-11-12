import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/staff/Flash";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { can, staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";

export const metadata: Metadata = { title: "Projects" };
type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> };

/** Projects / new launches (property.read_all to view, property.publish to change). */
export default async function StaffProjectsPage({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session, me } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const c = x.crm;
  const rows = handle(lang, await staffApi.projects(session));
  if (isError(rows)) return <p role="alert" data-testid="not-permitted">{rows.status === 403 ? t.notPermitted : (t.errors[rows.error] ?? t.errors.generic)}</p>;
  return (
    <div className="space-y-4">
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{c.projects}</h1>
        {can(me, "property.publish") && <Link href={`/${lang}/staff/projects/new`} className="inline-flex min-h-11 items-center rounded-lg bg-navy px-5 font-semibold text-ivory">{c.newProject}</Link>}
      </div>
      {rows.length === 0 ? <p className="text-slate">{c.none}</p> : (
        <ul className="grid gap-2" data-testid="project-list">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate/20 bg-white p-3">
              <div>
                <Link href={`/${lang}/staff/projects/${r.id}`} className="font-semibold underline">{r.name ?? `#${r.number}`}</Link>
                <p className="text-sm text-slate">{[r.locality, r.city].filter(Boolean).join(", ")}{r.constructionStatus ? ` · ${x.projectStatus[r.constructionStatus as "planned"] ?? r.constructionStatus}` : ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {r.sample && <span className="rounded border border-dashed border-red-700 px-1.5 py-0.5 font-semibold text-red-800">{c.sample}</span>}
                <span className="rounded bg-slate/10 px-1.5 py-0.5">{c.photos}: {r.approvedPhotos} {c.approvedPhotos}</span>
                <span className="rounded bg-gold/30 px-2 py-0.5 font-semibold">{c.status[r.status] ?? r.status}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
