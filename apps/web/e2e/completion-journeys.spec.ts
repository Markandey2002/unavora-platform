import { expect, test, type Page } from "@playwright/test";
import { signIn, signOut } from "./staff-helpers";

// Website completion journeys (owner brief 2026-11-09), self-provisioning on an empty CI database:
//  CRM: project + listing created, reviewed, photographed (scan -> approval) and published by the director;
//       owner submission -> review -> approval -> "Create draft listing"; channel-partner lead visible in the CRM;
//       Insight preview before publishing; verified social link appears in the footer.
//  Public: A new launch -> detail -> enquiry; B search -> listing -> detail with approved photo gallery -> enquiry;
//          F customer account sign-in/out; G contact validation.
// Everything published here is archived/unpublished again at the end (no test content stays public).
test.describe.configure({ mode: "serial" });

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a2c80000000049454e44ae426082", "hex");
const tag = `${Date.now()}`.slice(-6);
const project = { name: `E2E Launch ${tag}`, slug: `e2e-launch-${tag}` };
const listing = { title: `E2E Listing ${tag}`, slug: `e2e-listing-${tag}` };
const mobile = () => test.info().project.name === "mobile";
const phone = (p: string) => `${p}${String(Date.now()).slice(-8)}`;
let ownerRef = "";
let partnerRef = "";

async function chooseFirst(page: Page, label: string | RegExp, scope = page.locator("main")) {
  const select = scope.getByLabel(label).first();
  const value = await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(value!);
}

test("public submissions that the director will process: owner property and channel partner", async ({ page }) => {
  test.skip(mobile(), "runs once (desktop)");
  await page.goto("/en/list-your-property");
  await page.getByLabel("Your name").fill(`Owner Convert ${tag}`);
  await page.getByLabel("Mobile number").fill(phone("95"));
  await page.getByLabel("City").fill("Noida");
  await page.getByLabel("Property type").selectOption("villa");
  await page.getByLabel(/Expected price/).fill("21000000");
  await page.getByLabel(/^Photos/).setInputFiles({ name: "villa.png", mimeType: "image/png", buffer: PNG });
  await page.getByLabel(/authorised by the owner/).check();
  await page.getByRole("button", { name: "Submit property" }).click();
  ownerRef = (await page.getByRole("status").textContent())!.match(/LEAD-\d+/)![0];

  await page.goto("/en/channel-partner");
  await page.getByLabel("Your name").fill(`Partner ${tag}`);
  await page.getByLabel("Mobile number").fill(phone("94"));
  await page.getByLabel("City").fill("Noida");
  await page.getByLabel(/agree to be contacted about this application/).check();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("status")).toContainText("LEAD-");
  partnerRef = (await page.getByRole("status").textContent())!.match(/LEAD-\d+/)![0];
});

test("director: project, listing with approved photo, conversion, partner lead, Insight preview, social link", async ({ page }) => {
  test.skip(mobile(), "CRM work runs once (desktop)");
  test.setTimeout(480_000);
  await signIn(page, "director");

  // D. the channel-partner application is a CRM lead
  await page.goto("/en/staff/leads");
  await expect(page.getByText(partnerRef).first()).toBeVisible();

  // New launch: project created and published with approval switches
  await page.goto("/en/staff/projects/new");
  let f = page.getByTestId("project-form");
  await chooseFirst(page, "Locality", f);
  await f.getByLabel("Category").first().selectOption("residential");
  await f.getByLabel("Main property type").selectOption("apartment");
  await f.getByLabel("Construction status").selectOption("under_construction");
  await f.getByLabel("Possession date", { exact: true }).fill("2029-03-01");
  await f.getByLabel(/Possession date documented/).check();
  await f.getByLabel("Label", { exact: true }).first().fill("2 BHK");
  await f.getByLabel("Base price (₹)", { exact: true }).first().fill("6800000");
  await f.getByLabel(/Unit prices approved/).check();
  const en = f.getByRole("group", { name: "English" });
  await en.getByLabel("Title").fill(project.name);
  await en.getByLabel("URL slug").fill(project.slug);
  await en.getByLabel("Description").fill("Automated test project: two-bedroom homes near the metro, used only by the end-to-end tests.");
  await f.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("project-status")).toHaveText("Draft");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("project-status")).toHaveText("Published");

  // Listing: draft -> submit -> approve -> photo (scan clean, alt text, approve) -> publish
  await page.goto("/en/staff/listings/new");
  f = page.getByTestId("listing-form");
  await f.getByLabel(/^Property type/).first().selectOption("apartment");
  await chooseFirst(page, "Locality", f);
  await f.getByLabel("Price (₹)", { exact: true }).fill("7500000");
  await f.getByLabel("Built-up area").fill("1200");
  await f.getByLabel("Bedrooms", { exact: true }).fill("2");
  const len = f.getByRole("group", { name: "English" });
  await len.getByLabel("Title").fill(listing.title);
  await len.getByLabel("URL slug").fill(listing.slug);
  await len.getByLabel("Description").fill("Automated test listing: bright two-bedroom flat with lift, used only by the end-to-end tests.");
  await f.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("listing-status")).toHaveText("Draft");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByTestId("listing-status")).toHaveText("Waiting for review");
  await page.getByTestId("listing-review").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByTestId("listing-status")).toHaveText("Approved");
  const up = page.getByTestId("media-upload");
  await up.getByLabel(/^File/).setInputFiles({ name: "front.png", mimeType: "image/png", buffer: PNG });
  await up.getByLabel(/Alt text/).fill("Front of the test building");
  await up.getByLabel("Caption").fill("Entrance");
  await up.getByRole("button", { name: "Upload photo" }).click();
  const item = page.getByTestId("media-item").first();
  await expect(item.getByTestId("scan-status")).toContainText("Scan: clean");
  await expect(item.getByTestId("media-visibility")).toHaveText("Private");
  await item.getByRole("button", { name: "Approve for website" }).click();
  await expect(page.getByTestId("media-item").first().getByTestId("media-visibility")).toHaveText("On website");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("listing-status")).toHaveText("Published");

  // C. owner submission -> review -> approval -> draft listing (never published automatically)
  await page.goto("/en/staff/submissions?status=submitted");
  await page.getByRole("link", { name: new RegExp(ownerRef) }).click();
  await page.getByTestId("review-form").getByLabel("Review note").fill("Checked photos and documents");
  await page.getByRole("button", { name: "Mark as reviewed" }).click();
  await page.getByTestId("decision-form").getByLabel("Decision note").fill("Prepare the listing");
  await page.getByRole("button", { name: "Approve" }).click();
  const convert = page.getByTestId("convert-form");
  await chooseFirst(page, "Locality", convert);
  await expect(convert.getByRole("checkbox")).toBeChecked();
  await convert.getByRole("button", { name: "Create draft listing" }).click();
  await expect(page.getByTestId("listing-status")).toHaveText("Draft");
  await expect(page.getByRole("link", { name: ownerRef })).toBeVisible();
  await expect(page.getByTestId("media-item").first().getByTestId("media-visibility")).toHaveText("Private");

  // E. Insight: create -> preview (draft) -> publish -> public -> archive
  await page.goto("/en/staff/content/articles/new");
  const af = page.getByTestId("article-form");
  await af.getByLabel("Category").selectOption("guide");
  await af.getByLabel("Author name").fill("UNAVORA team");
  const aen = af.locator("fieldset").first();
  await aen.getByLabel("Title").fill(`E2E preview ${tag}`);
  await aen.getByLabel("URL slug").fill(`e2e-preview-${tag}`);
  await aen.getByLabel(/^Text/).fill(`Preview paragraph ${tag}.\n\n## Steps\n- One\n- Two`);
  await af.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("article-status")).toHaveText("draft");
  const editor = page.url();
  await page.getByTestId("article-preview").click();
  await expect(page.getByTestId("preview-banner")).toContainText("draft");
  await expect(page.getByRole("heading", { name: "Steps" })).toBeVisible();
  await page.goto(editor);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("article-status")).toHaveText("published");
  expect((await page.request.get(`/en/insights/e2e-preview-${tag}`)).status()).toBe(200);
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByTestId("article-status")).toHaveText("archived");

  // Social: a verified official profile appears in the footer; unverified it disappears
  await page.goto("/en/staff/content/company");
  const ig = page.locator("form").filter({ hasText: "social.instagram" });
  await ig.getByRole("textbox").fill("https://www.instagram.com/unavora_e2e/");
  await ig.getByLabel(/Verified/).check();
  await ig.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/saved=1/);
  await page.goto("/en/about");
  await expect(page.getByTestId("footer-social").getByRole("link", { name: /Instagram/ })).toHaveAttribute("href", "https://www.instagram.com/unavora_e2e/");
  await page.goto("/en/staff/content/company");
  await page.locator("form").filter({ hasText: "social.instagram" }).getByLabel(/Verified/).uncheck();
  await page.locator("form").filter({ hasText: "social.instagram" }).getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/saved=1/);
  await page.goto("/en/about");
  await expect(page.getByTestId("footer-social")).toHaveCount(0);
  await page.goto("/en/staff/leads");
  await signOut(page);
});

test("A. new launch: homepage section -> project detail -> enquiry", async ({ page }) => {
  test.skip(mobile(), "uses the project published by the desktop run");
  await page.goto("/en");
  const section = page.getByRole("region", { name: "Newly launched projects" });
  await expect(section).toBeVisible();
  await section.getByRole("link", { name: project.name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(project.name);
  await expect(page.getByText("₹68.00 L").first()).toBeVisible();
  const form = page.locator("#project-enquiry");
  await form.getByLabel("Your name").fill("Launch Buyer");
  await form.getByLabel("Mobile number").fill(phone("93"));
  await form.getByLabel(/agree to be contacted/).check();
  await form.getByRole("button", { name: /Send|Request/ }).click();
  await expect(page.getByRole("status")).toContainText("LEAD-");
  // New Launches page: search by name, filter, newest first
  await page.goto(`/en/projects?q=${encodeURIComponent(project.name)}&category=residential`);
  await expect(page.getByRole("link", { name: project.name, exact: true })).toBeVisible();
  await page.goto(`/en/projects?q=${encodeURIComponent(project.name)}&category=commercial`);
  await expect(page.getByText("No launches match these filters.")).toBeVisible();
});

test("B. property: search -> listing -> detail with approved photo gallery -> enquiry", async ({ page }) => {
  test.skip(mobile(), "uses the listing published by the desktop run");
  await page.goto(`/en/properties?q=${encodeURIComponent(listing.title)}`);
  await page.getByRole("link", { name: listing.title, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(listing.title);
  const gallery = page.getByRole("region", { name: "Photos" });
  await gallery.getByRole("button", { name: /Open photo|View all photos/ }).first().click();
  const viewer = page.getByRole("dialog");
  await expect(viewer.getByRole("img", { name: "Front of the test building" })).toBeVisible();
  await expect(viewer.getByText("Entrance")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  const form = page.locator("#enquiry-form, form").filter({ has: page.getByLabel("Your name") }).first();
  await form.getByLabel("Your name").fill("Gallery Buyer");
  await form.getByLabel("Mobile number").fill(phone("92"));
  await form.getByLabel(/agree to be contacted/).check();
  await form.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByRole("status")).toContainText("LEAD-");
});

test("director cleans up: listing unpublished, project archived (no test content stays public)", async ({ page }) => {
  test.skip(mobile(), "runs once (desktop)");
  test.setTimeout(120_000);
  await signIn(page, "director");
  await page.goto(`/en/staff/listings?q=${encodeURIComponent(listing.title)}`);
  await page.getByRole("link", { name: listing.title, exact: true }).click();
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByTestId("listing-status")).toHaveText("Withdrawn");
  await page.goto("/en/staff/projects");
  await page.getByRole("link", { name: project.name, exact: true }).click();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByTestId("project-status")).toHaveText("Archived");
  await signOut(page);
  expect((await page.goto(`/en/properties/${listing.slug}`))?.status()).toBe(404);
  expect((await page.goto(`/en/projects/${project.slug}`))?.status()).toBe(404);
});

test("F. customer account: sign in, saved property, enquiries and visits, sign out", async ({ page }) => {
  await page.goto("/en/account");
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page.getByLabel("Name").fill("E2E Account");
  await page.getByLabel("Gmail address").fill(`e2e.account.${Date.now()}@example.test`);
  await page.getByRole("button", { name: "Continue as this test user" }).click();
  await expect(page.getByText("Your account is ready.")).toBeVisible();
  await page.goto("/en/properties/sample-3bhk-apartment-sector-37-noida");
  await page.getByRole("button", { name: "Save property" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  await page.goto("/en/account");
  await expect(page.getByTestId("saved-properties")).toContainText("3 BHK");
  await expect(page.getByRole("heading", { name: "My enquiries" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "My site visits" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
});

test("G. contact: consent is required; a valid enquiry returns a CRM reference", async ({ page }) => {
  await page.goto("/en/contact");
  const form = page.locator("#contact-enquiry");
  await form.getByLabel("Your name").fill("Contact Journey");
  await form.getByLabel("Mobile number").fill(phone("91"));
  await form.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);   // browser validation stops it: consent box is required
  await form.getByLabel(/agree to be contacted/).check();
  await form.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByRole("status")).toContainText("LEAD-");
});
