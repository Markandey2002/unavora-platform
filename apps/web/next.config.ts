import type { NextConfig } from "next";

// Conservative security headers. CSP is tightened further before staging (nonce-based); see docs/SECURITY_ARCHITECTURE.md.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Approved public media (listing/project photographs). Local: the API serves them; staging/production: the CDN origin.
const mediaUrl = new URL(process.env.MEDIA_PUBLIC_URL ?? "http://localhost:8080/api/v1/public/media/");
const mediaIsLocal = ["localhost", "127.0.0.1", "[::1]"].includes(mediaUrl.hostname);

const config: NextConfig = {
  images: {
    remotePatterns: [new URL(`${mediaUrl.origin}${mediaUrl.pathname.replace(/\/?$/, "/")}**`), new URL("https://i.ytimg.com/vi/**")],
    // Only when the media origin itself is local (development). Never true for a CDN origin (SSRF protection).
    dangerouslyAllowLocalIP: mediaIsLocal,
  },
  output: "standalone",
  poweredByHeader: false,
  // Isolation: never let Turbopack infer a workspace root above this app (C:\Users\Dell holds an unrelated project).
  turbopack: { root: __dirname },
  // Optional cap on build workers for memory-constrained machines (e.g. NEXT_BUILD_CPUS=2). Default: Next decides.
  experimental: {
    // Owner submissions and staff media uploads: up to 5 photos x 5 MB through a Server Action (the API caps a request
    // at 27 MB and checks every file again). The 1 MB default rejected ordinary phone photos.
    serverActions: { bodySizeLimit: "27mb" },
    ...(process.env.NEXT_BUILD_CPUS ? { cpus: Number(process.env.NEXT_BUILD_CPUS) } : {}),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
