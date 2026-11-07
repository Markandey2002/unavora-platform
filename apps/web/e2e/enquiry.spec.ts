import { expect, test } from "@playwright/test";

// Requires the full local stack: `docker compose --profile apps up` (or API + web running locally).
test("customer finds a property and sends an enquiry", async ({ page }) => {
  await page.goto("/en/properties");
  await page.getByRole("link", { name: /3 BHK apartment/ }).click();
  await page.getByLabel("Your name").fill("E2E Buyer");
  await page.getByLabel("Mobile number").fill("9876543299");
  await page.getByLabel(/agree to be contacted/).check();
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByRole("status")).toContainText("LEAD-");
});

test("Hindi site is served", async ({ page }) => {
  await page.goto("/hi/properties");
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
});
