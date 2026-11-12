// GET /_bff/staff/submission-file?s=<submissionId>&f=<fileId> -> streams a PRIVATE owner photo to signed-in staff.
// The API checks the staff session and lead visibility; the response is never cached and never public.
import { NextRequest, NextResponse } from "next/server";
import { staffSessionFrom } from "@/lib/staff";

export const dynamic = "force-dynamic";
const ID = /^[0-9a-f-]{36}$/;

export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get("s") ?? "";
  const f = req.nextUrl.searchParams.get("f") ?? "";
  const session = staffSessionFrom(req.cookies);
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!session || !token || !ID.test(s) || !ID.test(f)) return new NextResponse("Not found", { status: 404 });
  const base = process.env.API_INTERNAL_URL ?? "http://localhost:8080";
  let res: Response;
  try {
    res = await fetch(`${base}/internal/v1/staff/submissions/${s}/files/${f}`, {
      headers: { "X-Internal-Service-Token": token, "X-Staff-Session": session }, cache: "no-store",
    });
  } catch {
    return new NextResponse("Unavailable", { status: 503 });
  }
  if (!res.ok) return new NextResponse("Not found", { status: res.status === 401 ? 401 : 404 });
  const type = res.headers.get("content-type") ?? "application/octet-stream";
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(await res.arrayBuffer(), {
    headers: { "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" },
  });
}
