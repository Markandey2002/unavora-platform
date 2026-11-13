import { expect, test } from "@playwright/test";

// Illustrative showcase (V18). Needs published showcase items (infra/local/showcase/load_showcase_demo.py); skips otherwise.
const isMobile = () => test.info().project.name === "mobile";
const phone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

test("showcase cards are labelled illustrative, carry no prices and never appear in property search", async ({ page }) => {
  await page.goto("/en");
  const section = page.getByTestId("showcase");
  test.skip((await section.count()) === 0, "no published showcase items in this database");
  await expect(section.getByRole("heading", { name: "Explore property styles" })).toBeVisible();
  await expect(page.getByTestId("showcase-disclosure")).toContainText("not specific listings currently available");
  const cards = section.getByTestId("showcase-card");
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  await expect(section.locator("[data-testid=illustrative-label], [data-testid=record-label]")).toHaveCount(n);
  await expect(section).not.toContainText(/₹|lakh|crore|sq\.? ?ft|possession|RERA|available now/i);
  // never under a "Featured" heading
  await expect(page.locator("section[aria-labelledby=featured-title] [data-testid=showcase-card]")).toHaveCount(0);
  // no property structured data for showcase titles
  const titles = await section.locator("h3").allTextContents();
  const ld = (await page.locator("script[type='application/ld+json']").allTextContents()).join(" ");
  for (const t of titles) expect(ld).not.toContain(t);

  // category chips filter the cards
  if (!isMobile()) {
    const chip = section.getByRole("button", { name: "Villas & houses" });
    if (await chip.count()) {
      await chip.click();
      await expect(chip).toHaveAttribute("aria-pressed", "true");
      for (const c of await section.getByTestId("showcase-card").all()) await expect(c).toHaveAttribute("data-category", "villa");
    }
  }

  // real property search never contains showcase items
  await page.goto("/en/properties");
  const listing = await page.locator("main").textContent();
  for (const t of titles) expect(listing).not.toContain(t);
  await expect(page.getByTestId("showcase-card")).toHaveCount(0);
});

test("enquiry from a showcase card creates a CRM reference without picking a property", async ({ page }) => {
  test.skip(isMobile(), "runs once (desktop)");
  await page.goto("/en");
  const card = page.getByTestId("showcase-card").filter({ hasText: "Enquire about similar" }).first();
  test.skip((await card.count()) === 0, "no showcase card with an enquiry link");
  const title = await card.locator("h3").textContent();
  await card.getByRole("link", { name: "Enquire about similar" }).click();
  await expect(page).toHaveURL(/\/en\/contact\?showcase=[0-9a-f-]{36}#enquiry/);
  const form = page.locator("#contact-enquiry");
  await expect(form.getByTestId("enquiry-about")).toContainText("illustrative example");
  await expect(form.getByTestId("enquiry-about")).toContainText(title!.trim());
  await expect(form.locator("select[name=propertyId]")).toHaveCount(0);   // never linked to a listing
  await form.getByLabel("Your name").fill("Showcase Spec");
  await form.getByLabel("Mobile number").fill(phone());
  await form.getByLabel("Preferred city or locality (optional)").fill("Lucknow");
  await form.getByLabel(/agree to be contacted/i).check();
  await form.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByRole("status")).toContainText(/LEAD-\d+/);
});

test("contact page ignores an unknown showcase id", async ({ page }) => {
  await page.goto("/en/contact?showcase=00000000-0000-0000-0000-000000000000#enquiry");
  await expect(page.getByTestId("enquiry-about")).toHaveCount(0);
});

test("new launches: real project cards, or the register-interest panel when none is published", async ({ page }) => {
  await page.goto("/en");
  const launches = page.locator("section[aria-labelledby=launch-title]");
  await expect(launches).toBeVisible();
  const discover = launches.getByTestId("launch-discover");
  if (await discover.count()) {
    await expect(discover).toContainText("Discover upcoming opportunities");
    await expect(discover).toContainText("Representative image");
    await expect(discover).not.toContainText(/₹|RERA|possession/i);
    if (!isMobile()) {
      await discover.getByLabel("Your name").fill("Launch Spec");
      await discover.getByLabel("Mobile number").fill(phone());
      await discover.getByLabel(/agree to be contacted/i).check();
      await discover.getByRole("button", { name: "Send enquiry" }).click();
      await expect(discover.getByRole("status")).toContainText(/LEAD-\d+/);
    }
  } else {
    await expect(launches.locator("ul li").first()).toBeVisible();   // approved project cards
  }
});
