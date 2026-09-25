import { describe, expect, it } from "vitest";
import { compile } from "../scripts/compile.ts";
import { toCsvExports, toPopolo } from "../scripts/exports.ts";
import { GraphIndex } from "../src/lib/graph-index.ts";

const { graph, errors, warnings } = compile(new URL("../data", import.meta.url).pathname);
const ix = new GraphIndex(graph);

describe("data integrity", () => {
  it("compiles without errors or warnings", () => {
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("covers every level of government", () => {
    const kinds = new Set(graph.jurisdictions.map((j) => j.kind));
    for (const k of ["country", "federal_capital", "province", "special_territory", "division", "district"]) expect(kinds).toContain(k);
    expect(graph.jurisdictions.filter((j) => j.kind === "province")).toHaveLength(4);
    expect(graph.jurisdictions.filter((j) => j.kind === "district").length).toBeGreaterThan(150);
  });

  it("gives every district a Deputy Commissioner", () => {
    for (const d of graph.jurisdictions.filter((j) => j.kind === "district")) {
      expect(ix.post.has(`${d.id}-deputy-commissioner`), d.id).toBe(true);
    }
  });

  it("gives every federal Division a Secretary and every provincial department a Secretary", () => {
    for (const o of graph.organizations.filter((o) => o.kind === "division")) {
      expect(ix.leadership(o.id).some((p) => p.role === "administrative_head"), o.id).toBe(true);
    }
    for (const o of graph.organizations.filter((o) => o.kind === "department")) {
      expect(ix.leadership(o.id).some((p) => p.role === "administrative_head" || (p.role === "head" && p.appointment?.method === "posting")), o.id).toBe(true);
    }
  });

  it("cites a legal basis for every constitutional body, court and ministry", () => {
    for (const o of graph.organizations.filter((o) => ["constitutional_body", "court", "ministry", "regulator"].includes(o.kind) && !o.id.includes("district-judiciary"))) {
      expect(o.legal_basis?.length ?? 0, o.id).toBeGreaterThan(0);
    }
  });

  it("has a complete constituency roster for every directly elected house", () => {
    const count = (code: string) => graph.positions.filter((p) => p.id.startsWith(`seat-${code}-`) && p.seat_type === "general").length;
    expect(count("na")).toBe(266);
    expect(count("pp")).toBe(297);
    expect(count("ps")).toBe(130);
    expect(count("pk")).toBe(115);
    expect(count("pb")).toBe(51);
    const naTotal = graph.positions.filter((p) => p.org === "fed-national-assembly" && (p.area || p.seat_type)).reduce((n, p) => n + (p.seats ?? 1), 0);
    expect(naTotal).toBe(336);
    const senateTotal = graph.positions.filter((p) => p.org === "fed-senate" && p.seat_type).reduce((n, p) => n + (p.seats ?? 1), 0);
    expect(senateTotal).toBe(96);
  });

  it("gives every regulator a head post", () => {
    for (const o of graph.organizations.filter((o) => o.kind === "regulator")) {
      expect(ix.leadership(o.id).some((p) => p.role === "head"), o.id).toBe(true);
    }
  });

  it("links every party-affiliated person to a registered party", () => {
    for (const p of graph.people.filter((p) => p.party)) expect(ix.org.get(p.party!)?.kind, p.id).toBe("political_party");
  });

  it("dates every officeholder record", () => {
    for (const p of graph.people) expect(p.as_of, p.id).toMatch(/^\d{4}-\d{2}/);
  });
});

describe("queries", () => {
  it("traces the chain of authority for the health secretary back to the voters", () => {
    const chain = ix.appointmentChain("fed-min-nhsrc-secretary").map((s) => s.id);
    expect(chain).toEqual(["fed-prime-minister", "fed-national-assembly", "pk-electorate"]);
  });

  it("resolves ex officio holders", () => {
    const pm = ix.currentHolders("fed-prime-minister")[0]?.person.id;
    expect(ix.effectiveHolders("fed-cci-chair")[0]?.person.id).toBe(pm);
  });

  it("links each provincial health department back to the federal ministry", () => {
    for (const id of ["pb-primary-secondary-healthcare", "sd-health", "kp-health", "ba-health"]) {
      expect(ix.out.get(id)?.some((e) => e.to === "fed-min-nhsrc" && e.type === "coordinates_with"), id).toBe(true);
    }
  });

  it("puts the health ministry's regulators under it", () => {
    const kids = ix.descendants("fed-min-nhsrc").map((o) => o.id);
    for (const id of ["fed-drap", "fed-pmdc", "fed-nih", "fed-neoc", "fed-sehat-sahulat"]) expect(kids).toContain(id);
  });

  it("finds things by name, abbreviation and officeholder", () => {
    expect(ix.search("DRAP")[0]?.id).toBe("fed-drap");
    expect(ix.search("maryam nawaz")[0]?.id).toBe("maryam-nawaz");
    expect(ix.search("lahore").some((r) => r.id === "pk-pb-lahore")).toBe(true);
  });
});

describe("exports", () => {
  it("produces Popolo memberships that reference known posts", () => {
    const p = toPopolo(graph);
    const posts = new Set(p.posts.map((x) => x.id));
    for (const m of p.memberships) expect(posts.has(m.post_id), m.id).toBe(true);
  });

  it("writes CSVs with one row per record", () => {
    const csv = toCsvExports(graph);
    expect(csv["organizations.csv"].trim().split("\n")).toHaveLength(graph.organizations.length + 1);
  });
});
