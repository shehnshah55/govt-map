import { describe, expect, it } from "vitest";
import units from "../src/geo/pk-units.json";
import { compile } from "../scripts/compile.ts";
import { GraphIndex } from "../src/lib/graph-index.ts";
import { starterMap } from "../src/views/starter-map.ts";
import { TIERS } from "../src/views/tiers.ts";

const { graph } = compile(new URL("../data", import.meta.url).pathname);
const ix = new GraphIndex(graph);

describe("starter map", () => {
  it("has one boundary for each of the seven federating units", () => {
    const ids = units.features.map((f) => f.properties.id).sort();
    expect(ids).toEqual(TIERS.filter((t) => t !== "pk").sort());
  });

  it("records where the boundaries came from", () => {
    expect(units.metadata.url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/nvkelso\/natural-earth-vector\//);
    expect(units.metadata.licence).toBe("Public domain");
    expect(units.metadata.processing).toMatch(/FATA.*merged into Khyber Pakhtunkhwa/);
  });

  it("stays small enough for the home page", () => {
    expect(JSON.stringify(units).length).toBeLessThan(40_000);
  });

  it("renders a panel for the Federation and every unit, starting with the Federation", () => {
    const { body } = starterMap({ ix, repo: "", go: () => {} });
    const html = body.html;
    for (const t of TIERS) expect(html).toContain(`data-panel="${t}"`);
    expect(html).toMatch(/data-panel="pk"(?![^>]*hidden)/);
    expect(html).toContain('href="#/org/fed-pm-office"');
    expect(html).toContain("Disputed territory");
  });
});
