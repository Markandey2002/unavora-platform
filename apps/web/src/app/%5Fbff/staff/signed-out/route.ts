// GET /_bff/staff/signed-out?state=en|hi  <- identity provider after RP-initiated logout. Only ever redirects to our own
// sign-in page (the state value is reduced to a language code).
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("state") === "hi" ? "hi" : "en";
  const res = NextResponse.redirect(new URL(`/${lang}/staff/login?signedOut=1`, req.url), 303);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
