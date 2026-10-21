import { describe, expect, it } from "vitest";
import { compile } from "../scripts/compile.ts";
import { audit } from "../scripts/audit-coverage.ts";
import { GraphIndex } from "../src/lib/graph-index.ts";
import type { Graph } from "../src/schema.ts";
import { ASSET_THRESHOLD, barFigure, careerSummary, ecpStatements, evidence, FIGURE_IDS, headlineTiles, houses, pmTimeline, readiness } from "../src/lib/analytics.ts";
import { TIERS } from "../src/views/tiers.ts";

const DATA = new URL("../data", import.meta.url).pathname;
const { graph } = compile(DATA);
const ix = new GraphIndex(graph);

describe("figures", () => {
  it("every bar's value equals the number of records behind it", () => {
    for (const id of FIGURE_IDS)
      for (const gov of ["all", ...TIERS]) {
        const f = barFigure(ix, id, gov)!;
        for (const b of f.bars) expect(evidence(ix, id, b.key, gov)?.ids.length, `${id} ${gov} ${b.key}`).toBe(b.value);
      }
  });

  it("government filters partition the whole for every filterable figure", () => {
    for (const id of FIGURE_IDS) {
      const all = barFigure(ix, id, "all")!;
      if (!all.filterable) continue;
      // the distinct records behind each government's bars add up to those behind "all"
      const records = (gov: string) => new Set(barFigure(ix, id, gov)!.bars.flatMap((b) => evidence(ix, id, b.key, gov)!.ids)).size;
      expect(TIERS.reduce((n, t) => n + records(t), 0), id).toBe(records("all"));
    }
  });

  it("folds long tails into one 'All others' bar instead of more bars", () => {
    const f = barFigure(ix, "appointers")!;
    expect(f.bars.length).toBeLessThanOrEqual(11);
    expect(f.bars.at(-1)!.key).toBe("_others");
  });

  it("states what each figure covers", () => {
    for (const id of FIGURE_IDS) expect(barFigure(ix, id)!.basis.length).toBeGreaterThan(40);
  });
});

describe("headline tiles", () => {
  it("use the same post and seat counts as docs/COVERAGE.md", () => {
    const { md } = audit(DATA);
    const tiles = Object.fromEntries(headlineTiles(ix).map((t) => [t.label, t]));
    const [, held, of] = tiles.Posts.detail.match(/^([\d,]+) of ([\d,]+)/)!;
    expect(md).toContain(`${held} / ${of}`);
    expect(md).toContain(`${tiles.Posts.value.toLocaleString("en-US")} in total`);
  });
});

describe("Prime Ministers timeline", () => {
  it("is in date order and lists the periods the data doesn't cover", () => {
    const t = pmTimeline(ix);
    const starts = t.terms.map((x) => x.since);
    expect(starts).toEqual([...starts].sort());
    for (const g of t.gaps) expect(g.to > g.from).toBe(true);
  });
});

describe("figures that wait for data", () => {
  it("does not rank assets from press reports or nomination papers", () => {
    expect(ecpStatements(ix).every((s) => new URL(s.source.url!).hostname.endsWith("ecp.gov.pk"))).toBe(true);
    expect(readiness(ix).find((r) => r.id === "assets")!.ready).toBe(false);
  });

  it("becomes ready only when a house has same-year ECP statements for the threshold share of its seats", () => {
    // the smallest house; reserved seats are grouped posts, so members are spread across all its seat posts
    const house = houses(ix).filter((h) => h.seats > 1).sort((x, y) => x.seats - y.seats)[0];
    const slots = graph.positions.filter((p) => p.org === house.org && p.id.startsWith("seat-")).flatMap((p) => Array<string>(p.seats ?? 1).fill(p.id));
    expect(slots.length).toBe(house.seats);
    const need = Math.ceil(ASSET_THRESHOLD * house.seats);
    const withStatements = (n: number, year = (_i: number) => "2024-25") => {
      const g = structuredClone(graph) as Graph;
      slots.slice(0, n).forEach((post, i) =>
        g.people.push({
          id: `test-${i}`,
          name: `Test ${i}`,
          roles: [{ position: post, since: "2024-02-29", status: "confirmed" }],
          declared_assets: [{ amount_pkr: 1e6, as_of: year(i), basis: "Annual statement (s. 137)", source: { title: "ECP", url: "https://www.ecp.gov.pk/x.pdf" } }],
          as_of: "2026-09",
          confidence: "high",
          _file: "test",
        } as unknown as Graph["people"][number]),
      );
      return readiness(new GraphIndex(g)).find((r) => r.id === "assets")!;
    };
    expect(withStatements(need - 1).ready).toBe(false);
    expect(withStatements(need).ready).toBe(true);
    // statements from different fiscal years are never pooled
    expect(withStatements(need, (i) => (i % 2 ? "2024-25" : "2023-24")).ready).toBe(false);
  });
});

describe("career summary", () => {
  it("counts overlapping elected offices once", () => {
    const p = ix.person.get("shehbaz-sharif")!;
    const c = careerSummary(ix, p);
    const naive = p.roles
      .filter((r) => r.since && ix.post.get(r.position)?._selection === "elected")
      .reduce((n, r) => n + (Date.parse(r.until ?? "2026-09-01") - Date.parse(r.since!.length === 7 ? `${r.since}-01` : r.since!)) / 864e5, 0);
    expect(c.electedDays).toBeGreaterThan(0);
    expect(c.electedDays).toBeLessThan(naive);
    expect(c.partyHistory).toBe("incomplete");
  });
});
