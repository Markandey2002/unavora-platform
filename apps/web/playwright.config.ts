import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  // One worker: the director's TOTP code may be used only once per 30 s window (Keycloak replay protection), so
  // mobile and desktop director sign-ins must not run at the same time. The suite is small.
  workers: 1,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
  projects: [{ name: "mobile", use: { viewport: { width: 390, height: 844 } } }, { name: "desktop", use: { viewport: { width: 1280, height: 800 } } }],
});
