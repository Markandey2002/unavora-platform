// Server-side guard for staff pages. Every page calls requireStaff() itself (a layout alone is not a security
// boundary in the App Router), and the API independently re-checks session, MFA and permissions on every call.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ApiResult, StaffMe } from "./staff";
import { staffApi, staffSessionFrom } from "./staff";

export async function requireStaff(lang: string): Promise<{ session: string; me: StaffMe }> {
  const session = staffSessionFrom(await cookies());
  if (!session) redirect(`/${lang}/staff/login`);
  const r = await staffApi.me(session);
  if (!r.ok) redirect(`/${lang}/staff/login?error=${r.status === 401 ? "session_expired" : "generic"}`);
  return { session, me: r.data };
}

/** An API call failed after sign-in: send expired sessions back to the login page, return the error code otherwise. */
export function handle<T>(lang: string, r: ApiResult<T>): T | { error: string; status: number } {
  if (r.ok) return r.data;
  if (r.status === 401) redirect(`/${lang}/staff/login?error=session_expired`);
  return { error: r.code, status: r.status };
}

export function isError(x: unknown): x is { error: string; status: number } {
  return typeof x === "object" && x !== null && "error" in x && "status" in x;
}
