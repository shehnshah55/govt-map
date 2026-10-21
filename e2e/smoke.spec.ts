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
  ["ask", "#/ask"],
  ["ask: answer in Urdu", "#/ask?q=%D9%BE%D9%86%D8%AC%D8%A7%D8%A8%20%DA%A9%D8%A7%20%D9%88%D8%B2%DB%8C%D8%B1%20%D8%A7%D8%B9%D9%84%DB%8C%D9%B0%20%DA%A9%D9%88%D9%86%20%DB%81%DB%92"],
  ["ask: service", "#/ask?q=passport%20kaise%20banwayen"],
  ["ask: not covered", "#/ask?q=who%20is%20the%20best%20cricketer"],
  ["public services", "#/services"],
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

test("a question typed in the search box opens Ask, with the CNIC removed", async ({ page }) => {
  const problems = watch(page);
  await page.goto("#/");
  await page.locator("#q").fill("my cnic is 35202-1234567-1, kaise renew karun?");
  await expect(page.locator("#suggest a").first()).toContainText("[CNIC removed]");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/ask\?q=/);
  expect(decodeURIComponent(page.url())).not.toMatch(/\d{5}/);
  await expect(page.locator(".answer")).toContainText("National Database and Registration Authority");
  await expect(page.locator(".answer")).toContainText("Removed from your question");
  expect(problems).toEqual([]);
});

test("Ask answers from its own box, and scrubs numbers from a pasted link", async ({ page }) => {
  await page.goto("#/ask?q=passport%20AB1234567%20lost");
  await expect(page.locator(".answer")).toContainText("Passports");
  expect(decodeURIComponent(page.url())).not.toContain("1234567");
  await page.locator("#ask-q").fill("CM Punjab kaun hai?");
  await page.locator("#ask-q").press("Enter");
  await expect(page.locator(".answer .readas")).toContainText("Chief Minister of Punjab");
});

test("search suggests and navigates", async ({ page }) => {
  await page.goto("#/");
  await page.locator("#q").fill("Prime Minister");
  await expect(page.locator("#suggest a").first()).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/(post|org|person)\//);
});
