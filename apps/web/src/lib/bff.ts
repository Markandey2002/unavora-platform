// Helpers shared by the /_bff route handlers (server only).
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_DEV, SESSION_COOKIE_SECURE } from "./customer";

export const OAUTH_COOKIE = "uai_oauth";

export type OAuthState = { state: string; nonce: string; verifier: string; lang: string };

export function randomUrlSafe(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function isSecure(req: NextRequest): boolean {
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return proto === "https";
}

/** Public origin of the site (behind CloudFront/ALB use SITE_URL; locally the request origin). */
export function siteOrigin(req: NextRequest): string {
  return process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
}

/** CSRF defence for mutating BFF routes: the browser-sent Origin must be our own site. */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  return origin === siteOrigin(req) || origin === req.nextUrl.origin;
}

export function clientIp(req: NextRequest): string | undefined {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || undefined;
}

export function setSessionCookie(res: NextResponse, req: NextRequest, token: string, expiresAt: string) {
  const secure = isSecure(req);
  res.cookies.set(secure ? SESSION_COOKIE_SECURE : SESSION_COOKIE_DEV, token, {
    httpOnly: true, secure, sameSite: "lax", path: "/", expires: new Date(expiresAt),
  });
}

export function clearSessionCookies(res: NextResponse) {
  for (const name of [SESSION_COOKIE_SECURE, SESSION_COOKIE_DEV]) {
    res.cookies.set(name, "", { httpOnly: true, path: "/", maxAge: 0, secure: name === SESSION_COOKIE_SECURE });
  }
}

export function encodeState(s: OAuthState): string {
  return Buffer.from(JSON.stringify(s)).toString("base64url");
}

export function decodeState(v: string | undefined): OAuthState | null {
  if (!v) return null;
  try {
    const s = JSON.parse(Buffer.from(v, "base64url").toString("utf8"));
    return typeof s.state === "string" && typeof s.lang === "string" ? s : null;
  } catch {
    return null;
  }
}

/** Synthetic Google subject for the mock adapter: stable per email, always prefixed "mock-". */
export function mockSubject(email: string): string {
  return "mock-" + createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24);
}

export function mockCredential(sub: string, email: string, name: string): string {
  const b = (s: string) => Buffer.from(s, "utf8").toString("base64url");
  return `mock-google:${b(sub)}:${b(email)}:${b(name)}`;
}
