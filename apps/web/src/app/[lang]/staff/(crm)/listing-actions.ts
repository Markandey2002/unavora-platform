"use server";

// Listing / project management, photographs and owner-submission conversion. The API re-checks session, MFA and
// every permission (property.create / submit / review / publish / read_*) on each call. Redirect-based results.
import { revalidatePath, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PUBLIC_TAG } from "@/lib/api";
import { staffApi, staffSessionFrom, type ListingInput, type MediaOwner, type ProjectInput } from "@/lib/staff";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => { const v = str(f, k).replace(/,/g, ""); if (!v) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const lang = (f: FormData) => (f.get("lang") === "hi" ? "hi" : "en");
const safeId = (s: string) => (/^[0-9a-f-]{36}$/i.test(s) ? s : "");
const orNull = (s: string) => s || null;

async function session(l: string) {
  const s = staffSessionFrom(await cookies());
  if (!s) redirect(`/${l}/staff/login`);
  return s;
}

function done(l: string, path: string, r: { ok: boolean; status: number; code?: string }, okFlag = "saved=1"): never {
  if (r.ok) { updateTag(PUBLIC_TAG); revalidatePath("/", "layout"); }   // data cache + every cached public page
  if (!r.ok && r.status === 401) redirect(`/${l}/staff/login?error=session_expired`);
  redirect(`/${l}/staff/${path}${path.includes("?") ? "&" : "?"}${r.ok ? okFlag : `error=${encodeURIComponent(r.code ?? "generic")}`}`);
}

// ---------------- listings ----------------
function listingFrom(f: FormData): ListingInput {
  const hiTitle = str(f, "hiTitle");
  return {
    typeCode: str(f, "typeCode"), localityId: safeId(str(f, "localityId")), purpose: str(f, "purpose") || "sale",
    priceAmount: num(f, "priceAmount"), priceOnRequest: f.get("priceOnRequest") === "on", priceNegotiable: f.get("priceNegotiable") === "on",
    areaUnit: str(f, "areaUnit") || "sq_ft", builtUpArea: num(f, "builtUpArea"), carpetArea: num(f, "carpetArea"), plotArea: num(f, "plotArea"),
    bedrooms: num(f, "bedrooms"), bathrooms: num(f, "bathrooms"), parkingSpaces: num(f, "parkingSpaces"),
    furnishing: orNull(str(f, "furnishing")), possessionStatus: orNull(str(f, "possessionStatus")), possessionDate: orNull(str(f, "possessionDate")),
    floorNumber: num(f, "floorNumber"), totalFloors: num(f, "totalFloors"), addressLine: orNull(str(f, "addressLine")),
    latitude: num(f, "latitude"), longitude: num(f, "longitude"), hideExactLocation: f.get("showExactLocation") !== "on",
    projectId: orNull(safeId(str(f, "projectId"))), ownerUserId: orNull(safeId(str(f, "ownerUserId"))),
    amenityCodes: f.getAll("amenity").map(String).filter((c) => /^[a-z0-9_]{1,50}$/.test(c)),
    en: { title: str(f, "enTitle"), slug: str(f, "enSlug"), description: orNull(str(f, "enDescription")) },
    hi: hiTitle ? { title: hiTitle, slug: str(f, "hiSlug"), description: orNull(str(f, "hiDescription")) } : null,
  };
}

export async function saveListing(f: FormData) {
  const l = lang(f), id = safeId(str(f, "id"));
  const s = await session(l);
  if (id) done(l, `listings/${id}`, await staffApi.updateListing(s, id, listingFrom(f)));
  const r = await staffApi.createListing(s, listingFrom(f));
  if (r.ok) redirect(`/${l}/staff/listings/${r.data.id}?saved=1`);
  done(l, "listings/new", r);
}

export async function listingAction(f: FormData) {
  const l = lang(f), id = safeId(str(f, "id")), a = str(f, "action");
  if (!["submit", "publish", "unpublish", "sold"].includes(a)) redirect(`/${l}/staff/listings/${id}?error=generic`);
  done(l, `listings/${id}`, await staffApi.listingAction(await session(l), id, a as "submit"));
}

export async function reviewListing(f: FormData) {
  const l = lang(f), id = safeId(str(f, "id"));
  done(l, `listings/${id}`, await staffApi.reviewListing(await session(l), id, str(f, "decision"), str(f, "note")));
}

// ---------------- photographs (listings and projects) ----------------
const owner = (f: FormData): MediaOwner => (str(f, "owner") === "projects" ? "projects" : "properties");
const back = (f: FormData) => `${owner(f) === "projects" ? "projects" : "listings"}/${safeId(str(f, "id"))}`;

export async function uploadPhoto(f: FormData) {
  const l = lang(f), id = safeId(str(f, "id"));
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) redirect(`/${l}/staff/${back(f)}?error=file_empty`);
  if (file.size > 5 * 1024 * 1024) redirect(`/${l}/staff/${back(f)}?error=file_too_large`);
  const out = new FormData();
  out.append("file", file, file.name.slice(0, 120));
  for (const k of ["kind", "captionEn", "captionHi", "altEn", "altHi", "credit", "licence"]) { const v = str(f, k); if (v) out.set(k, v); }
  done(l, back(f), await staffApi.uploadMedia(await session(l), owner(f), id, out));
}

export async function savePhoto(f: FormData) {
  const l = lang(f);
  done(l, back(f), await staffApi.updateMedia(await session(l), owner(f), safeId(str(f, "id")), safeId(str(f, "mid")), {
    kind: str(f, "kind"), captionEn: orNull(str(f, "captionEn")), captionHi: orNull(str(f, "captionHi")), altEn: orNull(str(f, "altEn")),
    altHi: orNull(str(f, "altHi")), credit: orNull(str(f, "credit")), licence: orNull(str(f, "licence")), sortOrder: num(f, "sortOrder"),
  }));
}

export async function photoAction(f: FormData) {
  const l = lang(f), a = str(f, "action"), id = safeId(str(f, "id")), mid = safeId(str(f, "mid"));
  const s = await session(l);
  if (a === "delete") done(l, back(f), await staffApi.deleteMedia(s, owner(f), id, mid));
  if (!["approve", "unapprove", "primary"].includes(a)) redirect(`/${l}/staff/${back(f)}?error=generic`);
  done(l, back(f), await staffApi.mediaAction(s, owner(f), id, mid, a as "approve"));
}

// ---------------- projects ----------------
function projectFrom(f: FormData): ProjectInput {
  const labels = f.getAll("unitLabel").map(String);
  const col = (k: string) => f.getAll(k).map(String);
  const toNum = (v: string) => { const n = Number(v.replace(/,/g, "")); return v.trim() && Number.isFinite(n) ? n : null; };
  const units = labels.map((label, i) => ({
    label: label.trim(), bedrooms: toNum(col("unitBedrooms")[i] ?? ""), areaValue: toNum(col("unitArea")[i] ?? ""),
    areaUnit: (col("unitAreaUnit")[i] ?? "") || null, basePrice: toNum(col("unitPrice")[i] ?? ""),
  })).filter((u) => u.label);
  const hiName = str(f, "hiName");
  return {
    localityId: orNull(safeId(str(f, "localityId"))), constructionStatus: orNull(str(f, "constructionStatus")),
    possessionDate: orNull(str(f, "possessionDate")), possessionPublic: f.get("possessionPublic") === "on",
    developerName: orNull(str(f, "developerName")), developerVerified: f.get("developerVerified") === "on",
    category: orNull(str(f, "category")), primaryTypeCode: orNull(str(f, "primaryTypeCode")),
    reraNumber: orNull(str(f, "reraNumber")), reraVerified: f.get("reraVerified") === "on", pricePublic: f.get("pricePublic") === "on",
    units, en: { name: str(f, "enName"), slug: str(f, "enSlug"), description: orNull(str(f, "enDescription")) },
    hi: hiName ? { name: hiName, slug: str(f, "hiSlug"), description: orNull(str(f, "hiDescription")) } : null,
  };
}

export async function saveProject(f: FormData) {
  const l = lang(f), id = safeId(str(f, "id"));
  const s = await session(l);
  if (id) done(l, `projects/${id}`, await staffApi.updateProject(s, id, projectFrom(f)));
  const r = await staffApi.createProject(s, projectFrom(f));
  if (r.ok) redirect(`/${l}/staff/projects/${r.data.id}?saved=1`);
  done(l, "projects/new", r);
}

export async function projectAction(f: FormData) {
  const l = lang(f), id = safeId(str(f, "id")), a = str(f, "action");
  if (!["publish", "unpublish", "archive"].includes(a)) redirect(`/${l}/staff/projects/${id}?error=generic`);
  done(l, `projects/${id}`, await staffApi.projectAction(await session(l), id, a as "publish"));
}

// ---------------- owner submission -> draft listing ----------------
export async function convertSubmission(f: FormData) {
  const l = lang(f), id = safeId(str(f, "id"));
  const r = await staffApi.createListingFromSubmission(await session(l), id, {
    localityId: safeId(str(f, "localityId")), fileIds: f.getAll("fileId").map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v)),
  });
  if (r.ok) redirect(`/${l}/staff/listings/${r.data.propertyId}?saved=1`);
  done(l, `submissions/${id}`, r);
}

// ---------------- approximate locality positions (area maps) ----------------
export async function saveLocalityPosition(f: FormData) {
  const l = lang(f);
  const lat = num(f, "latitude"), lon = num(f, "longitude");
  done(l, "content/locations", await staffApi.localityPosition(await session(l), safeId(str(f, "localityId")), { latitude: lat, longitude: lon }));
}
