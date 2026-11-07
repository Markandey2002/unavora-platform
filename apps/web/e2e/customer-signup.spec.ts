import { expect, test } from "@playwright/test";

// Requires the local stack with MOCK adapters: API (local profile) and web with CUSTOMER_AUTH_MODE=mock.
// No Google account and no WhatsApp provider is contacted. All data is synthetic.
const API = process.env.E2E_API_URL ?? "http://localhost:8080";
const TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? "local-dev-internal-token-not-a-secret";

test("customer signs up with Google (mock), verifies WhatsApp and requests a site visit", async ({ page, request }, info) => {
  const tag = `${info.project.name}-${Date.now()}`;
  const email = `e2e.${tag}@example.test`;
  const phone = `98${String(Date.now()).slice(-7)}${info.project.name === "mobile" ? 1 : 2}`; // unique per parallel project

  await page.goto("/en/account");
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await expect(page.getByText("mock Google sign-in")).toBeVisible();
  await page.getByLabel("Name").fill("E2E Synthetic Buyer");
  await page.getByLabel("Gmail address").fill(email);
  await page.getByRole("button", { name: "Continue as this test user" }).click();

  await expect(page.getByText("Your account is ready.")).toBeVisible();
  await expect(page.getByTestId("profile-email")).toHaveText(email);
  const reference = (await page.getByTestId("profile-reference").textContent())!;
  expect(reference).toMatch(/^CUS-/);

  // WhatsApp OTP (mock inbox)
  await page.getByLabel("WhatsApp number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Code sent on WhatsApp")).toBeVisible();
  const inbox = await request.get(`${API}/internal/v1/dev/mock-whatsapp/latest?phone=${phone}`, {
    headers: { "X-Internal-Service-Token": TOKEN },
  });
  expect(inbox.ok()).toBeTruthy();
  const { code } = await inbox.json();
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByText("WhatsApp verified")).toBeVisible();

  // Signed-in request on a property -> separate lead
  await page.goto("/en/properties");
  await page.getByRole("link", { name: /3 BHK apartment/ }).click();
  await page.getByLabel("Schedule a site visit").check();
  const d = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Preferred date").fill(d);
  await page.getByLabel(/agree to be contacted about this request/).check();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("status")).toContainText("LEAD-");

  // Sign out, sign in again with the same Google account -> same profile, no duplicate
  await page.goto("/en/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page.getByLabel("Gmail address").fill(email);
  await page.getByRole("button", { name: "Continue as this test user" }).click();
  await expect(page.getByTestId("profile-reference")).toHaveText(reference);
  await expect(page.getByText("Your account is ready.")).toHaveCount(0);
  await expect(page.getByTestId("profile-whatsapp")).toContainText("Verified");
});

test("session cookie is HttpOnly and BFF routes are not language-redirected", async ({ page, context }) => {
  await page.goto("/en/account");
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page.getByLabel("Gmail address").fill(`cookie.${Date.now()}@example.test`);
  await page.getByRole("button", { name: "Continue as this test user" }).click();
  const cookie = (await context.cookies()).find((c) => c.name.endsWith("uai_customer"));
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect(await page.evaluate(() => document.cookie)).not.toContain("uai_customer");
});

test("logout without same-origin Origin header is refused", async ({ request }) => {
  const res = await request.post("/_bff/auth/logout", { form: { lang: "en" }, headers: { Origin: "https://evil.example" }, maxRedirects: 0 });
  expect(res.status()).toBe(403);
});
