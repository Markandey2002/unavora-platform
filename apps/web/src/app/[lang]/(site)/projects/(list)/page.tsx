import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnquiryForm } from "@/components/EnquiryForm";
import { PageHero } from "@/components/site/PageHero";
import { ProjectCard } from "@/components/site/ProjectCard";
import { btn } from "@/components/site/ui";
import { getDictionary, isLang } from "@/i18n/dictionaries";
import { getSiteDictionary } from "@/i18n/site";
import { getProjects } from "@/lib/api";
import { pageMeta } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const s = getSiteDictionary(lang);
  return pageMeta(lang, "/projects", `${s.launches.title} · ${s.nav.newLaunches}`, s.launches.sub);
}

/** Published projects only (GET /api/v1/public/projects). With none published: honest empty state + interest form. */
export default async function ProjectsPage({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDictionary(lang);
  const s = getSiteDictionary(lang);
  const projects = await getProjects(lang);
  return (
    <>
      <PageHero lang={lang} home={s.detail.home} breadcrumbLabel={s.detail.breadcrumb} crumbs={[{ label: s.nav.projects }]}
        eyebrow={s.launches.eyebrow} title={s.launches.title} sub={s.launches.sub} />
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        {projects.length > 0 ? (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => <ProjectCard key={p.id} p={p} lang={lang} s={s} headingLevel="h2" />)}
          </ul>
        ) : (
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="font-display text-3xl font-semibold leading-snug">{s.launches.empty}</p>
              <Link href={`/${lang}/properties`} className={`${btn.outline} mt-8`}>{s.featured.viewAll}</Link>
            </div>
            <div className="bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
              <EnquiryForm lang={lang} t={t} f={s.form} variant="callback" enquiryType="project" title={s.launches.register} id="project-interest" />
            </div>
          </div>
        )}
      </section>
    </>
  );
}
