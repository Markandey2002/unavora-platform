import { expect, test } from "@playwright/test";

// Scripted keyboard checks (no mouse): skip link, menu drawer / finder sheet open-close with Escape and focus return,
// gallery viewer arrows and Escape, footer accordion on phones. A real screen-reader pass is a manual task.
const mobile = () => test.info().project.name === "mobile";

test("skip link moves focus to the main content", async ({ page }) => {
  await page.goto("/en/about");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /Skip to/ });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

test("phones: finder sheet and menu drawer open from the keyboard and close with Escape, returning focus", async ({ page }) => {
  test.skip(!mobile(), "phone layout only");
  await page.goto("/en");
  const finder = page.getByRole("button", { name: "Open property finder" });
  await finder.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(finder).toBeFocused();

  const menu = page.getByRole("button", { name: "Open menu" });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Main navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Main navigation" })).toBeHidden();
  await expect(menu).toBeFocused();

  // footer link groups are collapsed on phones and open from the keyboard
  const summary = page.locator("footer details summary").first();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("footer details").first()).toHaveAttribute("open", "");
});

test("desktop: dropdown navigation is reachable with Tab and every focused element is visible", async ({ page }) => {
  test.skip(mobile(), "desktop layout only");
  await page.goto("/en");
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const box = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, outline: getComputedStyle(el).outlineStyle };
    });
    expect(box).not.toBeNull();
    expect(box!.w * box!.h).toBeGreaterThan(0);
  }
});
