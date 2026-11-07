// POST /_bff/staff/logout -> revokes the session in the API and clears the cookie. Same-origin only (CSRF).
import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/bff";
import { STAFF_COOKIE_DEV, STAFF_COOKIE_SECURE, staffAuth, staffSessionFrom } from "@/lib/staff";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const lang = (await req.formData()).get("lang") === "hi" ? "hi" : "en";
  const session = staffSessionFrom(req.cookies);
  const r = session ? await staffAuth.logout(session, lang) : null;
  // Also end the identity provider's single sign-on session (OIDC RP-initiated logout), so the next person on this
  // device signs in as themselves. The provider returns to /_bff/staff/signed-out.
  const target = r?.ok && r.data.endSessionUrl ? r.data.endSessionUrl : new URL(`/${lang}/staff/login?signedOut=1`, req.url);
  const res = NextResponse.redirect(target, 303);
  for (const name of [STAFF_COOKIE_SECURE, STAFF_COOKIE_DEV]) {
    res.cookies.set(name, "", { httpOnly: true, path: "/", maxAge: 0, secure: name === STAFF_COOKIE_SECURE });
  }
  res.headers.set("Cache-Control", "no-store");
  return res;
}
