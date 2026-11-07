"use server";

// Staff CRM mutations. Next.js server actions reject cross-origin posts; the API re-checks the session, MFA,
// permission and record-level access for every call. Results are signalled with a redirect (works without JS).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { staffApi, staffSessionFrom } from "@/lib/staff";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const lang = (f: FormData) => (f.get("lang") === "hi" ? "hi" : "en");
const safeId = (s: string) => (/^[0-9a-f-]{36}$/i.test(s) ? s : "");

async function session(l: string) {
  const s = staffSessionFrom(await cookies());
  if (!s) redirect(`/${l}/staff/login`);
  return s;
}

function done(l: string, path: string, r: { ok: boolean; status: number; code?: string }, okFlag: string): never {
  if (!r.ok && r.status === 401) redirect(`/${l}/staff/login?error=session_expired`);
  redirect(`${path}?${r.ok ? okFlag : `error=${encodeURIComponent(r.code ?? "generic")}`}`);
}

export async function logCommunication(form: FormData) {
  const l = lang(form);
  const customerId = safeId(str(form, "customerId"));
  const s = await session(l);
  const leadId = safeId(str(form, "leadId")) || undefined;
  const r = await staffApi.logCommunication(s, customerId, {
    channel: str(form, "channel"), direction: str(form, "direction"), summary: str(form, "summary"), leadId,
  });
  done(l, `/${l}/staff/customers/${customerId}`, r.ok ? r : { ...r, code: r.code }, "saved=communication");
}

export async function addFollowUp(form: FormData) {
  const l = lang(form);
  const customerId = safeId(str(form, "customerId"));
  const s = await session(l);
  // <input type="datetime-local"> has no zone; the business runs on India time.
  const local = str(form, "dueAt");
  const dueAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? `${local}:00+05:30` : local;
  const r = await staffApi.addFollowUp(s, customerId, {
    title: str(form, "title"), description: str(form, "description") || undefined, dueAt,
    leadId: safeId(str(form, "leadId")) || undefined,
  });
  done(l, `/${l}/staff/customers/${customerId}`, r.ok ? r : { ...r, code: r.code }, "saved=followup");
}

export async function completeFollowUp(form: FormData) {
  const l = lang(form);
  const s = await session(l);
  const r = await staffApi.completeFollowUp(s, safeId(str(form, "followUpId")));
  done(l, `/${l}/staff/follow-ups`, r.ok ? r : { ...r, code: r.code }, "saved=done");
}
