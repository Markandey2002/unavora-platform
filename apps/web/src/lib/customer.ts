// SERVER-ONLY client for the API's /internal/v1/** customer endpoints. The service credential and the customer
// session token never reach the browser: the token lives in an HttpOnly cookie set by the /_bff routes.
// Import this module only from route handlers, server components and server actions.

const base = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

/** mock = local synthetic accounts only; google = real Google OAuth (needs approved client); disabled = hidden. */
export type CustomerAuthMode = "mock" | "google" | "disabled";
export function customerAuthMode(): CustomerAuthMode {
  const m = process.env.CUSTOMER_AUTH_MODE;
  return m === "mock" || m === "google" ? m : "disabled";
}

export const SESSION_COOKIE_SECURE = "__Host-uai_customer";
export const SESSION_COOKIE_DEV = "uai_customer"; // plain-http localhost only (browsers need Secure for __Host-)

export type CustomerProfile = {
  reference: string; name: string; email: string | null; whatsappNumber: string | null; whatsappVerified: boolean;
  registeredAt: string | null; lastLoginAt: string | null; preferredLanguage: string;
};
export type LoginResult = { sessionToken: string; expiresAt: string; newAccount: boolean; customer: CustomerProfile };
export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string };

function internalHeaders(session?: string, extra: Record<string, string> = {}): Record<string, string> {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) throw new Error("INTERNAL_SERVICE_TOKEN is not configured");
  const h: Record<string, string> = { "Content-Type": "application/json", "X-Internal-Service-Token": token, ...extra };
  if (session) h["X-Customer-Session"] = session;
  return h;
}

async function call<T>(method: string, path: string, opts: { session?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method, cache: "no-store", headers: internalHeaders(opts.session, opts.headers),
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

export const customerApi = {
  loginWithGoogle: (credential: string, language: string, clientIp?: string) =>
    call<LoginResult>("POST", "/internal/v1/customer-auth/google", {
      body: { credential, language }, headers: clientIp ? { "X-Forwarded-For": clientIp } : {},
    }),
  logout: (session: string) => call<void>("POST", "/internal/v1/customer-auth/logout", { session }),
  me: (session: string) => call<CustomerProfile>("GET", "/internal/v1/customer/me", { session }),
  requestOtp: (session: string, phone: string, language: string) =>
    call<{ expiresInSeconds: number; resendAfterSeconds: number; alreadyVerified: boolean }>(
      "POST", "/internal/v1/customer/whatsapp/otp", { session, body: { phone, language } }),
  verifyOtp: (session: string, phone: string, code: string) =>
    call<CustomerProfile>("POST", "/internal/v1/customer/whatsapp/verify", { session, body: { phone, code } }),
  createRequest: (session: string, idempotencyKey: string, body: {
    type: "enquiry" | "callback" | "site_visit"; propertyId?: string; message?: string; preferredDate?: string;
    enquiryConsent: boolean; marketingConsent: boolean;
  }) => call<{ reference: string; type: string; status: string }>("POST", "/internal/v1/customer/requests", {
    session, body, headers: { "Idempotency-Key": idempotencyKey },
  }),
};

/** Reads the session cookie (either name) from a Next.js cookie store. */
export function sessionFrom(store: { get(name: string): { value: string } | undefined }): string | undefined {
  return store.get(SESSION_COOKIE_SECURE)?.value ?? store.get(SESSION_COOKIE_DEV)?.value;
}

/** Current signed-in customer, or null (no cookie, expired/revoked session, or API unavailable). */
export async function currentCustomer(store: { get(name: string): { value: string } | undefined }): Promise<CustomerProfile | null> {
  const s = sessionFrom(store);
  if (!s || customerAuthMode() === "disabled") return null;
  const r = await customerApi.me(s);
  return r.ok ? r.data : null;
}
