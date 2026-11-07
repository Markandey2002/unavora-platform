import { createHmac } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

// LOCAL dev realm only (infra/local/keycloak/unavora-dev-realm.json): synthetic users and TOTP secret.
export const KC = process.env.E2E_KEYCLOAK_URL ?? "http://localhost:8180";
export const API = process.env.E2E_API_URL ?? "http://localhost:8080";
export const USERS = {
  director: ["director.local", "Director-local-1"],
  employee1: ["employee1.local", "Employee1-local-1"],
  employee2: ["employee2.local", "Employee2-local-1"],
} as const;
const DIRECTOR_TOTP_SECRET = "local-dev-director-totp-not-a-secret";
export const PUBLISHED_PROPERTY = "20000000-0000-0000-0000-000000000001"; // owned by employee1

export function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", Buffer.from(secret, "utf8")).update(counter).digest();
  const o = h[h.length - 1] & 0x0f;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Keycloak accepts a code once per 30 s window: always use a fresh window. */
export async function freshDirectorTotp(): Promise<string> {
  await new Promise((r) => setTimeout(r, 30_000 - (Date.now() % 30_000) + 1_000));
  return totp(DIRECTOR_TOTP_SECRET);
}

export async function signIn(page: Page, who: keyof typeof USERS) {
  await page.goto("/en/staff/login");
  await page.getByRole("link", { name: "Sign in with company account" }).click();
  await page.waitForURL((u) => u.origin === new URL(KC).origin);
  await page.locator("#username").fill(USERS[who][0]);
  await page.locator("#password").fill(USERS[who][1]);
  await page.locator("#kc-login").click();
  if (who === "director") {
    await page.locator("#otp").fill(await freshDirectorTotp());
    await page.locator("#kc-login").click();
  }
  await expect(page).toHaveURL(/\/en\/staff\/leads/);
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("You have signed out.")).toBeVisible();
}

/** A fresh property lead (assigned to employee1) via the public enquiry API, so tests never depend on each other. */
export async function newLead(request: APIRequestContext): Promise<string> {
  const phone = `97${String(Date.now()).slice(-7)}${Math.floor(Math.random() * 10)}`;
  const res = await request.post(`${API}/api/v1/public/enquiries`, {
    headers: { "X-Forwarded-For": `198.51.100.${1 + Math.floor(Math.random() * 250)}` },
    data: { name: "E2E Workflow Buyer", phone, propertyId: PUBLISHED_PROPERTY, language: "en", consent: true },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).reference as string;
}

/** "YYYY-MM-DDTHH:mm" in India time, for datetime-local inputs. */
export function istInput(msFromNow: number): string {
  return new Date(Date.now() + msFromNow + 5.5 * 3600_000).toISOString().slice(0, 16);
}
