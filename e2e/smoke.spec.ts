import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Every kind of page (docs/LAUNCH_PLAN.md §9.3). */
const ROUTES: [string, string][] = [
  ["home", "#/"],
  ["org: Ministry of Health", "#/org/fed-min-nhsrc"],
  ["person", "#/person/shehbaz-sharif"],
  ["place", "#/place/pk-pb"],
  ["law", "#/law/constitution-1973"],
  ["directory", "#/directory"],
  ["officials", "#/officials"],
  ["parliament", "#/parliament"],
  ["appointments", "#/appointments"],
  ["tree", "#/tree"],
  ["map", "#/map"],
  ["verification", "#/verification"],
  ["accountability", "#/accountability"],
  ["search", "#/search?q=minister"],
  ["facts and figures", "#/figures"],
  ["evidence list", "#/figures/posts-by-selection/elected"],
  ["political families", "#/families"],
  ["about", "#/about"],
];

/** Collects console errors and failed requests for the whole test. */
function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
  page.on("response", (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url()}`));
  return problems;
}

for (const [name, route] of ROUTES) {
  test(`${name} renders cleanly and passes axe`, async ({ page }, info) => {
    const problems = watch(page);
    await page.goto(route);
    await expect(page.locator("#app h1").first()).toBeVisible();
    await page.waitForLoadState("networkidle");

    // no sideways scrolling at either width
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);

    // no serious or critical accessibility violations
    const axe = await new AxeBuilder({ page }).analyze();
    const bad = axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}× e.g. ${v.nodes[0]?.target.join(" ")})`);
    expect(bad, "axe serious/critical violations").toEqual([]);

    expect(problems).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${name.replace(/\W+/g, "-")}.png`), fullPage: false });
  });
}

test("the starter map selects a unit by mouse and keyboard", async ({ page }) => {
  await page.goto("#/");
  await page.locator('.chip-btn[data-unit="pk-sd"]').click();
  await expect(page.locator('[data-panel="pk-sd"]')).toBeVisible();
  await page.locator('path.unit[data-unit="pk-pb"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-panel="pk-pb"]')).toBeVisible();
});

test("search suggests and navigates", async ({ page }) => {
  await page.goto("#/");
  await page.locator("#q").fill("Prime Minister");
  await expect(page.locator("#suggest a").first()).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/(post|org|person)\//);
});
