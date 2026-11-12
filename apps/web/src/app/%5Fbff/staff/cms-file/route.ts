// GET /_bff/staff/cms-file?m=<mediaId> -> streams the PRIVATE original of a site-library image to signed-in staff
// (preview before approval). The API checks session and cms.manage; never cached, never public.
import { NextRequest, NextResponse } from "next/server";
import { staffSessionFrom } from "@/lib/staff";

export const dynamic = "force-dynamic";
const ID = /^[0-9a-f-]{36}$/;

export async function GET(req: NextRequest) {
  const m = req.nextUrl.searchParams.get("m") ?? "";
  const session = staffSessionFrom(req.cookies);
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!session || !token || !ID.test(m)) return new NextResponse("Not found", { status: 404 });
  const base = process.env.API_INTERNAL_URL ?? "http://localhost:8080";
  let res: Response;
  try {
    res = await fetch(`${base}/internal/v1/staff/cms/media/${m}/file`, {
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
