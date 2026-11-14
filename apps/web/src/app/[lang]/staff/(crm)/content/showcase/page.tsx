import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/staff/Flash";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { saveShowcase } from "../../cms-actions";

export const metadata: Metadata = { title: "Showcase" };
type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> };

/** CRM → Website content → Showcase: illustrative examples for the homepage (cms.manage; director publishes). */
export default async function ShowcaseListPage({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const c = x.cms, sc = x.cms.sc;
  const rows = handle(lang, await staffApi.showcaseItems(session));
  if (isError(rows)) return <p role="alert" data-testid="not-permitted">{rows.status === 403 ? t.notPermitted : (t.errors[rows.error] ?? t.errors.generic)}</p>;
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2 text-sm";
  const statusLabel = (s: string) => (s === "archived" ? sc.archived : c.status[s] ?? s);

  return (
    <div className="space-y-5">
      <Link href={`/${lang}/staff/content`} className="text-sm underline">← {x.staff.content}</Link>
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <h1 className="text-2xl font-semibold">{c.showcase}</h1>
      <p className="max-w-3xl text-sm text-slate">{sc.intro}</p>

      {rows.length === 0 ? <p className="text-sm">{sc.empty}</p> : (
        <ul className="grid gap-3" data-testid="showcase-rows">
          {rows.map((r) => (
            <li key={r.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate/20 bg-white p-3 ${r.status === "archived" ? "opacity-60" : ""}`} data-testid="showcase-row">
              {r.imageMediaId
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/_bff/staff/cms-file?m=${r.imageMediaId}`} alt="" className="size-16 shrink-0 rounded bg-sand object-cover" />
                : <span className="grid size-16 shrink-0 place-items-center rounded bg-sand text-[0.65rem] text-slate">{sc.noImage}</span>}
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate font-semibold">{r.titleEn}</p>
                <p className="text-xs text-slate">{x.showcase.categories[r.category]} · {x.showcase.cta[r.cta]} · #{r.sortOrder}</p>
              </div>
              {r.sample && <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800" data-testid="sample-badge">Local sample</span>}
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${r.status === "published" ? "bg-green-100 text-green-900" : "bg-gold/30"}`}>{statusLabel(r.status)}</span>
              <Link href={`/${lang}/staff/content/showcase/${r.id}`} className="min-h-10 rounded-lg border border-navy px-3 py-2 text-sm">{sc.edit}</Link>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-xl border border-dashed border-slate/40 bg-white p-4">
        <h2 className="mb-3 font-semibold">{sc.add}</h2>
        <form action={saveShowcase} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="lang" value={lang} />
          <label className="block text-sm">{sc.category}
            <select name="category" required className={field}>{Object.entries(x.showcase.categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label className="block text-sm">{sc.cta}
            <select name="cta" className={field}>{["enquire", "register_interest", "browse"].map((k) => <option key={k} value={k}>{x.showcase.cta[k]}</option>)}</select>
          </label>
          <label className="block text-sm">{sc.titleEn}<input name="titleEn" required maxLength={90} className={field} /></label>
          <label className="block text-sm">{sc.titleHi}<input name="titleHi" maxLength={90} className={field} /></label>
          <label className="block text-sm sm:col-span-2">{sc.descEn}<textarea name="descriptionEn" required maxLength={300} rows={2} className={field} /></label>
          <button className="min-h-11 justify-self-start rounded-lg bg-navy px-5 font-semibold text-ivory">{sc.add}</button>
        </form>
      </section>
    </div>
  );
}
