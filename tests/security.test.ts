import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkPage } from "../scripts/check-build.ts";
import { compile } from "../scripts/compile.ts";
import { isSafeUrl, safeHref } from "../src/lib/safe-url.ts";
import { GraphIndex } from "../src/lib/graph-index.ts";
import { HexColor, Organization, SafeUrl, Source } from "../src/schema.ts";
import type { Graph, Sector } from "../src/schema.ts";
import type { Ctx, View } from "../src/views/common.ts";
import { lawView, orgView, personView, placeView, postView } from "../src/views/entities.ts";
import { directoryView, electedView, officialsView } from "../src/views/directory.ts";
import { appointmentsView, mapView, parliamentView, treeView, verificationView } from "../src/views/insight.ts";
import { aboutView, accountabilityView, exploreView, homeView, lawsView, searchView, sectorView, sectorsView } from "../src/views/pages.ts";

const DATA = new URL("../data", import.meta.url).pathname;

const BAD_URLS = [
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  " javascript:alert(1)",
  "java\tscript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "http://example.org/",
  "//example.org/",
  "https://user:pass@example.org/",
  "not a url",
];

describe("URL allowlist", () => {
  it("accepts https URLs", () => {
    expect(isSafeUrl("https://www.ecp.gov.pk/")).toBe(true);
    expect(SafeUrl.safeParse("https://na.gov.pk/en/index.php").success).toBe(true);
  });

  it.each(BAD_URLS)("rejects %j", (url) => {
    expect(isSafeUrl(url)).toBe(false);
    expect(safeHref(url)).toBe("#");
    expect(Source.safeParse({ title: "x", url }).success).toBe(false);
  });

  it("rejects a javascript: website on an organisation", () => {
    const r = Organization.safeParse({ id: "x", name: "X", kind: "ministry", jurisdiction: "pk", website: "javascript:alert(1)" });
    expect(r.success).toBe(false);
  });

  it("allows only #rrggbb colours", () => {
    expect(HexColor.safeParse("#2e7d32").success).toBe(true);
    for (const c of ["red", "#fff", "#2e7d32;background:url(x)", '#000000" onload="x', "var(--x)"]) expect(HexColor.safeParse(c).success).toBe(false);
  });
});

/** Text fields that reach the page. References (ids, kinds, dates) are left alone so the graph still resolves. */
const TEXT_KEYS = new Set([
  "name", "name_ur", "short_name", "title", "head_title", "description", "notes", "summary", "provision", "headquarters", "hq", "capital",
  "claim", "finding", "change", "functions", "charges", "outcome", "sentence", "custody", "basis", "court", "consultation", "removal", "filed_by",
]);
const URL_KEYS = new Set(["url", "website"]);
const PAYLOAD = `"'><img src=x onerror=alert(1)><script>alert(1)</script><svg onload=alert(1)>`;

function poison(v: unknown, key = ""): unknown {
  if (typeof v === "string") {
    if (URL_KEYS.has(key)) return "javascript:alert(document.domain)";
    return TEXT_KEYS.has(key) ? `${v}${PAYLOAD}` : v;
  }
  if (Array.isArray(v)) return v.map((x) => poison(x, key));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, poison(x, k)]));
  return v;
}

/** Every real tag in the markup, with its attributes. Escaped text (&lt;img …) is not a tag and is ignored. */
const TAG = /<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const BANNED_TAGS = new Set(["script", "img", "iframe", "object", "embed", "form", "base", "meta", "link"]);

function unsafeMarkup(markup: string): string[] {
  const out: string[] = [];
  for (const [, tag, attrs] of markup.matchAll(TAG)) {
    if (BANNED_TAGS.has(tag.toLowerCase())) out.push(`<${tag}> tag`);
    for (const [, name, dq, sq, bare] of attrs.matchAll(ATTR)) {
      const n = name.toLowerCase();
      const value = (dq ?? sq ?? bare ?? "").trim().toLowerCase();
      if (n.startsWith("on")) out.push(`${n} attribute on <${tag}>`);
      if (["href", "src", "xlink:href", "action", "formaction"].includes(n) && /^(javascript|data|vbscript):/.test(value)) out.push(`${n}="${value.slice(0, 20)}" on <${tag}>`);
      if (n === "style" && /url\(|expression\(|javascript:/.test(value)) out.push(`style with ${value.slice(0, 30)} on <${tag}>`);
    }
  }
  return out;
}

describe("escaping", () => {
  it("the markup check catches what it should", () => {
    expect(unsafeMarkup('<p title="&lt;img src=x onerror=alert(1)&gt;">x</p>')).toEqual([]);
    expect(unsafeMarkup('<a href="javascript:alert(1)">x</a>')).toHaveLength(1);
    expect(unsafeMarkup('<p title=""><img src=x onerror=alert(1)>')).toHaveLength(2);
    expect(unsafeMarkup("<i style=\"background:url(x)\"></i>")).toHaveLength(1);
  });

  const { graph } = compile(DATA);
  const hostile = poison(graph) as Graph;
  const ix = new GraphIndex(hostile);
  const ctx: Ctx = { ix, repo: "https://github.com/shehnshah55/govt-map", go: () => {} };

  const views: [string, () => View | undefined][] = [
    ["home", () => homeView(ctx)],
    ["about", () => aboutView(ctx, true)],
    ["laws", () => lawsView(ctx)],
    ["explore", () => exploreView(ctx, new URLSearchParams())],
    ["sectors", () => sectorsView(ctx)],
    ["elected", () => electedView(ctx)],
    ["parliament", () => parliamentView(ctx)],
    ["appointments", () => appointmentsView(ctx)],
    ["tree", () => treeView(ctx)],
    ["map", () => mapView(ctx)],
    ["verification", () => verificationView(ctx)],
    ["accountability", () => accountabilityView(ctx)],
    ["search", () => searchView(ctx, `minister${PAYLOAD}`)],
    ["directory", () => directoryView(ctx, undefined)],
    ["officials", () => officialsView(ctx, undefined)],
    ...[...new Set(hostile.organizations.flatMap((o) => o.sectors ?? []))].map((s) => [`sector ${s}`, () => sectorView(ctx, s as Sector)] as [string, () => View | undefined]),
    ...hostile.organizations.map((o) => [`org ${o.id}`, () => orgView(ctx, o.id)] as [string, () => View | undefined]),
    ...hostile.people.map((p) => [`person ${p.id}`, () => personView(ctx, p.id)] as [string, () => View | undefined]),
    ...hostile.laws.map((l) => [`law ${l.id}`, () => lawView(ctx, l.id)] as [string, () => View | undefined]),
    ...hostile.jurisdictions.filter((j) => j.kind !== "district" || j.id.endsWith("lahore")).map((j) => [`place ${j.id}`, () => placeView(ctx, j.id)] as [string, () => View | undefined]),
    ...hostile.positions.filter((p) => !p.id.startsWith("seat-")).map((p) => [`post ${p.id}`, () => postView(ctx, p.id)] as [string, () => View | undefined]),
  ];

  it("renders hostile text and URLs inertly on every page type", () => {
    const failures: string[] = [];
    let rendered = 0;
    for (const [name, fn] of views) {
      const view = fn();
      if (!view) continue;
      rendered++;
      for (const problem of unsafeMarkup(view.body.html)) failures.push(`${name}: ${problem}`);
    }
    expect(failures).toEqual([]);
    expect(rendered).toBeGreaterThan(1000);
  });
});

describe("build check", () => {
  const policy = (script: string) => `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src ${script}; object-src 'none'; base-uri 'self'" />`;
  const body = "console.log(1)";
  const hash = `'sha256-${createHash("sha256").update(body).digest("base64")}'`;

  it("passes a hashed inline script and a same-origin script", () => {
    expect(checkPage(`${policy(hash)}<script type="module">${body}</script>`)).toEqual([]);
    expect(checkPage(`${policy("'self'")}<script type="module" crossorigin src="./assets/index.js"></script>`)).toEqual([]);
  });

  it("fails a missing policy, an unhashed or edited inline script, 'unsafe-inline' and third-party loads", () => {
    expect(checkPage("<p>no policy</p>")).toEqual(["no Content-Security-Policy meta tag"]);
    expect(checkPage(`${policy(hash)}<script>${body};alert(1)</script>`)).toHaveLength(1);
    expect(checkPage(`${policy("'self' 'unsafe-inline'")}`)).toContain("script-src allows 'unsafe-inline'");
    expect(checkPage(`${policy("'self'")}<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X" />`)).toHaveLength(1);
  });
});
