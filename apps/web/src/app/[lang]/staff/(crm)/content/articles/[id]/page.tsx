import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/staff/Flash";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { staffApi, type ArticleFull } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { saveArticle, setArticleStatus } from "../../../content-actions";

export const metadata: Metadata = { title: "Edit insight" };
type Props = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> };
const CATEGORIES = ["market", "guide", "education", "investment", "location", "company"];

/** Create/edit an article or video (English required, Hindi optional) and publish/unpublish it. */
export default async function ArticleEditor({ params, searchParams }: Props) {
  const { lang, id } = await params;
  if (!isLang(lang) || (id !== "new" && !/^[0-9a-f-]{36}$/.test(id))) notFound();
  const sp = await searchParams;
  const { session } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  let a: ArticleFull | null = null;
  if (id !== "new") {
    const r = handle(lang, await staffApi.article(session, id));
    if (isError(r)) return <p role="alert" data-testid="not-permitted">{r.status === 403 ? t.notPermitted : t.notFound}</p>;
    a = r;
  }
  const lib = await staffApi.cmsLibrary(session);
  const covers = lib.ok ? lib.data.filter((m) => ["editorial", "brand", "actual_photo", "representative", "render"].includes(m.kind)) : [];
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2";
  const tr = (p: "en" | "hi", label: string, required: boolean) => {
    const v = a?.[p];
    return (
      <fieldset className="grid gap-3 rounded-xl border border-slate/20 bg-white p-4">
        <legend className="px-1 font-semibold">{label}</legend>
        <label className="block text-sm">{x.staff.titleF}<input name={`${p}Title`} defaultValue={v?.title ?? ""} required={required} maxLength={200} className={field} /></label>
        <label className="block text-sm">{x.staff.slug}<input name={`${p}Slug`} defaultValue={v?.slug ?? ""} required={required} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={200} className={field} /></label>
        <label className="block text-sm">{x.staff.excerpt}<textarea name={`${p}Excerpt`} defaultValue={v?.excerpt ?? ""} maxLength={400} rows={2} className={field} /></label>
        <label className="block text-sm">{x.staff.body}<textarea name={`${p}Body`} defaultValue={v?.body ?? ""} required={required} rows={10} className={field} /></label>
      </fieldset>
    );
  };
  return (
    <div className="space-y-4">
      <Link href={`/${lang}/staff/content/articles`} className="text-sm underline">← {x.staff.articles}</Link>
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <h1 className="text-2xl font-semibold">{a ? a.en.title : x.staff.newArticle}{a && <span className="ml-2 rounded bg-gold/30 px-2 py-0.5 text-sm" data-testid="article-status">{a.status}</span>}</h1>
      <form action={saveArticle} className="grid gap-4" data-testid="article-form">
        <input type="hidden" name="lang" value={lang} />
        {a && <input type="hidden" name="id" value={a.id} />}
        <div className="grid gap-3 rounded-xl border border-slate/20 bg-white p-4 sm:grid-cols-2">
          <label className="block text-sm">{x.staff.kind}
            <select name="kind" defaultValue={a?.kind ?? "article"} className={field}><option value="article">{x.insights.articles}</option><option value="video">{x.insights.videos}</option></select>
          </label>
          <label className="block text-sm">{x.staff.category}
            <select name="category" defaultValue={a?.category ?? "guide"} className={field}>{CATEGORIES.map((c) => <option key={c} value={c}>{x.insights.categories[c]}</option>)}</select>
          </label>
          <label className="block text-sm">{x.staff.author}<input name="authorName" defaultValue={a?.authorName ?? ""} required maxLength={120} className={field} /></label>
          <label className="block text-sm">{x.staff.youtube}<input name="youtubeId" defaultValue={a?.youtubeId ?? ""} pattern="[A-Za-z0-9_\-]{11}" maxLength={11} className={field} /></label>
          <label className="block text-sm">{x.cms.image}
            <select name="coverMediaId" defaultValue={a?.coverMediaId ?? ""} className={field}>
              <option value="">{x.cms.noImage}</option>
              {covers.map((m) => <option key={m.id} value={m.id}>{m.altEn ?? m.id.slice(0, 8)} · {x.cms.kinds[m.kind] ?? m.kind}{m.approvedAt ? "" : " (not approved)"}</option>)}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" name="featured" defaultChecked={a?.featured} className="size-5" />{x.insights.featured}</label>
          <label className="block text-sm sm:col-span-2">{x.cms.description} (video)<textarea name="videoDescription" defaultValue={a?.videoDescription ?? ""} maxLength={2000} rows={2} className={field} /></label>
        </div>
        {tr("en", x.staff.english, true)}
        {tr("hi", x.staff.hindi, false)}
        <button className="min-h-11 justify-self-start rounded-lg bg-navy px-6 font-semibold text-ivory">{x.staff.save}</button>
      </form>
      {a && <Link href={`/${lang}/staff/content/articles/${a.id}/preview`} className="inline-flex min-h-11 items-center rounded-lg border border-navy px-4 font-semibold" data-testid="article-preview">{x.cms.previewArticle} ↗</Link>}
      {a && (
        <form action={setArticleStatus} className="flex flex-wrap gap-3">
          <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={a.id} />
          {a.status !== "published" && <button name="status" value="published" className="min-h-11 rounded-lg bg-gold px-5 font-semibold text-navy">{x.staff.publish}</button>}
          {a.status === "published" && <button name="status" value="draft" className="min-h-11 rounded-lg border border-navy px-5 font-semibold">{x.staff.unpublish}</button>}
          {a.status !== "archived" && <button name="status" value="archived" className="min-h-11 rounded-lg border border-slate/40 px-5">{x.staff.archive}</button>}
        </form>
      )}
    </div>
  );
}
