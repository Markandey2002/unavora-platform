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

// ---------------------------------------------------------------- Slice 4: stages, assignment, visits, follow-ups

/** Only same-app staff paths may be used as a return target (no open redirect). */
function back(l: string, f: FormData): string {
  const p = str(f, "returnTo");
  return p.startsWith(`/${l}/staff/`) && !p.includes("//") && !p.includes("..") ? p.split("?")[0] : `/${l}/staff/leads`;
}

/** <input type="datetime-local"> carries no zone; the business runs on India time. */
function ist(local: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? `${local}:00+05:30` : local;
}

const num = (f: FormData, k: string) => {
  const n = Number(str(f, k));
  return Number.isFinite(n) && str(f, k) !== "" ? n : undefined;
};

export async function changeStage(form: FormData) {
  const l = lang(form);
  const s = await session(l);
  const r = await staffApi.changeStage(s, safeId(str(form, "leadId")), {
    toStage: str(form, "toStage"), expectedVersion: num(form, "version"),
    reasonCode: str(form, "reasonCode") || undefined, note: str(form, "note") || undefined,
  });
  done(l, back(l, form), r, "saved=stage");
}

export async function assignLead(form: FormData) {
  const l = lang(form);
  const s = await session(l);
  const r = await staffApi.assign(s, safeId(str(form, "leadId")), {
    assigneeId: safeId(str(form, "assigneeId")), expectedVersion: num(form, "version"), reason: str(form, "reason") || undefined,
  });
  done(l, back(l, form), r, "saved=assigned");
}

export async function scheduleVisit(form: FormData) {
  const l = lang(form);
  const s = await session(l);
  const r = await staffApi.scheduleVisit(s, {
    leadId: safeId(str(form, "leadId")), scheduledAt: ist(str(form, "scheduledAt")),
    propertyId: safeId(str(form, "propertyId")) || undefined, assignedUserId: safeId(str(form, "assigneeId")) || undefined,
    locationNote: str(form, "locationNote") || undefined,
  });
  done(l, back(l, form), r, "saved=visit");
}

export async function visitAction(form: FormData) {
  const l = lang(form);
  const s = await session(l);
  const action = str(form, "action");
  if (action !== "reschedule" && action !== "cancel" && action !== "complete" && action !== "no-show") redirect(back(l, form));
  const body: Record<string, unknown> = { expectedVersion: num(form, "version") };
  if (action === "reschedule") { body.scheduledAt = ist(str(form, "scheduledAt")); body.reason = str(form, "reason"); }
  if (action === "cancel" || action === "no-show") body.reason = str(form, "reason") || undefined;
  if (action === "complete") {
    body.feedback = str(form, "feedback") || undefined; body.interestAfter = str(form, "interestAfter") || undefined;
    body.employeeNotes = str(form, "employeeNotes") || undefined; body.nextAction = str(form, "nextAction") || undefined;
  }
  const r = await staffApi.visitAction(s, safeId(str(form, "visitId")), action, body);
  done(l, back(l, form), r, `saved=${action}`);
}

export async function createFollowUp(form: FormData) {
  const l = lang(form);
  const s = await session(l);
  const r = await staffApi.createFollowUp(s, {
    leadId: safeId(str(form, "leadId")) || undefined, siteVisitId: safeId(str(form, "siteVisitId")) || undefined,
    title: str(form, "title"), description: str(form, "description") || undefined, dueAt: ist(str(form, "dueAt")),
    priority: str(form, "priority") || "normal", assignedTo: safeId(str(form, "assignedTo")) || undefined,
  });
  done(l, back(l, form), r, "saved=followup");
}
