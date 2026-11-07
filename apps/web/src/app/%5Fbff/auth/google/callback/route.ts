// Completes "Continue with Google".
//  POST (mock mode only): form from /[lang]/account/mock-google with a synthetic name + email.
//  GET  (google mode): ?code&state from Google; the code is exchanged server-side (client secret + PKCE verifier).
// Either way the API verifies the credential, creates/loads the ONE customer profile and returns an opaque session,
// which is stored in an HttpOnly cookie. No Google token is kept in the browser.
import { NextRequest, NextResponse } from "next/server";
import {
  OAUTH_COOKIE, clearSessionCookies, clientIp, decodeState, mockCredential, mockSubject, sameOrigin, setSessionCookie, siteOrigin,
} from "@/lib/bff";
import { customerApi, customerAuthMode } from "@/lib/customer";

export const dynamic = "force-dynamic";

function done(req: NextRequest, lang: string, query = ""): NextResponse {
  const res = NextResponse.redirect(new URL(`/${lang}/account${query}`, req.url), 303);
  res.cookies.set(OAUTH_COOKIE, "", { path: "/_bff/auth", maxAge: 0 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

async function finish(req: NextRequest, lang: string, credential: string) {
  const r = await customerApi.loginWithGoogle(credential, lang, clientIp(req));
  if (!r.ok) return done(req, lang, `?error=${encodeURIComponent(r.code)}`);
  const res = done(req, lang, r.data.newAccount ? "?welcome=1" : "");
  clearSessionCookies(res);
  setSessionCookie(res, req, r.data.sessionToken, r.data.expiresAt);
  return res;
}

export async function POST(req: NextRequest) {
  const st = decodeState(req.cookies.get(OAUTH_COOKIE)?.value);
  const form = await req.formData();
  const lang = st?.lang ?? "en";
  if (customerAuthMode() !== "mock") return new NextResponse("Not found", { status: 404 });
  if (!sameOrigin(req) || !st || form.get("state") !== st.state) return done(req, lang, "?error=state_mismatch");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim().slice(0, 200);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return done(req, lang, "?error=invalid_google_credential");
  return finish(req, lang, mockCredential(mockSubject(email), email, name));
}

export async function GET(req: NextRequest) {
  const st = decodeState(req.cookies.get(OAUTH_COOKIE)?.value);
  const lang = st?.lang ?? "en";
  if (customerAuthMode() !== "google") return new NextResponse("Not found", { status: 404 });
  const code = req.nextUrl.searchParams.get("code");
  if (!st || !code || req.nextUrl.searchParams.get("state") !== st.state) return done(req, lang, "?error=state_mismatch");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, grant_type: "authorization_code", code_verifier: st.verifier,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      redirect_uri: `${siteOrigin(req)}/_bff/auth/google/callback`,
    }),
  }).catch(() => null);
  if (!tokenRes?.ok) return done(req, lang, "?error=google_exchange_failed");
  const idToken: string | undefined = (await tokenRes.json()).id_token;
  // Nonce binds the token to this browser's login attempt; the API verifies signature, issuer, audience and expiry.
  try {
    const payload = JSON.parse(Buffer.from((idToken ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
    if (payload.nonce !== st.nonce) return done(req, lang, "?error=state_mismatch");
  } catch {
    return done(req, lang, "?error=invalid_google_credential");
  }
  return finish(req, lang, idToken!);
}
