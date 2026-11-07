import { NextRequest, NextResponse } from "next/server";

// Next.js 16 "proxy" (formerly middleware): send bare paths to a language prefix. Authentication is NOT done here.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (/^\/(en|hi)(\/|$)/.test(pathname)) return NextResponse.next();
  const accept = req.headers.get("accept-language") ?? "";
  const lang = /^hi\b/i.test(accept) ? "hi" : "en";
  const url = req.nextUrl.clone();
  url.pathname = `/${lang}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, 307);
}

// /_bff/** are same-origin BFF route handlers (auth); they must never be language-redirected.
export const config = { matcher: ["/((?!_next|_bff|api|favicon.ico|.*\\..*).*)"] };
