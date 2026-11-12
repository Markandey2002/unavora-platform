import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/staff/Flash";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { saveOffice, saveSetting } from "../../content-actions";

export const metadata: Metadata = { title: "Company facts" };
type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> };

/** Company facts the website may show (settings.manage). Only values marked verified ever appear publicly. */
export default async function CompanyAdmin({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const data = handle(lang, await staffApi.company(session));
  if (isError(data)) return <p role="alert" data-testid="not-permitted">{data.status === 403 ? t.notPermitted : (t.errors[data.error] ?? t.errors.generic)}</p>;
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2";
  const settings = data.settings.filter((s) => s.publicKey);
  return (
    <div className="space-y-4">
      <Link href={`/${lang}/staff/content`} className="text-sm underline">← {x.staff.content}</Link>
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <h1 className="text-2xl font-semibold">{x.staff.company}</h1>
      <p className="text-sm text-slate">{x.staff.companyNote}</p>
      <ul className="grid gap-2">
        {[...settings, ...(["company.phone", "company.whatsapp", "company.email", "company.hours", "social.instagram", "social.facebook", "social.linkedin", "social.youtube", "social.x"]
          .filter((k) => !settings.some((s) => s.key === k)).map((k) => ({ key: k, value: null, verified: false, publicKey: true })))].map((s) => (
          <li key={s.key}>
            <form action={saveSetting} className="grid items-end gap-3 rounded-xl border border-slate/20 bg-white p-3 sm:grid-cols-[12rem_1fr_auto_auto]">
              <input type="hidden" name="lang" value={lang} /><input type="hidden" name="key" value={s.key} />
              <span className="text-sm font-semibold">{s.key}</span>
              <label className="block text-sm"><span className="sr-only">{x.staff.value}</span><input name="value" defaultValue={s.value ?? ""} maxLength={500} className={field} /></label>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="verified" defaultChecked={s.verified} className="size-5" />{x.staff.verified}</label>
              <button className="min-h-11 rounded-lg bg-navy px-4 font-semibold text-ivory">{x.staff.save}</button>
            </form>
          </li>
        ))}
      </ul>
      <h2 className="pt-4 text-xl font-semibold">Offices</h2>
      {data.offices.map((o) => (
        <form key={o.id} action={saveOffice} className="grid gap-3 rounded-xl border border-slate/20 bg-white p-4 sm:grid-cols-2">
          <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={o.id} />
          <p className="font-semibold sm:col-span-2">{o.city}{o.locality ? `, ${o.locality}` : ""} · {o.kind}</p>
          <label className="block text-sm sm:col-span-2">{x.staff.address}<input name="address" defaultValue={o.address ?? ""} maxLength={500} className={field} /></label>
          <label className="block text-sm">{x.staff.pin}<input name="pinCode" defaultValue={o.pinCode ?? ""} pattern="\d{6}" className={field} /></label>
          <label className="block text-sm">{x.staff.phone}<input name="phone" defaultValue={o.phone ?? ""} className={field} /></label>
          <label className="block text-sm">{x.contactExtra.hours}<input name="hours" defaultValue={o.hours ?? ""} maxLength={200} className={field} /></label>
          <label className="block text-sm">{x.contactExtra.directions} (Google Maps / OpenStreetMap)<input name="directionsUrl" type="url" defaultValue={o.directionsUrl ?? ""} maxLength={500} className={field} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verified" defaultChecked={o.verified} className="size-5" />{x.staff.verified}</label>
          <button className="min-h-11 justify-self-start rounded-lg bg-navy px-5 font-semibold text-ivory">{x.staff.save}</button>
        </form>
      ))}
    </div>
  );
}
