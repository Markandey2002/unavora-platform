import type { NextConfig } from "next";

// Conservative security headers. CSP is tightened further before staging (nonce-based); see docs/SECURITY_ARCHITECTURE.md.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Isolation: never let Turbopack infer a workspace root above this app (C:\Users\Dell holds an unrelated project).
  turbopack: { root: __dirname },
  // Optional cap on build workers for memory-constrained machines (e.g. NEXT_BUILD_CPUS=2). Default: Next decides.
  ...(process.env.NEXT_BUILD_CPUS ? { experimental: { cpus: Number(process.env.NEXT_BUILD_CPUS) } } : {}),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
