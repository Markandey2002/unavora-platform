"use server";

// Director content management and owner-submission review. The API re-checks session, MFA and permission
// (cms.manage / property.publish / settings.manage / lead access) on every call. Redirect-based results (no JS needed).
import { cookies } from "next/headers";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { PUBLIC_TAG } from "@/lib/api";
import { staffApi, staffSessionFrom, type ArticleInput } from "@/lib/staff";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const lang = (f: FormData) => (f.get("lang") === "hi" ? "hi" : "en");
const safeId = (s: string) => (/^[0-9a-f-]{36}$/i.test(s) ? s : "");

async function session(l: string) {
  const s = staffSessionFrom(await cookies());
  if (!s) redirect(`/${l}/staff/login`);
  return s;
}

function done(l: string, path: string, r: { ok: boolean; status: number; code?: string }, okFlag = "saved=1"): never {
  // Any successful change may alter the public website: expire cached public data so the next visit is current.
  if (r.ok) { updateTag(PUBLIC_TAG); revalidatePath("/", "layout"); }   // data cache + every cached public page
  if (!r.ok && r.status === 401) redirect(`/${l}/staff/login?error=session_expired`);
  redirect(`/${l}/staff/${path}?${r.ok ? okFlag : `error=${encodeURIComponent(r.code ?? "generic")}`}`);
}

// ---- owner submissions ----
export async function reviewSubmission(f: FormData) {
  const l = lang(f), id = safeId(str(f, "id"));
  done(l, `submissions/${id}`, await staffApi.reviewSubmission(await session(l), id, str(f, "note")));
}

export async function decideSubmission(f: FormData) {
  const l = lang(f), id = safeId(str(f, "id"));
  done(l, `submissions/${id}`, await staffApi.decideSubmission(await session(l), id, str(f, "decision"), str(f, "note")));
}

// ---- Insights ----
function articleFrom(f: FormData): ArticleInput {
  const tr = (p: string) => ({ title: str(f, `${p}Title`), slug: str(f, `${p}Slug`), excerpt: str(f, `${p}Excerpt`) || null, body: str(f, `${p}Body`) });
  const hi = tr("hi");
  return {
    kind: str(f, "kind"), category: str(f, "category"), authorName: str(f, "authorName"), youtubeId: str(f, "youtubeId") || null,
    en: tr("en"), hi: hi.title ? hi : null,
    featured: f.get("featured") === "on", coverMediaId: safeId(str(f, "coverMediaId")) || null, videoDescription: str(f, "videoDescription") || null,
  };
}

export async function saveArticle(f: FormData) {
  const l = lang(f), id = safeId(str(f, "id"));
  const s = await session(l);
  if (id) done(l, `content/articles/${id}`, await staffApi.updateArticle(s, id, articleFrom(f)));
  const r = await staffApi.createArticle(s, articleFrom(f));
  if (r.ok) { updateTag(PUBLIC_TAG); revalidatePath("/", "layout"); redirect(`/${l}/staff/content/articles/${r.data.id}?saved=1`); }
  done(l, "content/articles/new", r);
}

export async function setArticleStatus(f: FormData) {
  const l = lang(f), id = safeId(str(f, "id"));
  done(l, `content/articles/${id}`, await staffApi.articleStatus(await session(l), id, str(f, "status")));
}

// ---- testimonials ----
export async function addTestimonial(f: FormData) {
  const l = lang(f);
  const rating = Number(str(f, "rating"));
  done(l, "content/testimonials", await staffApi.addTestimonial(await session(l), {
    displayName: str(f, "displayName"), rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null, body: str(f, "body"),
    consentConfirmed: f.get("consentConfirmed") === "on", consentNote: str(f, "consentNote"), publish: f.get("publish") === "on",
  }));
}

export async function setTestimonialStatus(f: FormData) {
  const l = lang(f);
  done(l, "content/testimonials", await staffApi.testimonialStatus(await session(l), safeId(str(f, "id")), str(f, "status")));
}

// ---- featured, locations, company ----
export async function setFeatured(f: FormData) {
  const l = lang(f);
  done(l, "content/featured", await staffApi.setFeatured(await session(l), safeId(str(f, "id")), str(f, "on") === "1"));
}

export async function saveLocation(f: FormData) {
  const l = lang(f), slug = str(f, "slug");
  const hi = { title: str(f, "hiTitle"), intro: str(f, "hiIntro") };
  done(l, "content/locations", await staffApi.saveLocation(await session(l), /^[a-z0-9-]{2,60}$/.test(slug) ? slug : "x", {
    en: { title: str(f, "enTitle"), intro: str(f, "enIntro") }, hi: hi.title && hi.intro ? hi : null, published: f.get("published") === "on",
  }));
}

export async function saveSetting(f: FormData) {
  const l = lang(f);
  done(l, "content/company", await staffApi.saveSetting(await session(l), str(f, "key"), str(f, "value"), f.get("verified") === "on"));
}

export async function saveOffice(f: FormData) {
  const l = lang(f);
  done(l, "content/company", await staffApi.saveOffice(await session(l), safeId(str(f, "id")), {
    address: str(f, "address"), pinCode: str(f, "pinCode"), phone: str(f, "phone"), verified: f.get("verified") === "on",
    hours: str(f, "hours"), directionsUrl: str(f, "directionsUrl"),
  }));
}
