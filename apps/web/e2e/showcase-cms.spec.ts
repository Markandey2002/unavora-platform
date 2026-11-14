import { expect, test } from "@playwright/test";
import { signIn, signOut } from "./staff-helpers";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a2c80000000049454e44ae426082", "hex");

// CRM → Website content → Showcase: the director creates an illustrative item, publishes it, edits Hindi text, replaces
// the image, links a real published listing and finally archives it (e2e tests archive what they publish).
test("director replaces showcase content through the CMS without code changes", async ({ page }) => {
  test.skip(test.info().project.name === "mobile", "CRM work runs once (desktop)");
  test.setTimeout(240_000);
  const title = `E2E showcase ${Date.now()}`;
  await signIn(page, "director");

  // 0. two licensed images through the image library (scan -> licence -> director approval); CI starts with none
  const alts = [`${title} image A`, `${title} image B`];
  for (const alt of alts) {
    await page.goto("/en/staff/content/library");
    const up = page.getByTestId("library-upload");
    await up.getByLabel(/^File/).setInputFiles({ name: "showcase.png", mimeType: "image/png", buffer: PNG });
    await up.locator("select[name=kind]").selectOption("representative");
    await up.getByLabel(/^Alt text/).fill(alt);
    await up.getByLabel("Photographer / source").fill("E2E test image");
    await up.getByLabel("Licence / permission").fill("Test fixture (not public)");
    await up.getByRole("button", { name: "Upload photo" }).click();
    await expect(page.getByRole("status")).toBeVisible();
    const item = page.getByTestId("library-item").filter({ has: page.locator(`input[name=altEn][value="${alt}"]`) });
    await item.getByRole("button", { name: "Approve for website" }).click();
    await expect(page.getByRole("status")).toBeVisible();
  }

  await page.goto("/en/staff/content");
  await page.getByRole("link", { name: /Showcase/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Showcase/);

  // 1. create (draft, not on the website)
  const add = page.locator("form").filter({ has: page.getByRole("button", { name: "New showcase item" }) });
  await add.getByLabel("Category").selectOption("villa");
  await add.getByLabel("Title (English)").fill(title);
  await add.getByLabel("Description (English)").fill("Garden homes for families.");
  await add.getByRole("button", { name: "New showcase item" }).click();
  await expect(page).toHaveURL(/\/en\/staff\/content\/showcase\/[0-9a-f-]{36}\?saved=1/);
  await expect(page.getByTestId("showcase-status")).toHaveText(/Draft/);
  const editor = page.url().split("?")[0];

  // 2. pick an approved image, set position; publishing without one is refused
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("form-error")).toContainText("approved image");
  const picker = page.getByTestId("showcase-images").locator("label");
  await picker.filter({ hasText: alts[0] }).click();
  await page.getByLabel("Position (lower comes first)").fill("0");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByTestId("showcase-preview").getByText(title)).toHaveCount(2);   // desktop (en) + phone (hi falls back to en)

  // 3. publish -> visible on the homepage, labelled illustrative
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("showcase-status")).toHaveText("Published");
  await page.goto("/en");
  const card = page.getByTestId("showcase-card").filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("illustrative-label")).toHaveText(/Illustrative example/i);

  // 4. Hindi text + replace the image (director edit stays live)
  await page.goto(editor);
  await page.getByLabel("Title (Hindi, optional)").fill(`उदाहरण ${title}`);
  await picker.filter({ hasText: alts[1] }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("showcase-status")).toHaveText("Published");
  // A page pre-rendered at build time can serve its previous version until its 60-second refresh (known limitation).
  await expect(async () => {
    await page.goto("/hi");
    await expect(page.getByTestId("showcase-card").filter({ hasText: `उदाहरण ${title}` })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 80_000, intervals: [5_000] });

  // 5. link a real published listing: the button opens that record
  await page.goto(editor);
  const linkSelect = page.getByTestId("showcase-link");
  const propertyValue = await linkSelect.locator("option[value^='property:']").first().getAttribute("value");
  test.skip(!propertyValue, "no published listing to link in this database");
  await linkSelect.selectOption(propertyValue!);
  await page.getByRole("combobox", { name: "Button", exact: true }).selectOption("view_record");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.goto("/en");
  await expect(page.getByTestId("showcase-card").filter({ hasText: title }).getByRole("link", { name: "View the actual listing" }))
    .toHaveAttribute("href", /\/en\/properties\/[a-z0-9-]+$/);

  // 6. archive -> gone from the website; history kept
  await page.goto(editor);
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByTestId("showcase-status")).toHaveText("Archived");
  await expect(page.getByTestId("showcase-history")).toContainText("publish");
  await expect(page.getByTestId("showcase-history")).toContainText("archive");
  await page.goto("/en");
  await expect(page.getByTestId("showcase-card").filter({ hasText: title })).toHaveCount(0);
  await page.goto("/en/staff/content");
  await signOut(page);
});
