// POST /_bff/auth/logout  -> revokes the server-side session and clears the cookie.
import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies, sameOrigin } from "@/lib/bff";
import { customerApi, sessionFrom } from "@/lib/customer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const lang = (await req.formData()).get("lang") === "hi" ? "hi" : "en";
  const session = sessionFrom(req.cookies);
  if (session) await customerApi.logout(session);
  const res = NextResponse.redirect(new URL(`/${lang}/account?signedOut=1`, req.url), 303);
  clearSessionCookies(res);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
