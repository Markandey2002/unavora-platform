import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/staff/Flash";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";

export const metadata: Metadata = { title: "Homepage & pages" };
type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> };

/** Editable website blocks with their workflow state (cms.manage). */
export default async function SiteBlocksPage({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const rows = handle(lang, await staffApi.cmsBlocks(session));
  if (isError(rows)) return <p role="alert" data-testid="not-permitted">{rows.status === 403 ? t.notPermitted : (t.errors[rows.error] ?? t.errors.generic)}</p>;
  const label = (k: string) => x.cms.blocks[k] ?? `${x.cms.seoFor}${k.slice(4)}`;
  return (
    <div className="space-y-4">
      <Link href={`/${lang}/staff/content`} className="text-sm underline">← {x.staff.content}</Link>
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{x.cms.site}</h1>
        <Link href={`/${lang}/staff/preview`} className="inline-flex min-h-11 items-center rounded-lg border border-navy px-4 font-semibold" target="_blank">{x.cms.preview} ↗</Link>
      </div>
      <p className="text-sm text-slate">{x.cms.workflow}</p>
      <ul className="grid gap-2" data-testid="block-list">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate/20 bg-white p-3">
            <Link href={`/${lang}/staff/content/site/${r.key}`} className="font-semibold underline">{label(r.key)}</Link>
            <span className="flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-gold/30 px-2 py-0.5 font-semibold">{x.cms.status[r.status] ?? r.status}</span>
              <span className={`rounded px-2 py-0.5 ${r.live ? "bg-navy text-ivory" : "bg-slate/10"}`}>{r.live ? x.cms.live : x.cms.notLive}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
