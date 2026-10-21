import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile } from "../scripts/compile.ts";
import { citedUrls, parseLychee, report, STALE_DAYS } from "../scripts/staleness.ts";
import { publicGraph } from "../src/lib/policy.ts";

const { graph } = compile(new URL("../data", import.meta.url).pathname);
const TODAY = "2026-10-02";

describe("freshness report", () => {
  it(`lists officeholders whose record is older than ${STALE_DAYS} days, oldest first, and no one else`, () => {
    const { markdown, counts } = report(graph, TODAY);
    const stale = graph.people.filter((p) => p.roles.some((r) => !r.until) && Date.parse(p.as_of.length === 7 ? `${p.as_of}-01` : p.as_of) < Date.parse(TODAY) - STALE_DAYS * 864e5);
    expect(counts.stalePeople).toBe(stale.length);
    for (const p of stale) expect(markdown).toContain(`\`${p.id}\``);
    const fresh = graph.people.find((p) => !stale.includes(p) && p.roles.some((r) => !r.until))!;
    expect(markdown).not.toContain(`(\`${fresh.id}\`)`);
  });

  it("lists published legal cases only, never held-back ones, and link-checks their sources", () => {
    const { markdown } = report(graph, TODAY);
    const held = graph.people.flatMap((p) => p.legal_cases ?? []).filter((c) => c.publish !== true);
    const shown = publicGraph(graph).people.flatMap((p) => p.legal_cases ?? []);
    expect(held.length).toBeGreaterThan(0);
    expect(shown.length).toBeGreaterThan(0);
    const heldOnly = held.filter((h) => !shown.some((c) => c.title === h.title));
    for (const c of heldOnly) expect(markdown).not.toContain(c.title);
    const urls = [...citedUrls(publicGraph(graph)).keys()];
    for (const c of shown) {
      for (const s of c.sources) expect(urls).toContain(s.url);
      expect(urls).toContain(c.status_source!.url);
      for (const e of c.timeline ?? []) expect(urls).toContain(e.source_url);
    }
  });

  it("reads lychee 0.24's JSON and names the records citing each broken link", () => {
    const links = parseLychee(JSON.parse(readFileSync(new URL("fixtures/lychee-0.24.2.json", import.meta.url), "utf8")));
    expect(links.total).toBe(10);
    expect(links.broken).toHaveLength(2);
    const { markdown, counts } = report(graph, TODAY, links);
    expect(counts.broken).toBe(2);
    // every row names who cites it, including where lychee added a trailing slash to a bare domain
    for (const b of links.broken) {
      const row = markdown.split("\n").find((l) => l.startsWith(`| ${b.url} `))!;
      expect(row.split("|").at(-2)!.trim(), b.url).toMatch(/^`.+`/);
    }
    expect(links.broken.some((b) => b.url.endsWith(".gov.pk/") && !citedUrls(graph).has(b.url))).toBe(true);
  });

  it("reads the older fail_map shape too", () => {
    expect(parseLychee({ total: 1, fail_map: { "x.md": [{ url: "https://a.example/", status: { code: 404, text: "Not Found" } }] } }).broken).toEqual([{ url: "https://a.example/", status: "404 Not Found" }]);
  });

  it("treats a run where most links fail as a network problem, not a list of broken links", () => {
    const broken = Array.from({ length: 9 }, (_, i) => ({ url: `https://x${i}.example/`, status: "Network error" }));
    const { markdown, counts } = report(graph, TODAY, { broken, total: 10 });
    expect(counts.broken).toBe(-1);
    expect(markdown).toContain("network problem on the runner");
    expect(markdown).not.toContain("https://x0.example/");
  });

  it("keeps table cells intact when a status contains a pipe", () => {
    const { markdown } = report(graph, TODAY, { broken: [{ url: "https://a.example/", status: "500 a|b" }], total: 100 });
    expect(markdown).toContain("500 a\\|b");
  });
});
