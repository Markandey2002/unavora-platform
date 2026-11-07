// GET /_bff/auth/google/start?lang=en  -> "Continue with Google"
// mock mode: redirects to the local synthetic account chooser (no Google contact).
// google mode: Authorization Code + PKCE + state + nonce against accounts.google.com (requires approved OAuth client).
import { NextRequest, NextResponse } from "next/server";
import { OAUTH_COOKIE, encodeState, isSecure, pkceChallenge, randomUrlSafe, siteOrigin } from "@/lib/bff";
import { customerAuthMode } from "@/lib/customer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang") === "hi" ? "hi" : "en";
  const mode = customerAuthMode();
  if (mode === "disabled") return NextResponse.redirect(new URL(`/${lang}/account?error=unavailable`, req.url), 303);

  const st = { state: randomUrlSafe(), nonce: randomUrlSafe(), verifier: randomUrlSafe(48), lang };
  let target: URL;
  if (mode === "mock") {
    target = new URL(`/${lang}/account/mock-google`, req.url);
    target.searchParams.set("state", st.state);
  } else {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) return NextResponse.redirect(new URL(`/${lang}/account?error=unavailable`, req.url), 303);
    target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    target.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${siteOrigin(req)}/_bff/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      state: st.state,
      nonce: st.nonce,
      code_challenge: pkceChallenge(st.verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
  }
  const res = NextResponse.redirect(target, 303);
  res.cookies.set(OAUTH_COOKIE, encodeState(st), {
    httpOnly: true, secure: isSecure(req), sameSite: "lax", path: "/_bff/auth", maxAge: 600,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
