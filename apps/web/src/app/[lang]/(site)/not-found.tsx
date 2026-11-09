import { headers } from "next/headers";
import Link from "next/link";
import { getSiteDictionary } from "@/i18n/site";
import { btn } from "@/components/site/ui";

/** Not-found for public pages (unknown listing, project or page). Language from the URL prefix when available. */
export default async function NotFound() {
  const lang = (await headers()).get("x-unavora-lang") === "hi" ? "hi" : "en";
  const t = getSiteDictionary(lang);
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:py-32">
      <p className="font-display text-7xl font-semibold text-gold-700">404</p>
      <h1 className="font-display mt-6 text-3xl font-semibold sm:text-4xl">{t.states.notFoundTitle}</h1>
      <p className="mt-4 text-muted">{t.states.notFoundSub}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={`/${lang}`} className={btn.gold}>{t.states.home}</Link>
        <Link href={`/${lang}/properties`} className={btn.outline}>{t.nav.allProperties}</Link>
      </div>
    </section>
  );
}
