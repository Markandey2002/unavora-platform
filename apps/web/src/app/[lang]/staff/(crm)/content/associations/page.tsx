import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/staff/Flash";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { can, staffApi, type AssociationRow } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { associationAction, saveAssociation } from "../../cms-actions";

export const metadata: Metadata = { title: "Associations" };
type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> };

/** Associations: only confirmed relationships can be published; logos need recorded permission. */
export default async function AssociationsPage({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session, me } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const c = x.cms;
  const [rowsR, libR] = await Promise.all([staffApi.associations(session), staffApi.cmsLibrary(session)]);
  const rows = handle(lang, rowsR);
  if (isError(rows)) return <p role="alert" data-testid="not-permitted">{rows.status === 403 ? t.notPermitted : (t.errors[rows.error] ?? t.errors.generic)}</p>;
  const logos = libR.ok ? libR.data.filter((m) => m.kind === "logo") : [];
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2 text-sm";
  const formFor = (a?: AssociationRow) => (
    <form action={saveAssociation} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={a?.id ?? ""} />
      <label className="block text-sm">{c.name}<input name="name" required maxLength={150} defaultValue={a?.name ?? ""} className={field} /></label>
      <label className="block text-sm">{c.relationship}
        <select name="relationship" required defaultValue={a?.relationship ?? ""} className={field}><option value="" />{Object.entries(x.associations.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label className="block text-sm">{c.website}<input name="websiteUrl" type="url" pattern="https://.*" maxLength={300} defaultValue={a?.websiteUrl ?? ""} className={field} /></label>
      <label className="block text-sm">{c.logo}
        <select name="logoMediaId" defaultValue={a?.logoMediaId ?? ""} className={field}><option value="">—</option>{logos.map((m) => <option key={m.id} value={m.id}>{m.altEn ?? m.id.slice(0, 8)}{m.approvedAt ? "" : " (not approved)"}</option>)}</select>
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="relationshipConfirmed" defaultChecked={!!a?.relationshipConfirmedAt} className="size-5" />{c.confirmed}</label>
      <label className="block text-sm">{c.confirmedNote}<input name="relationshipNote" maxLength={300} defaultValue={a?.relationshipNote ?? ""} className={field} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="logoPermission" defaultChecked={!!a?.logoPermissionAt} className="size-5" />{c.permission}</label>
      <label className="block text-sm">{c.permissionNote}<input name="logoPermissionNote" maxLength={300} defaultValue={a?.logoPermissionNote ?? ""} className={field} /></label>
      <button className="min-h-11 justify-self-start rounded-lg bg-navy px-5 font-semibold text-ivory">{a ? c.save : c.add}</button>
    </form>
  );
  return (
    <div className="space-y-4">
      <Link href={`/${lang}/staff/content`} className="text-sm underline">← {x.staff.content}</Link>
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <h1 className="text-2xl font-semibold">{c.associations}</h1>
      <p className="text-sm text-slate">{c.assocNote}</p>
      <ul className="grid gap-3">
        {rows.map((a) => (
          <li key={a.id} className="rounded-xl border border-slate/20 bg-white p-4" data-testid="association">
            <p className="mb-3 flex flex-wrap items-center gap-2"><span className="font-semibold">{a.name}</span>
              <span className="rounded bg-gold/30 px-2 py-0.5 text-xs font-semibold">{c.status[a.status] ?? a.status}</span></p>
            {formFor(a)}
            <form action={associationAction} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={a.id} />
              {a.status === "draft" && <button name="action" value="submit" className="min-h-10 rounded-lg border border-navy px-3 text-sm">{c.submit}</button>}
              {can(me, "cms.publish") && a.status !== "published" && <button name="action" value="publish" className="min-h-10 rounded-lg bg-gold px-3 text-sm font-semibold text-navy">{c.publish}</button>}
              {can(me, "cms.publish") && a.status === "published" && <button name="action" value="unpublish" className="min-h-10 rounded-lg border border-red-700 px-3 text-sm text-red-800">{c.unpublish}</button>}
            </form>
          </li>
        ))}
      </ul>
      <section className="rounded-xl border border-dashed border-slate/40 bg-white p-4">
        <h2 className="mb-3 font-semibold">{c.add}</h2>
        {formFor()}
      </section>
    </div>
  );
}
