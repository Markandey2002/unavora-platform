// GET /_bff/staff/media-file?t=property|project&o=<ownerId>&m=<mediaId> -> streams the PRIVATE original of a listing or
// project photo to signed-in staff (quarantine preview before approval). The API checks session and permission;
// the response is never cached and never public.
import { NextRequest, NextResponse } from "next/server";
import { staffSessionFrom } from "@/lib/staff";

export const dynamic = "force-dynamic";
const ID = /^[0-9a-f-]{36}$/;

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t");
  const o = req.nextUrl.searchParams.get("o") ?? "";
  const m = req.nextUrl.searchParams.get("m") ?? "";
  const session = staffSessionFrom(req.cookies);
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!session || !token || (t !== "property" && t !== "project") || !ID.test(o) || !ID.test(m)) return new NextResponse("Not found", { status: 404 });
  const base = process.env.API_INTERNAL_URL ?? "http://localhost:8080";
  let res: Response;
  try {
    res = await fetch(`${base}/internal/v1/staff/${t === "property" ? "properties" : "projects"}/${o}/media/${m}/file`, {
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
