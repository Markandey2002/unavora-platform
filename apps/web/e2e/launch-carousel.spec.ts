import { expect, test } from "@playwright/test";

// Homepage first screen + New launches carousel (2026-11-13). Works in every content mode: real projects, illustrative
// project styles, or the Discover panel (no carousel). Arrow tests run only when there is more to scroll.
test("New launches starts within the first screen and the page never scrolls sideways", async ({ page }) => {
  await page.goto("/en");
  const vp = page.viewportSize()!;
  const heading = page.locator("#launch-title");
  await expect(heading).toBeVisible();
  const top = await heading.evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
  expect(top).toBeLessThan(vp.height);                       // the section heading is in the initial viewport
  const hero = await page.locator("section[aria-labelledby=hero-title]").boundingBox();
  if (vp.width >= 1024) expect(hero!.height).toBeLessThanOrEqual(440);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("carousel: arrows, keyboard and snap; no autoplay", async ({ page }) => {
  await page.goto("/en");
  const carousel = page.getByTestId("launch-carousel");
  test.skip((await carousel.count()) === 0, "Discover panel mode (no launches or project styles)");
  const track = carousel.getByTestId("carousel-track");
  await expect(track).toHaveAttribute("aria-label", /.+/);
  const left = () => track.evaluate((e) => e.scrollLeft);
  const start = await left();
  await page.waitForTimeout(1500);
  expect(await left()).toBe(start);                          // nothing moves on its own

  const next = carousel.getByTestId("carousel-next");
  const scrollable = await track.evaluate((e) => e.scrollWidth > e.clientWidth + 2);
  if (!scrollable || !(await next.isVisible())) {
    test.info().annotations.push({ type: "note", description: "all cards fit or phone layout: arrows hidden" });
  } else {
    const prev = carousel.getByTestId("carousel-prev");
    await expect(prev).toBeDisabled();
    await expect(next).toHaveAccessibleName(/Next/);
    await next.focus();
    await page.keyboard.press("Enter");                      // keyboard operates the arrow button
    await expect.poll(left).toBeGreaterThan(start);
    await expect(prev).toBeEnabled();
    await prev.click();
    await expect.poll(left).toBeLessThanOrEqual(start + 2);
  }
  // the track itself is focusable, so arrow keys scroll it natively
  await track.focus();
  await expect(track).toBeFocused();
  // snap points on every card
  expect(await track.evaluate((e) => getComputedStyle(e.firstElementChild!).scrollSnapAlign)).toContain("start");
});
