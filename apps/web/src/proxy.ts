import { NextRequest, NextResponse } from "next/server";

// Next.js 16 "proxy" (formerly middleware): send bare paths to a language prefix. Authentication is NOT done here.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const m = /^\/(en|hi)(\/|$)/.exec(pathname);
  if (m) {
    // Lets not-found pages (which receive no route params) render in the visitor's language.
    const headers = new Headers(req.headers);
    headers.set("x-unavora-lang", m[1]);
    return NextResponse.next({ request: { headers } });
  }
  const accept = req.headers.get("accept-language") ?? "";
  const lang = /^hi\b/i.test(accept) ? "hi" : "en";
  const url = req.nextUrl.clone();
  url.pathname = `/${lang}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, 307);
}

// /_bff/** are same-origin BFF route handlers (auth); they must never be language-redirected.
export const config = { matcher: ["/((?!_next|_bff|api|favicon.ico|.*\\..*).*)"] };
