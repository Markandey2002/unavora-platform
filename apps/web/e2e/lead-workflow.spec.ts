import { expect, test, type Page } from "@playwright/test";
import { istInput, newLead, signIn, signOut } from "./staff-helpers";

// Slice 4 in a real browser against the local stack (API, web, Keycloak). Each project (mobile/desktop) gets its own lead.
test.describe.configure({ mode: "serial" });

let reference = "";
let leadUrl = "";

async function openLead(page: Page) {
  await page.goto(leadUrl);
  await expect(page.getByTestId("lead-reference")).toHaveText(reference);
}

async function moveStage(page: Page, label: string) {
  const form = page.getByTestId("stage-form");
  await form.getByLabel("Move to").selectOption({ label });
  await form.getByRole("button", { name: "Change stage" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expect(page.getByTestId("lead-stage")).toHaveText(label);
}

test("employee works a lead: stages, reasons, visit, completion, follow-up, dashboard", async ({ page, request }) => {
  test.setTimeout(90_000);
  reference = await newLead(request);
  await signIn(page, "employee1");
  await page.getByTestId("lead-list").getByText(reference).click();
  await expect(page.getByTestId("lead-reference")).toHaveText(reference);
  leadUrl = page.url().split("?")[0];
  await expect(page.getByTestId("lead-stage")).toHaveText("Assigned");

  await moveStage(page, "Contacted");
  await moveStage(page, "Qualified");
  // Lost without a reason is refused by the API and the stage is unchanged
  await page.getByTestId("stage-form").getByLabel("Move to").selectOption({ label: "Lost" });
  await page.getByTestId("stage-form").getByRole("button", { name: "Change stage" }).click();
  await expect(page.getByTestId("form-error")).toContainText("Choose why the lead was lost");
  await expect(page.getByTestId("lead-stage")).toHaveText("Qualified");
  // "Won" is never offered (deal workflow not enabled)
  await expect(page.getByTestId("stage-form").getByLabel("Move to").locator("option", { hasText: "Won" })).toHaveCount(0);

  // schedule a visit that started 30 minutes ago (a same-day visit being recorded) -> lead moves automatically
  const schedule = page.getByTestId("schedule-form");
  await schedule.getByLabel("Date and time (India time)").fill(istInput(-30 * 60_000));
  await schedule.getByLabel("Meeting point (optional)").fill("Site office, gate 2");
  await schedule.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expect(page.getByTestId("lead-stage")).toHaveText("Site Visit Scheduled");
  await page.getByTestId("lead-visits").getByRole("link", { name: /^VIS-/ }).first().click();
  await expect(page.getByTestId("visit-status")).toHaveText("Scheduled");

  // complete it with feedback and internal notes -> lead moves to Site Visit Completed
  const complete = page.getByTestId("complete-form");
  await complete.getByLabel("Customer feedback").fill("Liked the layout, wants east-facing");
  await complete.getByLabel("Interest after visit").selectOption("high");
  await complete.getByLabel("Internal notes (staff only)").fill("Check loan eligibility");
  await complete.getByRole("button", { name: "Mark completed" }).click();
  await expect(page.getByTestId("visit-status")).toHaveText("Completed");
  await expect(page.getByTestId("visit-history")).toContainText("Completed");

  // follow-up against the visit, high priority. The due time is fixed once: the form's default is "now + 24 h" at
  // render time, so re-reading it after the redirect could fall in a different minute (CI run on a31a742).
  const fu = page.getByTestId("follow-up-form");
  const due = istInput(2 * 24 * 3600_000);
  await fu.getByLabel("Title").fill(`Send cost sheet ${reference}`);
  await fu.getByLabel("Due").fill(due);
  await fu.getByLabel("Priority").selectOption("high");
  await fu.getByRole("button", { name: "Add follow-up" }).click();
  // wait for this submission's own redirect: the page already shows "Saved." from completing the visit (?saved=complete),
  // so checking the banner alone let the next fill race the navigation (CI run on c744cdf)
  await expect(page).toHaveURL(/[?&]saved=followup/);
  await expect(page.getByRole("status")).toHaveText("Saved.");
  // the identical follow-up (same title, visit, due time, assignee) again is refused as a duplicate
  await fu.getByLabel("Title").fill(`Send cost sheet ${reference}`);
  await fu.getByLabel("Due").fill(due);
  await fu.getByLabel("Priority").selectOption("high");
  await fu.getByRole("button", { name: "Add follow-up" }).click();
  await expect(page).toHaveURL(/[?&]error=duplicate_follow_up/);
  await expect(page.getByTestId("form-error")).toContainText("already exists");

  await openLead(page);
  await expect(page.getByTestId("lead-stage")).toHaveText("Site Visit Completed");
  await expect(page.getByTestId("stage-history")).toContainText("Site Visit Scheduled → Site Visit Completed");

  await page.getByRole("link", { name: "My follow-ups" }).click();
  const item = page.getByRole("listitem").filter({ hasText: `Send cost sheet ${reference}` });
  await expect(item).toContainText("High");
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByTestId("dash-recent")).toContainText(reference);
  await expect(page.getByTestId("dash-pipeline")).toBeVisible();
  await signOut(page);
});

test("another employee cannot open or change this lead", async ({ page }) => {
  await signIn(page, "employee2");
  await expect(page.getByTestId("lead-list")).not.toContainText(reference);
  await page.goto(leadUrl);
  await expect(page.getByTestId("not-found")).toBeVisible();
  await signOut(page);
});

test("director (TOTP) reassigns with a reason; history is kept; dashboards update", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, "director");
  await openLead(page);
  await expect(page.getByTestId("lead-assignee")).toContainText("Employee One");
  const form = page.getByTestId("assign-form");
  await form.getByLabel("Assign to").selectOption({ label: "Local Employee Two (synthetic)" });
  await form.getByLabel("Reason").fill("Employee one on leave this week");
  await form.getByRole("button", { name: "Assign / reassign" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expect(page.getByTestId("lead-assignee")).toContainText("Employee Two");
  await expect(page.getByTestId("assignment-history")).toContainText("Local Employee One (synthetic) → Local Employee Two (synthetic)");
  await expect(page.getByTestId("assignment-history")).toContainText("Employee one on leave this week");
  await expect(page.getByTestId("stage-history")).toContainText("Site Visit Scheduled → Site Visit Completed");   // preserved

  await page.getByRole("link", { name: "Director overview" }).click();
  await expect(page.getByTestId("workload")).toContainText("Local Employee Two (synthetic)");
  await expect(page.getByTestId("conversion")).toBeVisible();
  await expect(page.getByTestId("visit-stats")).toBeVisible();
  await expect(page.getByTestId("pipeline-by-employee")).toContainText("Local Employee Two (synthetic)");
  await signOut(page);
});

test("after reassignment the new employee has the lead and its follow-up; the previous one does not", async ({ page }) => {
  await signIn(page, "employee2");
  await expect(page.getByTestId("lead-list")).toContainText(reference);
  await page.getByRole("link", { name: "My follow-ups" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: `Send cost sheet ${reference}` })).toBeVisible();
  await signOut(page);
  await signIn(page, "employee1");
  await expect(page.getByTestId("lead-list")).not.toContainText(reference);
  await page.goto(leadUrl);
  await expect(page.getByTestId("not-found")).toBeVisible();
});
