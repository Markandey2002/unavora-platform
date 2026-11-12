import { expect, test } from "@playwright/test";
import { PUBLISHED_PROPERTY, signIn, signOut } from "./staff-helpers";

// Website Phases B-D: owner submission -> CRM review/approval, director-published Insights, customer favourites and
// activity, sorting and city pages. Self-provisioning: works on an empty CI database (no manual-test data needed).
test.describe.configure({ mode: "serial" });

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a2c80000000049454e44ae426082", "hex");
let ownerRef = "";
const tag = `${Date.now()}`.slice(-6);

test("owner lists a property with a photo; it becomes a CRM submission, not a listing", async ({ page }) => {
  await page.goto("/en/list-your-property");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("List your property with UNAVORA");
  await page.getByLabel("Your name").fill(`Owner ${tag}`);
  await page.getByLabel("Mobile number").fill(`96${String(Date.now()).slice(-8)}`);
  await page.getByLabel("City").fill("Lucknow");
  await page.getByLabel("Property type").selectOption("villa");
  await page.getByLabel("Rent out").check();
  await page.getByLabel(/Expected price/).fill("25000");
  await page.getByLabel(/^Photos/).setInputFiles({ name: "front.png", mimeType: "image/png", buffer: PNG });
  await page.getByLabel(/authorised by the owner/).check();
  await page.getByRole("button", { name: "Submit property" }).click();
  await expect(page.getByRole("status")).toContainText("LEAD-");
  ownerRef = (await page.getByRole("status").textContent())!.match(/LEAD-\d+/)![0];
  await expect(page.getByRole("status")).toContainText("not published automatically");
});

test("director reviews and approves the owner submission in the CRM", async ({ page }) => {
  test.skip(test.info().project.name === "mobile", "CRM review runs once (desktop)");
  test.setTimeout(120_000);
  await signIn(page, "director");
  await page.goto("/en/staff/submissions?status=submitted");
  await page.getByTestId("submission-list").getByRole("link", { name: new RegExp(ownerRef) }).click();
  await expect(page.getByTestId("submission-status")).toHaveText("New");
  const photo = page.getByRole("link", { name: "front.png" });
  await expect(photo).toBeVisible();
  const res = await page.request.get(await photo.getAttribute("href") as string);
  expect(res.headers()["content-type"]).toBe("image/png");
  expect(res.headers()["cache-control"]).toContain("no-store");
  await page.getByTestId("review-form").getByLabel("Review note").fill("Photos and details checked");
  await page.getByRole("button", { name: "Mark as reviewed" }).click();
  await expect(page.getByTestId("submission-status")).toHaveText("Reviewed");
  await page.getByTestId("decision-form").getByLabel("Decision note").fill("Proceed to listing preparation");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByTestId("submission-status")).toHaveText("Approved");
  await signOut(page);
});

test("employee cannot open the content screens", async ({ page }) => {
  test.skip(test.info().project.name === "mobile", "runs once");
  await signIn(page, "employee1");
  await page.goto("/en/staff/content");
  await expect(page.getByTestId("not-permitted")).toBeVisible();
  await page.goto("/en/staff/content/articles");
  await expect(page.getByTestId("not-permitted")).toBeVisible();
  await signOut(page);
});

test("director publishes an Insight in the CRM; it appears on the website with sharing", async ({ page }) => {
  test.skip(test.info().project.name === "mobile", "CRM publishing runs once (desktop)");
  test.setTimeout(120_000);
  await signIn(page, "director");
  await page.goto("/en/staff/content/articles/new");
  const f = page.getByTestId("article-form");
  await f.getByLabel("Category").selectOption("guide");
  await f.getByLabel("Author name").fill("UNAVORA team");
  const en = f.locator("fieldset").first();
  await en.getByLabel("Title").fill(`E2E guide ${tag}`);
  await en.getByLabel("URL slug").fill(`e2e-guide-${tag}`);
  await en.getByLabel("Summary").fill("Checklist for buyers");
  await en.getByLabel(/^Text/).fill(`First paragraph ${tag}.\n\n## Checklist\n- Documents\n- Possession date`);
  await f.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("article-status")).toHaveText("draft");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("article-status")).toHaveText("published");
  const editorUrl = page.url();
  await signOut(page);

  await page.goto(`/en/insights?q=${tag}`);
  await page.getByRole("link", { name: `E2E guide ${tag}` }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`E2E guide ${tag}`);
  await expect(page.getByRole("heading", { name: "Checklist" })).toBeVisible();
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /wa\.me/);
  await expect(page.locator("script[type='application/ld+json']")).toHaveCount(1);
  const publicUrl = page.url();

  // Test content must never stay public: archive it again and check it has left the website.
  await signIn(page, "director");
  await page.goto(editorUrl);
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByTestId("article-status")).toHaveText("archived");
  await signOut(page);
  expect((await page.goto(publicUrl))?.status()).toBe(404);
});

test("signed-in customer saves a property and sees it with their enquiries in the account", async ({ page }) => {
  const email = `e2e.fav.${Date.now()}@example.test`;
  await page.goto("/en/account");
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page.getByLabel("Name").fill("E2E Favourites");
  await page.getByLabel("Gmail address").fill(email);
  await page.getByRole("button", { name: "Continue as this test user" }).click();
  await expect(page.getByText("Your account is ready.")).toBeVisible();
  await page.goto("/en/properties/sample-3bhk-apartment-sector-37-noida");
  await page.getByRole("button", { name: "Save property" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/en/account");
  await expect(page.getByTestId("saved-properties")).toContainText("3 BHK apartment");
  await expect(page.getByRole("heading", { name: "My enquiries" })).toBeVisible();
  expect(PUBLISHED_PROPERTY).toBeTruthy();
});

test("listing sorts by price; city pages exist only for cities with listings", async ({ page }) => {
  await page.goto("/en/properties?sort=price_asc");
  const prices = await page.locator("main ul li .font-display.text-2xl").allTextContents();
  const value = (p: string) => (p.includes("Cr") ? 1e7 : 1e5) * parseFloat(p.replace(/[^\d.]/g, ""));
  const nums = prices.filter((p) => /₹/.test(p)).map(value);
  for (let i = 1; i < nums.length; i++) expect(nums[i - 1]).toBeLessThanOrEqual(nums[i]);
  await page.goto("/en/locations/lucknow");
  await expect(page.getByRole("heading", { name: "Listings in this city" })).toBeVisible();
  await expect(page.locator("main ul li h3").first()).toBeVisible();
  const missing = await page.goto("/en/locations/atlantis");
  expect(missing?.status()).toBe(404);
});
