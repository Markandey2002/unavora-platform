// GET /_bff/staff/login?lang=en -> API creates the sign-in request (state, nonce, PKCE verifier kept in the API) and
// returns the provider URL; we bind the browser to that attempt with a short-lived HttpOnly cookie holding the state.
import { NextRequest, NextResponse } from "next/server";
import { clientIp, isSecure } from "@/lib/bff";
import { STAFF_FLOW_COOKIE, staffAuth } from "@/lib/staff";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang") === "hi" ? "hi" : "en";
  const r = await staffAuth.start(lang, clientIp(req));
  if (!r.ok) return NextResponse.redirect(new URL(`/${lang}/staff/login?error=${encodeURIComponent(r.code)}`, req.url), 303);
  const res = NextResponse.redirect(r.data.authorizationUrl, 303);
  res.cookies.set(STAFF_FLOW_COOKIE, `${lang}.${r.data.state}`, {
    httpOnly: true, secure: isSecure(req), sameSite: "lax", path: "/_bff/staff", maxAge: 600,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
