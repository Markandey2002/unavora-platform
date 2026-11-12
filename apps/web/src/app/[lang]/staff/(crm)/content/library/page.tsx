import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/staff/Flash";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { can, staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { imageAction, saveImage, uploadImage } from "../../cms-actions";

export const metadata: Metadata = { title: "Image library" };
type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> };

/** Site image library: upload -> scan -> metadata (alt, credit, licence) -> director approval. */
export default async function LibraryPage({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session, me } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const c = x.cms;
  const items = handle(lang, await staffApi.cmsLibrary(session));
  if (isError(items)) return <p role="alert" data-testid="not-permitted">{items.status === 403 ? t.notPermitted : (t.errors[items.error] ?? t.errors.generic)}</p>;
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2 text-sm";
  const kindSelect = (v?: string) => (
    <select name="kind" required defaultValue={v ?? ""} className={field}>
      <option value="" />{Object.entries(c.kinds).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
    </select>
  );
  return (
    <div className="space-y-4">
      <Link href={`/${lang}/staff/content`} className="text-sm underline">← {x.staff.content}</Link>
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <h1 className="text-2xl font-semibold">{c.library}</h1>
      <p className="text-sm text-slate">{c.libraryNote}</p>
      <form action={uploadImage} className="grid gap-3 rounded-xl border border-slate/20 bg-white p-4 sm:grid-cols-2" data-testid="library-upload">
        <input type="hidden" name="lang" value={lang} />
        <label className="block text-sm sm:col-span-2">{x.crm.file}<input type="file" name="file" required accept="image/jpeg,image/png,image/webp" className={field} /></label>
        <label className="block text-sm">{x.crm.kind}{kindSelect()}</label>
        <label className="block text-sm">{x.crm.alt}<input name="altEn" maxLength={250} className={field} /></label>
        <label className="block text-sm">{x.crm.credit}<input name="credit" maxLength={200} className={field} /></label>
        <label className="block text-sm">{x.crm.licence}<input name="licence" maxLength={200} className={field} /></label>
        <button className="min-h-11 justify-self-start rounded-lg bg-navy px-5 font-semibold text-ivory">{x.crm.upload}</button>
      </form>
      <ul className="grid gap-4 lg:grid-cols-2">
        {items.map((m) => (
          <li key={m.id} className="rounded-xl border border-slate/20 bg-white p-3" data-testid="library-item">
            <div className="flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/_bff/staff/cms-file?m=${m.id}`} alt={m.altEn ?? ""} className="size-24 shrink-0 rounded bg-sand object-cover" />
              <p className="flex flex-wrap content-start gap-1.5 text-xs">
                <span className={`rounded px-1.5 py-0.5 font-semibold ${m.scanStatus === "clean" ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{x.crm.scan[m.scanStatus] ?? m.scanStatus}</span>
                <span className={`rounded px-1.5 py-0.5 font-semibold ${m.public ? "bg-navy text-ivory" : "bg-slate/15"}`}>{m.public ? x.crm.live : x.crm.private}</span>
                <span className="rounded bg-slate/10 px-1.5 py-0.5">{c.kinds[m.kind] ?? m.kind}</span>
              </p>
            </div>
            <form action={saveImage} className="mt-3 grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="lang" value={lang} /><input type="hidden" name="mid" value={m.id} />
              <label className="block text-xs">{x.crm.kind}{kindSelect(m.kind)}</label>
              <label className="block text-xs">{x.crm.alt}<input name="altEn" defaultValue={m.altEn ?? ""} maxLength={250} className={field} /></label>
              <label className="block text-xs">{x.crm.altHi}<input name="altHi" defaultValue={m.altHi ?? ""} maxLength={250} className={field} /></label>
              <label className="block text-xs">{x.crm.caption}<input name="captionEn" defaultValue={m.captionEn ?? ""} maxLength={250} className={field} /></label>
              <label className="block text-xs">{x.crm.credit}<input name="credit" defaultValue={m.credit ?? ""} maxLength={200} className={field} /></label>
              <label className="block text-xs">{x.crm.licence}<input name="licence" defaultValue={m.licence ?? ""} maxLength={200} className={field} /></label>
              <button className="min-h-10 justify-self-start rounded-lg border border-navy px-4 text-sm font-semibold">{x.crm.save}</button>
            </form>
            <form action={imageAction} className="mt-2 flex flex-wrap gap-2">
              <input type="hidden" name="lang" value={lang} /><input type="hidden" name="mid" value={m.id} />
              {can(me, "cms.publish") && !m.public && <button name="action" value="approve" disabled={m.scanStatus !== "clean"} className="min-h-10 rounded-lg bg-navy px-3 text-sm font-semibold text-ivory disabled:opacity-40">{x.crm.approvePhoto}</button>}
              {can(me, "cms.publish") && m.public && <button name="action" value="unapprove" className="min-h-10 rounded-lg border border-navy px-3 text-sm">{x.crm.unapprove}</button>}
              <button name="action" value="delete" className="min-h-10 rounded-lg border border-red-700 px-3 text-sm text-red-800">{x.crm.delete}</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
