import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// axe as the site is checked: its defaults, plus label-in-name (WCAG 2.5.3), which axe 4.13 still
// marks experimental and leaves off, so the suite does not wait for an axe upgrade to catch it
const axeFor = (page: Page) => new AxeBuilder({ page }).options({ rules: { "label-content-name-mismatch": { enabled: true } } });

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
  ["sectors", "#/sectors"],
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
    // settled when loaded and its fonts are in; "networkidle" waits on every open request, so one
    // request the preview server is slow to answer times the test out though the page is fine
    await page.waitForLoadState("load");
    await page.evaluate(() => document.fonts.ready.then(() => undefined));

    // no sideways scrolling at either width
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);

    // no serious or critical accessibility violations
    const axe = await axeFor(page).analyze();
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

test("keyboard: the skip link reaches the content, and a new page's heading takes focus", async ({ page }) => {
  await page.goto("#/");
  await expect(page.locator("#app h1")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#app h1")).toBeFocused();
  await expect(page).toHaveURL(/#\/$/);
  await page.locator(".btnrow a[href='#/org/fed-pm-office']").first().click();
  await expect(page.locator("#app h1")).toHaveText(/Prime Minister/);
  await expect(page.locator("#app h1")).toBeFocused();
});

test("the search box is a combobox that tracks the highlighted option", async ({ page }) => {
  await page.goto("#/");
  const q = page.locator("#q");
  await q.fill("prime");
  await expect(q).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown");
  await expect(q).toHaveAttribute("aria-activedescendant", "suggest-0");
  await expect(page.locator("#suggest-0")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(q).toHaveAttribute("aria-expanded", "false");
});

test("the home page's figure tiles open the chart they name", async ({ page }) => {
  await page.goto("#/");
  for (const fig of ["posts-by-selection", "bodies-by-government"]) {
    await page.goto("#/");
    await page.locator(`a.kpi[href='#/figures/${fig}']`).click();
    await expect(page.locator(`#fig-${fig}`)).toBeFocused();
  }
});

test("a filter that redraws its own page keeps keyboard focus", async ({ page }) => {
  await page.goto("#/explore");
  await page.locator("#tier-select").focus();
  await page.locator("#tier-select").selectOption("pk-sd");
  await expect(page).toHaveURL(/tier=pk-sd/);
  await expect(page.locator("#tier-select")).toBeFocused();
});

test("after Escape, Enter searches for what was typed, not the hidden suggestion", async ({ page }) => {
  await page.goto("#/");
  await page.locator("#q").fill("prime");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/search\?q=prime/);
});

test("a graph whose code fails to load says so instead of loading forever", async ({ page }) => {
  await page.route(/graph-canvas-.*\.js$/, (r) => r.abort());
  await page.goto("#/org/fed-min-nhsrc");
  const canvas = page.locator(".graphpanel .canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toHaveAttribute("data-failed", "");
  await expect(canvas).not.toHaveAttribute("data-loading", "");
});

test("odd addresses: a malformed link shows Not found, and a skip link opened on its own shows home", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("#/org/%E0");
  await expect(page.locator("#app h1")).toHaveText("Not found");
  await page.goto("about:blank");
  await page.goto("#app");
  await expect(page.locator("#app h1")).not.toHaveText("Not found");
  await expect(page).toHaveURL(/#\/$/);
  expect(errors).toEqual([]);
});

test("a figure tile opens its chart clear of the sticky header", async ({ page }) => {
  await page.goto("#/");
  await page.locator("a.kpi[href='#/figures/bodies-by-government']").click();
  const fig = page.locator("#fig-bodies-by-government");
  await expect(fig).toBeFocused();
  const [figTop, headerBottom] = await page.evaluate(() => [document.querySelector("#fig-bodies-by-government")!.getBoundingClientRect().top, document.querySelector(".topbar")!.getBoundingClientRect().bottom]);
  expect(figTop).toBeGreaterThanOrEqual(headerBottom);
});

test("pages with classification labels explain them", async ({ page }) => {
  for (const route of ["#/law/constitution-1973", "#/tree", "#/post/fed-chief-justice"]) {
    await page.goto(route);
    await expect(page.locator(".labelkey summary"), route).toBeVisible();
  }
});

test("graphs load only when they come into view", async ({ page }) => {
  await page.goto("#/org/fed-min-nhsrc");
  await expect(page.locator("#app h1")).toBeVisible();
  const canvas = page.locator(".graphpanel .canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas.locator("canvas").first()).toBeAttached();
  await expect(canvas).not.toHaveAttribute("data-loading", "");
});

test.describe("dark mode and the narrowest phones", () => {
  test.use({ colorScheme: "dark" });
  for (const route of ["#/", "#/sectors", "#/org/fed-min-nhsrc", "#/person/shehbaz-sharif", "#/officials", "#/parliament"]) {
    test(`${route} passes axe in dark mode and fits 320px`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("#app h1").first()).toBeVisible();
      const axe = await axeFor(page).analyze();
      expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
      await page.setViewportSize({ width: 320, height: 800 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "horizontal overflow at 320px").toBeLessThanOrEqual(0);
    });
  }
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

test("Find a service strips a CNIC and a phone number from the address bar and the title", async ({ page }) => {
  await page.goto(`#/find?q=${encodeURIComponent("renew CNIC 35202-1234567-1 call 0300-1234567")}`);
  await expect(page.locator("#app h1").first()).toContainText("[CNIC removed]");
  const url = decodeURIComponent(page.url());
  expect(url).not.toContain("1234567");
  expect(url).toContain("[CNIC removed]");
  expect(await page.title()).not.toContain("1234567");
  // typed into the box: removed before it reaches the history
  await page.locator("#find-q").fill("passport AB1234567 lost");
  await page.locator("#find-go").click();
  await expect(page.locator("#app h1").first()).toContainText("[passport number removed]");
  expect(decodeURIComponent(page.url())).not.toContain("AB1234567");
});

test("Find a service answers who appoints a post from the recorded relationships", async ({ page }) => {
  const problems = watch(page);
  await page.goto(`#/find?q=${encodeURIComponent("Who appoints the Chief Justice of Pakistan?")}`);
  const answer = page.locator("section.recorded");
  await expect(answer.locator("h2")).toHaveText("Who appoints");
  await expect(answer).toContainText("President");
  await page.goto(`#/find?q=${encodeURIComponent("Whom does the Federal Cabinet answer to?")}`);
  await expect(page.locator("section.recorded")).toContainText("National Assembly");
  expect(problems).toEqual([]);
});
