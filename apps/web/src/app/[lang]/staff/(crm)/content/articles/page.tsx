import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";

export const metadata: Metadata = { title: "Insights" };

export default async function ArticlesPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const { session } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const rows = handle(lang, await staffApi.articles(session));
  if (isError(rows)) return <p role="alert" data-testid="not-permitted">{rows.status === 403 ? t.notPermitted : (t.errors[rows.error] ?? t.errors.generic)}</p>;
  return (
    <section>
      <Link href={`/${lang}/staff/content`} className="text-sm underline">← {x.staff.content}</Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{x.staff.articles}</h1>
        <Link href={`/${lang}/staff/content/articles/new`} className="min-h-11 content-center rounded-lg bg-navy px-5 font-semibold text-ivory">{x.staff.newArticle}</Link>
      </div>
      <ul className="mt-6 grid gap-3" data-testid="article-list">
        {rows.map((a) => (
          <li key={a.id} className="rounded-xl border border-slate/20 bg-white p-4">
            <Link href={`/${lang}/staff/content/articles/${a.id}`} className="font-semibold underline-offset-4 hover:underline">{a.titleEn}</Link>
            <span className="ml-2 rounded bg-gold/30 px-2 py-0.5 text-xs">{a.status}</span>
            <p className="mt-1 text-sm text-slate">{a.kind} · {x.insights.categories[a.category] ?? a.category} · {a.authorName}{a.hasHindi ? " · EN + HI" : " · EN"}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
