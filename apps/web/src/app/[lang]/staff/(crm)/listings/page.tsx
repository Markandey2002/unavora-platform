import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/staff/Flash";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { formatPrice } from "@/lib/api";
import { can, staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";

export const metadata: Metadata = { title: "Listings" };
type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> };
const STATUSES = ["draft", "pending_review", "approved", "rejected", "published", "withdrawn", "sold"];

/** Listings the signed-in user may see (all with property.read_all; otherwise own/assigned). */
export default async function ListingsPage({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session, me } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const c = getExtraDictionary(lang).crm;
  const status = STATUSES.includes(sp.status ?? "") ? sp.status : undefined;
  const rows = handle(lang, await staffApi.listings(session, { status, q: sp.q?.slice(0, 80) }));
  if (isError(rows)) return <p role="alert" data-testid="not-permitted">{rows.status === 403 ? t.notPermitted : (t.errors[rows.error] ?? t.errors.generic)}</p>;
  const field = "min-h-11 rounded-lg border border-slate/40 bg-white px-3";
  return (
    <div className="space-y-4">
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{c.listings}</h1>
        {can(me, "property.create") && <Link href={`/${lang}/staff/listings/new`} className="inline-flex min-h-11 items-center rounded-lg bg-navy px-5 font-semibold text-ivory">{c.newListing}</Link>}
      </div>
      <form className="flex flex-wrap gap-2" method="get">
        <select name="status" defaultValue={status ?? ""} className={field} aria-label="Status">
          <option value="">{c.any}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{c.status[s] ?? s}</option>)}
        </select>
        <input name="q" defaultValue={sp.q ?? ""} placeholder={c.search} aria-label={c.search} className={field} />
        <button className="min-h-11 rounded-lg border border-navy px-4 font-semibold">{c.search}</button>
      </form>
      {rows.length === 0 ? <p className="text-slate">{c.none}</p> : (
        <ul className="grid gap-2" data-testid="listing-list">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate/20 bg-white p-3">
              <div className="min-w-0">
                <Link href={`/${lang}/staff/listings/${r.id}`} className="font-semibold underline">{r.title ?? `#${r.number}`}</Link>
                <p className="text-sm text-slate">#{r.number} · {r.type} · {r.locality}, {r.city}{r.owner ? ` · ${r.owner}` : ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {r.sample && <span className="rounded border border-dashed border-red-700 px-1.5 py-0.5 font-semibold text-red-800">{c.sample}</span>}
                <span className="rounded bg-slate/10 px-1.5 py-0.5">{c.photos}: {r.approvedPhotos}/{r.photos} {c.approvedPhotos}</span>
                <span className="font-semibold">{r.priceOnRequest || r.price == null ? c.priceOnRequest : formatPrice(r.price)}</span>
                <span className="rounded bg-gold/30 px-2 py-0.5 font-semibold" data-testid="listing-status">{c.status[r.status] ?? r.status}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
