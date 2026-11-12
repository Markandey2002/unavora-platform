import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleText } from "@/components/site/ArticleText";
import { LiteYouTube } from "@/components/site/InsightsParts";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";

export const metadata: Metadata = { title: "Insight preview", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> };

/** Staff-only preview of an Insight exactly as its text will render, in any status (draft included). */
export default async function InsightPreview({ params, searchParams }: Props) {
  const { lang, id } = await params;
  if (!isLang(lang) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const sp = await searchParams;
  const { session } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const r = handle(lang, await staffApi.article(session, id));
  if (isError(r)) return <p role="alert" data-testid="not-permitted">{r.status === 403 ? t.notPermitted : t.notFound}</p>;
  const tr = (sp.l === "hi" && r.hi) ? r.hi : r.en;
  return (
    <div className="space-y-4">
      <Link href={`/${lang}/staff/content/articles/${id}`} className="text-sm underline">← {x.staff.articles}</Link>
      <p role="status" className="rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white" data-testid="preview-banner">{x.preview.banner} ({r.status})</p>
      <div className="flex gap-2 text-sm">
        <Link href="?l=en" className="underline">English</Link>{r.hi && <Link href="?l=hi" className="underline">हिन्दी</Link>}
      </div>
      <article className="site mx-auto max-w-3xl rounded-xl bg-ivory p-6 sm:p-10" lang={tr === r.hi ? "hi" : "en"}>
        <p className="eyebrow text-gold-700">{x.insights.categories[r.category] ?? r.category}</p>
        <h1 className="font-display mt-3 text-4xl font-semibold leading-tight">{tr.title}</h1>
        <p className="mt-3 text-sm text-muted">{x.insights.by} {r.authorName}</p>
        {r.kind === "video" && r.youtubeId && <div className="mt-6"><LiteYouTube id={r.youtubeId} title={tr.title} labels={{ play: x.insights.play, note: x.insights.videoNote }} /></div>}
        {r.videoDescription && <p className="mt-4 whitespace-pre-line text-muted">{r.videoDescription}</p>}
        <div className="mt-6 text-lg leading-relaxed text-navy/90"><ArticleText text={tr.body} /></div>
      </article>
    </div>
  );
}
