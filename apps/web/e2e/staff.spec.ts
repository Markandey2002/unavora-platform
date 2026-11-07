import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

// Requires the local stack: API (local profile), web, and the Keycloak dev realm (synthetic users).
// Real Keycloak sign-in in the browser: password for employees, password + TOTP for the director.
const KC = process.env.E2E_KEYCLOAK_URL ?? "http://localhost:8180";
const USERS = {
  director: ["director.local", "Director-local-1"],
  employee1: ["employee1.local", "Employee1-local-1"],
  employee2: ["employee2.local", "Employee2-local-1"],
  outsider: ["outsider.local", "Outsider-local-1"],
} as const;
// Synthetic TOTP secret of the LOCAL dev realm only (infra/local/keycloak/unavora-dev-realm.json).
const DIRECTOR_TOTP_SECRET = "local-dev-director-totp-not-a-secret";
const FOREIGN_LEAD = "40000000-0000-0000-0000-000000000002"; // assigned to employee2

function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", Buffer.from(secret, "utf8")).update(counter).digest();
  const o = h[h.length - 1] & 0x0f;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Keycloak refuses a code that was already used in the same 30 s window (replay protection): use a fresh window. */
async function freshTotp(): Promise<string> {
  const msIntoWindow = Date.now() % 30_000;
  await new Promise((r) => setTimeout(r, 30_000 - msIntoWindow + 1_000));
  return totp(DIRECTOR_TOTP_SECRET);
}

async function keycloakPassword(page: Page, who: keyof typeof USERS) {
  await page.waitForURL((u) => u.origin === new URL(KC).origin);
  await page.locator("#username").fill(USERS[who][0]);
  await page.locator("#password").fill(USERS[who][1]);
  await page.locator("#kc-login").click();
}

async function signIn(page: Page, who: keyof typeof USERS, otp?: () => Promise<string>) {
  await page.goto("/en/staff/login");
  await page.getByRole("link", { name: "Sign in with company account" }).click();
  await keycloakPassword(page, who);
  if (otp) {
    await page.locator("#otp").fill(await otp());
    await page.locator("#kc-login").click();
  }
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("You have signed out.")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("unauthenticated staff pages redirect to sign-in", async ({ page }) => {
  await page.goto("/en/staff/leads");
  await expect(page).toHaveURL(/\/en\/staff\/login/);
  await page.goto("/en/staff/overview");
  await expect(page).toHaveURL(/\/en\/staff\/login/);
});

test("employee signs in, sees only own leads, cannot open the director dashboard, signs out", async ({ page }) => {
  await signIn(page, "employee1");
  await expect(page).toHaveURL(/\/en\/staff\/leads/);
  await expect(page.getByTestId("staff-name")).toContainText("Employee One");
  await expect(page.getByTestId("lead-list")).toContainText("LEAD-LOCAL-1");
  await expect(page.getByTestId("lead-list")).not.toContainText("LEAD-LOCAL-2");
  await expect(page.getByRole("link", { name: "Director overview" })).toHaveCount(0);

  await page.goto(`/en/staff/leads/${FOREIGN_LEAD}`);
  await expect(page.getByTestId("not-found")).toBeVisible();
  await page.goto("/en/staff/overview");
  await expect(page.getByTestId("not-permitted")).toBeVisible();
  await signOut(page);
  await page.goto("/en/staff/leads");
  await expect(page).toHaveURL(/\/en\/staff\/login/);
});

test("session cookie is HttpOnly, SameSite=Lax, invisible to JS, and revoked server-side on sign-out", async ({ page, context }) => {
  await signIn(page, "employee1");
  const cookie = (await context.cookies()).find((c) => c.name.endsWith("uai_staff"));
  expect(cookie).toBeDefined();
  expect(cookie!.httpOnly).toBe(true);
  expect(cookie!.sameSite).toBe("Lax");
  expect(cookie!.path).toBe("/");
  expect(await page.evaluate(() => document.cookie)).not.toContain("uai_staff");
  // the browser never receives IdP tokens
  expect((await context.cookies()).some((c) => /token|jwt/i.test(c.name) && !c.domain.includes("8180"))).toBe(false);

  await signOut(page);
  // replaying the old cookie after sign-out must not work: the session was revoked in the database
  await context.addCookies([{ ...cookie!, expires: cookie!.expires }]);
  await page.goto("/en/staff/leads");
  await expect(page).toHaveURL(/\/en\/staff\/login\?error=session_expired/);
});

test("sign-out requires a same-origin request", async ({ request }) => {
  const res = await request.post("/_bff/staff/logout", { form: { lang: "en" }, headers: { Origin: "https://evil.example" }, maxRedirects: 0 });
  expect(res.status()).toBe(403);
});

test("a Keycloak user who was not invited to the CRM is refused", async ({ page }) => {
  await signIn(page, "outsider");
  await expect(page).toHaveURL(/\/en\/staff\/login\?error=not_invited/);
  await expect(page.getByText(/has not been invited to the CRM/)).toBeVisible();
  expect((await page.context().cookies()).some((c) => c.name.endsWith("uai_staff"))).toBe(false);
});

test("director must pass TOTP; wrong code is rejected; with the code the company-wide dashboard opens", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/en/staff/login");
  await page.getByRole("link", { name: "Sign in with company account" }).click();
  await keycloakPassword(page, "director");
  await expect(page.locator("#otp")).toBeVisible();           // second factor demanded
  await page.locator("#otp").fill("000000");
  await page.locator("#kc-login").click();
  await expect(page.locator("#otp")).toBeVisible();           // still on the OTP step
  await page.locator("#otp").fill(await freshTotp());
  await page.locator("#kc-login").click();

  await expect(page).toHaveURL(/\/en\/staff\/leads/);
  await expect(page.getByTestId("mfa-badge")).toBeVisible();
  await expect(page.getByTestId("lead-list")).toContainText("LEAD-LOCAL-2");   // company-wide
  await page.getByRole("link", { name: "Director overview" }).click();
  await expect(page.getByTestId("kpi-published")).toHaveText("4");
  await expect(page.getByTestId("stage-funnel")).toBeVisible();
  await page.goto(`/en/staff/leads/${FOREIGN_LEAD}`);
  await expect(page.getByTestId("lead-reference")).toHaveText("LEAD-LOCAL-2");
  await signOut(page);
});

test("complete CRM workflow: lead -> customer -> call/WhatsApp -> log contact -> follow-up -> done", async ({ page }, info) => {
  const tag = `${info.project.name}-${Date.now()}`;
  await signIn(page, "employee1");
  await page.getByTestId("lead-list").getByText("LEAD-LOCAL-1").click();
  await expect(page.getByTestId("lead-reference")).toHaveText("LEAD-LOCAL-1");
  await expect(page.getByTestId("call-action")).toHaveAttribute("href", /^tel:\+91\d{10}$/);
  await expect(page.getByTestId("whatsapp-action")).toHaveAttribute("href", /^https:\/\/wa\.me\/91\d{10}$/);
  await expect(page.getByTestId("whatsapp-action")).toHaveAttribute("rel", /noopener/);

  await page.getByRole("link", { name: "Open customer profile" }).click();
  await expect(page.getByTestId("customer-name")).toBeVisible();

  const logForm = page.locator("form").filter({ hasText: "Log a call or WhatsApp contact" });
  await logForm.getByLabel("Related lead").selectOption("40000000-0000-0000-0000-000000000001");
  await logForm.getByLabel("What happened").fill(`Called, discussed visit (${tag})`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expect(page.getByTestId("communications")).toContainText(tag);

  await page.getByLabel("Title").fill(`Send brochure ${tag}`);
  await page.getByRole("button", { name: "Add follow-up" }).click();
  await expect(page.getByTestId("customer-follow-ups")).toContainText(`Send brochure ${tag}`);

  await page.getByRole("link", { name: "My follow-ups" }).click();
  const item = page.getByRole("listitem").filter({ hasText: `Send brochure ${tag}` });
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expect(page.getByText(`Send brochure ${tag}`)).toHaveCount(0);

  // the work is on the lead's timeline
  await page.goto("/en/staff/leads/40000000-0000-0000-0000-000000000001");
  await expect(page.getByTestId("lead-timeline")).toContainText(tag);
  await signOut(page);
});

test("Hindi staff screens render", async ({ page }) => {
  await page.goto("/hi/staff/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.getByRole("heading", { name: "स्टाफ साइन-इन" })).toBeVisible();
});
