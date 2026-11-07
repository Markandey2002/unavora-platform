// SERVER-ONLY client for the staff CRM (/internal/v1/staff/**, /internal/v1/director/**). Import only from route
// handlers, server components and server actions. The staff session token lives in an HttpOnly cookie; the API
// re-checks session validity, MFA and every permission on each call.
const base = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

export const STAFF_COOKIE_SECURE = "__Host-uai_staff";
export const STAFF_COOKIE_DEV = "uai_staff"; // plain-http localhost only
export const STAFF_FLOW_COOKIE = "uai_staff_flow";

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string };

export type StaffMe = {
  id: string; name: string; email: string; preferredLanguage: string; roles: string[]; permissions: string[];
  mfaVerified: boolean; mfaRequired: boolean;
};
export type LeadRow = {
  id: string; reference: string; customerId: string; customerName: string; phone: string | null; stage: string;
  stageName: string; enquiryType: string; propertyTitle: string | null; priority: number; assignedUserId: string | null;
  assignedUserName: string | null; nextActionAt: string | null; nextActionNote: string | null; createdAt: string;
};
export type LeadPage = { items: LeadRow[]; nextCursor: string | null };
export type Activity = { type: string; summary: string; actorName: string | null; occurredAt: string };
export type CustomerRow = {
  id: string; reference: string; name: string; email: string | null; phone: string | null; whatsapp: string | null;
  whatsappVerified: boolean; registeredAt: string | null; lastLoginAt: string | null; signupSource: string | null;
  openLeads: number; createdAt: string;
};
export type CustomerPage = { items: CustomerRow[]; nextCursor: string | null };
export type CustomerDetail = {
  customer: CustomerRow; preferredLanguage: string; actions: { callUrl: string | null; whatsappUrl: string | null };
  consents: { purpose: string; granted: boolean; noticeVersion: string; source: string; recordedAt: string }[];
  leads: { id: string; reference: string; enquiryType: string; stage: string; assignedUserId: string | null; createdAt: string; nextActionAt: string | null }[];
  communications: { id: string; channel: string; direction: string; recordOrigin: string; deliveryStatus: string; summary: string | null; actorUserId: string | null; leadId: string | null; occurredAt: string }[];
  followUps: { id: string; title: string; status: string; dueAt: string; assignedTo: string; leadId: string | null }[];
};
export type FollowUpItem = {
  id: string; title: string; description: string | null; dueAt: string; overdue: boolean; customerId: string;
  customerName: string; customerReference: string; leadId: string | null; leadReference: string | null;
};
export type Overview = {
  totalLeads: number; newLast7Days: number; unassigned: number; publishedProperties: number;
  avgFirstResponseMinutes: number | null; leadsByStage: { stage: string; name: string; count: number }[];
};

function headers(session?: string, extra: Record<string, string> = {}): Record<string, string> {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) throw new Error("INTERNAL_SERVICE_TOKEN is not configured");
  const h: Record<string, string> = { "Content-Type": "application/json", "X-Internal-Service-Token": token, ...extra };
  if (session) h["X-Staff-Session"] = session;
  return h;
}

async function call<T>(method: string, path: string, opts: { session?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method, cache: "no-store", headers: headers(opts.session, opts.headers),
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    return { ok: false, status: 503, code: "api_unreachable" };
  }
  if (res.ok) return { ok: true, status: res.status, data: res.status === 204 ? (undefined as T) : await res.json() };
  let code = "generic";
  try { code = (await res.json()).code ?? code; } catch { /* ignore */ }
  return { ok: false, status: res.status, code };
}

const qs = (p: Record<string, string | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) s.set(k, v);
  const out = s.toString();
  return out ? `?${out}` : "";
};

export const staffAuth = {
  start: (language: string, clientIp?: string) =>
    call<{ authorizationUrl: string; state: string }>("POST", "/internal/v1/staff-auth/start", {
      body: { language }, headers: clientIp ? { "X-Forwarded-For": clientIp } : {},
    }),
  complete: (code: string, state: string, clientIp?: string) =>
    call<{ sessionToken: string; expiresAt: string; idleTimeoutSeconds: number; language: string }>(
      "POST", "/internal/v1/staff-auth/complete", { body: { code, state }, headers: clientIp ? { "X-Forwarded-For": clientIp } : {} }),
  logout: (session: string) => call<void>("POST", "/internal/v1/staff-auth/logout", { headers: { "X-Staff-Session": session } }),
};

export const staffApi = {
  me: (s: string) => call<StaffMe>("GET", "/internal/v1/staff/me", { session: s }),
  leads: (s: string, p: { stage?: string; assignee?: string; cursor?: string }) =>
    call<LeadPage>("GET", `/internal/v1/staff/leads${qs({ ...p, limit: "20" })}`, { session: s }),
  lead: (s: string, id: string) => call<LeadRow>("GET", `/internal/v1/staff/leads/${encodeURIComponent(id)}`, { session: s }),
  leadActivities: (s: string, id: string) => call<Activity[]>("GET", `/internal/v1/staff/leads/${encodeURIComponent(id)}/activities`, { session: s }),
  customers: (s: string, p: { registered?: string; cursor?: string }) =>
    call<CustomerPage>("GET", `/internal/v1/staff/customers${qs({ ...p, limit: "20" })}`, { session: s }),
  customer: (s: string, id: string) => call<CustomerDetail>("GET", `/internal/v1/staff/customers/${encodeURIComponent(id)}`, { session: s }),
  logCommunication: (s: string, customerId: string, body: { channel: string; direction: string; summary: string; leadId?: string }) =>
    call<{ id: string }>("POST", `/internal/v1/staff/customers/${encodeURIComponent(customerId)}/communications`, { session: s, body }),
  addFollowUp: (s: string, customerId: string, body: { title: string; description?: string; dueAt: string; leadId?: string }) =>
    call<{ id: string }>("POST", `/internal/v1/staff/customers/${encodeURIComponent(customerId)}/follow-ups`, { session: s, body }),
  followUps: (s: string) => call<FollowUpItem[]>("GET", "/internal/v1/staff/follow-ups", { session: s }),
  completeFollowUp: (s: string, id: string) =>
    call<FollowUpItem>("POST", `/internal/v1/staff/follow-ups/${encodeURIComponent(id)}/complete`, { session: s }),
  overview: (s: string) => call<Overview>("GET", "/internal/v1/director/overview", { session: s }),
};

export function staffSessionFrom(store: { get(name: string): { value: string } | undefined }): string | undefined {
  return store.get(STAFF_COOKIE_SECURE)?.value ?? store.get(STAFF_COOKIE_DEV)?.value;
}

export function can(me: StaffMe, permission: string): boolean {
  return me.permissions.includes(permission);
}
