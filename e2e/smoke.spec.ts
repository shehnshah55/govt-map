import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Every kind of page. */
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
  ["find a service", "#/find?q=How%20do%20I%20renew%20my%20CNIC%3F"],
  ["official websites", "#/sources"],
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

test("published legal cases show the outcome beside the charge, dated and cited; held-back cases do not appear", async ({ page }) => {
  await page.goto("#/person/nawaz-sharif");
  const row = page.locator("table.cases tbody tr", { hasText: "Avenfield reference (London flats)" });
  await expect(row).toBeVisible();
  await expect(row.locator(".case-charge")).toContainText("as alleged by NAB");
  await expect(row.locator(".case-outcome .tag")).toHaveText("Acquitted");
  await expect(row.locator(".case-outcome")).toContainText("as of 2023-11-29");
  await expect(row.locator('.case-outcome a[href="https://www.dawn.com/news/1793562"]')).toBeVisible();
  await expect(row.locator(".case-allegation")).toHaveText("Allegations are not findings of guilt.");
  const events = row.locator("ol.case-timeline li");
  await expect(events).toHaveCount(7);
  await expect(events.first()).toContainText("2017-10-19");
  await expect(events.last()).toContainText("2023-11-29");
  await expect(events.last().locator("a.case-src")).toHaveText("Court record");
  await expect(events.first().locator("a.case-src")).toHaveText("News report");
  await page.goto("#/person/asif-ali-zardari");
  await expect(page.locator("#app h1").first()).toBeVisible();
  await expect(page.getByText("Criminal and accountability cases")).toHaveCount(0);
});

test("old #/ask links open Find a service", async ({ page }) => {
  await page.goto("#/ask?q=passport");
  await expect(page.locator("#app h1").first()).toContainText("passport");
  await expect(page.locator("#app .eyebrow").first()).toHaveText("Find a service");
  expect(new URL(page.url()).hash).toBe("#/find?q=passport");
});

for (const [q, host] of [
  ["passport fee", "dgip.gov.pk"],
  ["domicile", ""],
] as const) {
  test(`find a service searches official pages: ${q}`, async ({ page }) => {
    const problems = watch(page);
    const offsite: string[] = [];
    page.on("request", (r) => new URL(r.url()).host !== "localhost:4173" && offsite.push(r.url()));
    await page.goto(`#/find?q=${encodeURIComponent(q)}`);
    const results = page.locator("#service-results li");
    await expect(results.first()).toBeVisible();
    const first = results.first().locator("a[target=_blank]").first();
    const href = (await first.getAttribute("href"))!;
    expect(href.startsWith("https://")).toBe(true);
    if (host) expect(new URL(href).hostname.replace(/^www\./, "")).toBe(host);
    await expect(results.first()).toContainText("checked");
    const text = (await results.allTextContents()).join(" ").toLowerCase();
    expect(text).toContain(q.split(" ")[0]);
    // the index ships with the site: nothing is fetched from another host
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
    expect(offsite).toEqual([]);
  });
}
