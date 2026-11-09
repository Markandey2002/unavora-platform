"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { getSiteDictionary } from "@/i18n/site";
import { btn } from "@/components/site/ui";

/** Error boundary for public pages (e.g. the API is unreachable). No technical details are shown to visitors. */
export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const lang = useParams<{ lang: string }>()?.lang === "hi" ? "hi" : "en";
  const t = getSiteDictionary(lang);
  return (
    <section role="alert" className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:py-32">
      <h1 className="font-display text-3xl font-semibold sm:text-4xl">{t.states.errorTitle}</h1>
      <p className="mt-4 text-muted">{t.states.errorSub}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className={btn.gold}>{t.states.retry}</button>
        <Link href={`/${lang}`} className={btn.outline}>{t.states.home}</Link>
      </div>
    </section>
  );
}
