// POST /_bff/staff/logout -> revokes the session in the API and clears the cookie. Same-origin only (CSRF).
import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/bff";
import { STAFF_COOKIE_DEV, STAFF_COOKIE_SECURE, staffAuth, staffSessionFrom } from "@/lib/staff";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const lang = (await req.formData()).get("lang") === "hi" ? "hi" : "en";
  const session = staffSessionFrom(req.cookies);
  if (session) await staffAuth.logout(session);
  const res = NextResponse.redirect(new URL(`/${lang}/staff/login?signedOut=1`, req.url), 303);
  for (const name of [STAFF_COOKIE_SECURE, STAFF_COOKIE_DEV]) {
    res.cookies.set(name, "", { httpOnly: true, path: "/", maxAge: 0, secure: name === STAFF_COOKIE_SECURE });
  }
  res.headers.set("Cache-Control", "no-store");
  return res;
}
