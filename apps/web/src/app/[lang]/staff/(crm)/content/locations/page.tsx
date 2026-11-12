import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/staff/Flash";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { can, staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { saveLocation } from "../../content-actions";
import { saveLocalityPosition } from "../../listing-actions";

export const metadata: Metadata = { title: "City introductions" };
type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> };

/** Introductions for city pages (/locations/{city}); a city page exists only while it has published listings. */
export default async function LocationsAdmin({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session, me } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const rows = handle(lang, await staffApi.locations(session));
  if (isError(rows)) return <p role="alert" data-testid="not-permitted">{rows.status === 403 ? t.notPermitted : (t.errors[rows.error] ?? t.errors.generic)}</p>;
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2";
  const optsR = can(me, "property.publish") ? await staffApi.listingOptions(session) : null;
  const opts = optsR?.ok ? optsR.data : null;
  return (
    <div className="space-y-4">
      <Link href={`/${lang}/staff/content`} className="text-sm underline">← {x.staff.content}</Link>
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <h1 className="text-2xl font-semibold">{x.staff.locations}</h1>
      {rows.map((r) => (
        <form key={r.slug} action={saveLocation} className="grid gap-3 rounded-xl border border-slate/20 bg-white p-4 md:grid-cols-2">
          <input type="hidden" name="lang" value={lang} /><input type="hidden" name="slug" value={r.slug} />
          <h2 className="font-semibold md:col-span-2">{r.city} · {r.listings} {x.staff.listings}{r.published && <span className="ml-2 rounded bg-gold/30 px-2 py-0.5 text-xs">{x.staff.published}</span>}</h2>
          <label className="block text-sm">{x.staff.english} · {x.staff.titleF}<input name="enTitle" defaultValue={r.en?.title ?? ""} required maxLength={200} className={field} /></label>
          <label className="block text-sm">{x.staff.hindi} · {x.staff.titleF}<input name="hiTitle" defaultValue={r.hi?.title ?? ""} maxLength={200} className={field} /></label>
          <label className="block text-sm">{x.staff.english} · {x.staff.intro}<textarea name="enIntro" defaultValue={r.en?.intro ?? ""} required maxLength={5000} rows={4} className={field} /></label>
          <label className="block text-sm">{x.staff.hindi} · {x.staff.intro}<textarea name="hiIntro" defaultValue={r.hi?.intro ?? ""} maxLength={5000} rows={4} className={field} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={r.published} className="size-5" />{x.staff.published}</label>
          <button className="min-h-11 justify-self-start rounded-lg bg-navy px-5 font-semibold text-ivory">{x.staff.save}</button>
        </form>
      ))}
      {opts && opts.localities.length > 0 && (
        <section className="rounded-xl border border-slate/20 bg-white p-4" data-testid="locality-positions">
          <h2 className="font-semibold">{x.map.positions}</h2>
          <p className="mt-1 text-xs text-slate">{x.map.positionsNote}</p>
          <ul className="mt-3 grid gap-2">
            {opts.localities.map((loc) => (
              <li key={loc.id}>
                <form action={saveLocalityPosition} className="grid items-end gap-2 sm:grid-cols-[14rem_1fr_1fr_auto]">
                  <input type="hidden" name="lang" value={lang} /><input type="hidden" name="localityId" value={loc.id} />
                  <span className="text-sm font-semibold">{loc.name}, {loc.city}</span>
                  <label className="block text-xs">{x.crm.lat}<input name="latitude" inputMode="decimal" defaultValue={loc.latitude ?? ""} className={field} /></label>
                  <label className="block text-xs">{x.crm.lon}<input name="longitude" inputMode="decimal" defaultValue={loc.longitude ?? ""} className={field} /></label>
                  <button className="min-h-11 rounded-lg border border-navy px-4 text-sm font-semibold">{x.staff.save}</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
