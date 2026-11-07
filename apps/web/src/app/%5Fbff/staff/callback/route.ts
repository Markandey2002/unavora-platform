// GET /_bff/staff/callback?code&state (from the identity provider). The state must match the HttpOnly flow cookie
// (login-CSRF protection). The API exchanges the code (PKCE verifier + client secret held server-side), enforces
// invitation-only and director MFA, and returns an opaque session token that we store in an HttpOnly cookie.
import { NextRequest, NextResponse } from "next/server";
import { clientIp, isSecure } from "@/lib/bff";
import { STAFF_COOKIE_DEV, STAFF_COOKIE_SECURE, STAFF_FLOW_COOKIE, staffAuth } from "@/lib/staff";

export const dynamic = "force-dynamic";

function toLogin(req: NextRequest, lang: string, error: string) {
  const res = NextResponse.redirect(new URL(`/${lang}/staff/login?error=${encodeURIComponent(error)}`, req.url), 303);
  res.cookies.set(STAFF_FLOW_COOKIE, "", { path: "/_bff/staff", maxAge: 0 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(req: NextRequest) {
  const flow = req.cookies.get(STAFF_FLOW_COOKIE)?.value ?? "";
  const dot = flow.indexOf(".");
  const lang = flow.slice(0, dot) === "hi" ? "hi" : "en";
  const expectedState = dot > 0 ? flow.slice(dot + 1) : "";
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return toLogin(req, lang, "login_cancelled");
  const code = p.get("code");
  const state = p.get("state");
  if (!code || !state || !expectedState || state !== expectedState) return toLogin(req, lang, "login_expired");

  const r = await staffAuth.complete(code, state, clientIp(req));
  if (!r.ok) return toLogin(req, lang, r.code);

  const res = NextResponse.redirect(new URL(`/${lang}/staff/leads`, req.url), 303);
  res.cookies.set(STAFF_FLOW_COOKIE, "", { path: "/_bff/staff", maxAge: 0 });
  const secure = isSecure(req);
  for (const name of [STAFF_COOKIE_SECURE, STAFF_COOKIE_DEV]) res.cookies.set(name, "", { path: "/", maxAge: 0, secure: name === STAFF_COOKIE_SECURE });
  res.cookies.set(secure ? STAFF_COOKIE_SECURE : STAFF_COOKIE_DEV, r.data.sessionToken, {
    httpOnly: true, secure, sameSite: "lax", path: "/", expires: new Date(r.data.expiresAt),
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
