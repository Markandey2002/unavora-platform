import { expect, test } from "@playwright/test";

// Public website redesign (2026-11-08). Runs on mobile and desktop projects against the local stack.
const isMobile = () => test.info().project.name === "mobile";

test("home: official logo, hero, live figures, categories, featured listings, enquiry form", async ({ page }) => {
  await page.goto("/en");
  await expect(page).toHaveTitle(/UNAVORA ANANT INFRA/);
  await expect(page.locator("header img[alt*='UNAVORA ANANT INFRA']").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Building Better Spaces. Creating Better Futures.");
  await expect(page.locator("h1")).toHaveCount(1);
  if (isMobile()) await expect(page.getByRole("button", { name: "Open property finder" })).toBeVisible();
  else await expect(page.getByRole("search", { name: "Find a property" })).toBeVisible();
  await expect(page.getByText("Representative image").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Browse by category" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Residential", exact: true }).last()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Featured properties" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Send us an enquiry" })).toBeVisible();
  // nothing invented: no ratings, reviews or award claims on the page
  await expect(page.locator("body")).not.toContainText(/rated|★|award|guarantee/i);
  // canonical + hreflang alternates
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute("href", /\/en$/);
  await expect(page.locator("link[rel=alternate][hreflang=hi]")).toHaveAttribute("href", /\/hi$/);
});

test("hero search sends supported filters to the listing", async ({ page }) => {
  await page.goto("/en");
  if (isMobile()) await page.getByRole("button", { name: "Open property finder" }).click();
  const search = page.getByRole("search", { name: "Find a property" }).filter({ visible: true });
  await search.getByLabel("City").selectOption("Lucknow");
  await search.getByLabel("Category").selectOption("residential");
  await search.getByRole("button", { name: isMobile() ? "Show results" : "Search" }).click();
  await expect(page).toHaveURL(/\/en\/properties\?.*city=Lucknow.*category=residential/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Properties");
  await expect(page.getByRole("link", { name: "Remove filter: Lucknow" })).toBeVisible();
  const cards = page.locator("main ul li h3");
  await expect(cards.first()).toBeVisible();
  for (const text of await cards.allTextContents()) expect(text).not.toMatch(/plot|Office/i);
});

test("category pages list only that category; empty filters show a helpful state", async ({ page }) => {
  await page.goto("/en/plots");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plots and land");
  await expect(page.locator("main li h3").first()).toContainText(/plot/i);
  await page.goto("/en/properties?city=Noida&maxPrice=2000000");
  await expect(page.getByText("No properties match these filters")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ask our team" })).toBeVisible();
});

test("navigation: dropdowns on desktop, drawer on mobile; language switch keeps the page", async ({ page }) => {
  await page.goto("/en/properties?city=Noida");
  if (isMobile()) {
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Main navigation" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Channel partner" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await page.getByRole("button", { name: "Open menu" }).click();
    await drawer.getByRole("link", { name: "हिन्दी" }).click();
  } else {
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Properties" }).hover();
    await expect(page.getByRole("link", { name: "Plots & land" }).first()).toBeVisible();
    await page.getByRole("group", { name: "Language" }).getByRole("link", { name: "हिन्दी" }).click();
  }
  await expect(page).toHaveURL(/\/hi\/properties\?city=Noida/);
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("संपत्तियाँ");
});

test("contact page enquiry with a type creates a CRM reference", async ({ page }) => {
  await page.goto("/en/contact");
  const form = page.locator("#contact-enquiry");
  await form.getByLabel("Your name").fill("Site Spec Buyer");
  await form.getByLabel("Mobile number").fill(`98${String(Date.now()).slice(-8)}`);
  await form.getByLabel("I am interested in").selectOption("site_visit");
  await form.getByLabel(/agree to be contacted/).check();
  await form.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByRole("status")).toContainText("LEAD-");
});

test("channel partner application creates a CRM reference", async ({ page }) => {
  await page.goto("/en/channel-partner");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Grow with UNAVORA");
  await page.getByLabel("Your name").fill("Partner Spec");
  await page.getByLabel("Mobile number").fill(`97${String(Date.now()).slice(-8)}`);
  await page.getByLabel("City").fill("Lucknow");
  await page.getByLabel(/RERA/).fill("UPRERAAGT-SPEC");
  await page.getByLabel(/agree to be contacted about this application/).check();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("status")).toContainText("LEAD-");
});

test("projects, legal pages, 404 and SEO files", async ({ page, request }) => {
  await page.goto("/en/projects");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New launches");
  await expect(page.getByText(/No new launches are published yet|Starting from/).first()).toBeVisible();
  await page.goto("/en/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy policy");
  const missing = await page.goto("/en/properties/does-not-exist");
  expect(missing?.status()).toBe(404);
  await expect(page.getByText("We could not find that page")).toBeVisible();
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  expect(await sitemap.text()).toContain("/en/properties/");
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBeTruthy();
});

test("property detail: facts, illustration notice, enquiry panel and related listings", async ({ page }) => {
  await page.goto("/en/properties/sample-3bhk-apartment-sector-37-noida");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("3 BHK apartment");
  await expect(page.getByText("Key details")).toBeVisible();
  // no approved photographs yet: an honest placeholder, never a stock or shared image
  await expect(page.getByRole("img", { name: "Photographs awaiting approval" }).first()).toBeVisible();
  await expect(page.locator("script[type='application/ld+json']")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Similar properties" })).toBeVisible();
  if (isMobile()) await expect(page.getByRole("link", { name: "Enquire now" }).last()).toBeVisible();
});
