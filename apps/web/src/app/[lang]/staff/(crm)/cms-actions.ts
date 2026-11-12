"use server";

// Director CMS actions: website blocks (hero, tiles, section order, careers, SEO), image library, associations.
// The API validates every block, re-checks session/MFA and permission (cms.manage to edit and submit, cms.publish to
// publish/unpublish) and audits each change. Publishing expires the cached public pages.
import { revalidatePath, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PUBLIC_TAG } from "@/lib/api";
import { staffApi, staffSessionFrom } from "@/lib/staff";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const all = (f: FormData, k: string) => f.getAll(k).map((v) => String(v).trim());
const lang = (f: FormData) => (f.get("lang") === "hi" ? "hi" : "en");
const safeId = (s: string) => (/^[0-9a-f-]{36}$/i.test(s) ? s : "");
const KEY = /^(home\.(hero|tiles|sections)|careers\.page|seo\.[a-z-]{2,40})$/;

async function session(l: string) {
  const s = staffSessionFrom(await cookies());
  if (!s) redirect(`/${l}/staff/login`);
  return s;
}

function done(l: string, path: string, r: { ok: boolean; status: number; code?: string }): never {
  if (r.ok) { updateTag(PUBLIC_TAG); revalidatePath("/", "layout"); }   // data cache + every cached public page
  if (!r.ok && r.status === 401) redirect(`/${l}/staff/login?error=session_expired`);
  redirect(`/${l}/staff/${path}?${r.ok ? "saved=1" : `error=${encodeURIComponent(r.code ?? "generic")}`}`);
}

/** Texts of one language from fields named `${prefix}${name}`; empty values are dropped. */
function texts(f: FormData, prefix: string, names: string[]) {
  const out: Record<string, string> = {};
  for (const n of names) { const v = str(f, `${prefix}${n}`); if (v) out[n] = v; }
  return Object.keys(out).length ? out : null;
}

function blockFrom(key: string, f: FormData): unknown {
  if (key === "home.hero") {
    const names = ["eyebrow", "title", "sub", "primaryLabel", "secondaryLabel"];
    return { en: texts(f, "en.", names), hi: texts(f, "hi.", names), imageId: safeId(str(f, "imageId")) || null };
  }
  if (key === "home.tiles") {
    const keys = all(f, "tileKey");
    return {
      items: keys.map((k, i) => ({
        key: k, visible: f.get(`visible.${k}`) === "on",
        en: { title: all(f, "en.title")[i], body: all(f, "en.body")[i] }, hi: all(f, "hi.title")[i] ? { title: all(f, "hi.title")[i], body: all(f, "hi.body")[i] } : null,
        imageId: safeId(all(f, "imageId")[i] ?? "") || null,
      })),
    };
  }
  if (key === "home.sections") {
    const keys = all(f, "section");
    const order = keys.map((k, i) => ({ k, n: Number(all(f, "order")[i]) || i + 1 })).sort((a, b) => a.n - b.n).map((x) => x.k);
    return { order, hidden: keys.filter((k) => f.get(`hidden.${k}`) === "on") };
  }
  if (key === "careers.page") {
    const titles = all(f, "job.title");
    return {
      en: texts(f, "en.", ["title", "intro"]), hi: texts(f, "hi.", ["title", "intro"]),
      openings: titles.map((title, i) => ({
        id: all(f, "job.id")[i] || null, title, location: all(f, "job.location")[i], type: all(f, "job.type")[i],
        description: all(f, "job.description")[i], active: all(f, "job.active")[i] === "yes",
      })).filter((j) => j.title),
    };
  }
  return { en: texts(f, "en.", ["title", "description"]), hi: texts(f, "hi.", ["title", "description"]) };
}

export async function saveBlock(f: FormData) {
  const l = lang(f), key = str(f, "key");
  if (!KEY.test(key)) redirect(`/${l}/staff/content/site?error=generic`);
  done(l, `content/site/${key}`, await staffApi.saveCmsBlock(await session(l), key, blockFrom(key, f)));
}

export async function blockAction(f: FormData) {
  const l = lang(f), key = str(f, "key"), a = str(f, "action");
  if (!KEY.test(key) || !["submit", "publish", "unpublish"].includes(a)) redirect(`/${l}/staff/content/site?error=generic`);
  done(l, `content/site/${key}`, await staffApi.cmsBlockAction(await session(l), key, a as "submit"));
}

// ---- image library ----
export async function uploadImage(f: FormData) {
  const l = lang(f);
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) redirect(`/${l}/staff/content/library?error=file_empty`);
  if (file.size > 5 * 1024 * 1024) redirect(`/${l}/staff/content/library?error=file_too_large`);
  const out = new FormData();
  out.append("file", file, file.name.slice(0, 120));
  for (const k of ["kind", "captionEn", "altEn", "altHi", "credit", "licence"]) { const v = str(f, k); if (v) out.set(k, v); }
  done(l, "content/library", await staffApi.cmsUpload(await session(l), out));
}

export async function saveImage(f: FormData) {
  const l = lang(f);
  done(l, "content/library", await staffApi.cmsUpdateImage(await session(l), safeId(str(f, "mid")), {
    kind: str(f, "kind"), captionEn: str(f, "captionEn") || null, captionHi: null, altEn: str(f, "altEn") || null, altHi: str(f, "altHi") || null,
    credit: str(f, "credit") || null, licence: str(f, "licence") || null, sortOrder: null,
  }));
}

export async function imageAction(f: FormData) {
  const l = lang(f), a = str(f, "action"), id = safeId(str(f, "mid"));
  const s = await session(l);
  if (a === "delete") done(l, "content/library", await staffApi.cmsDeleteImage(s, id));
  if (a !== "approve" && a !== "unapprove") redirect(`/${l}/staff/content/library?error=generic`);
  done(l, "content/library", await staffApi.cmsImageAction(s, id, a));
}

// ---- associations ----
export async function saveAssociation(f: FormData) {
  const l = lang(f), id = safeId(str(f, "id"));
  const body = {
    name: str(f, "name"), relationship: str(f, "relationship"), websiteUrl: str(f, "websiteUrl") || null,
    logoMediaId: safeId(str(f, "logoMediaId")) || null, relationshipConfirmed: f.get("relationshipConfirmed") === "on",
    relationshipNote: str(f, "relationshipNote") || null, logoPermission: f.get("logoPermission") === "on",
    logoPermissionNote: str(f, "logoPermissionNote") || null, sortOrder: Number(str(f, "sortOrder")) || null,
  };
  const s = await session(l);
  done(l, "content/associations", id ? await staffApi.updateAssociation(s, id, body) : await staffApi.addAssociation(s, body));
}

export async function associationAction(f: FormData) {
  const l = lang(f), a = str(f, "action");
  if (!["submit", "publish", "unpublish"].includes(a)) redirect(`/${l}/staff/content/associations?error=generic`);
  done(l, "content/associations", await staffApi.associationAction(await session(l), safeId(str(f, "id")), a as "submit"));
}
