import { describe, expect, it } from "vitest";
import { compile } from "../scripts/compile.ts";
import { families, familyOf, generations, tiesOf } from "../src/lib/families.ts";
import { GraphIndex } from "../src/lib/graph-index.ts";
import type { Graph } from "../src/schema.ts";
import { personView } from "../src/views/entities.ts";
import { familiesView, familyView } from "../src/views/families.ts";

const { graph } = compile(new URL("../data", import.meta.url).pathname);
const ctx = (ix: GraphIndex) => ({ ix, repo: "https://github.com/shehnshah55/govt-map", go: () => {} });

// Synthetic ties between arbitrary officeholders, for these tests only. They are not claims about anyone.
const [a, b, c, d, e] = graph.people.filter((p) => p.roles.length).map((p) => p.id);
const src = (n: string) => [{ title: `Official source ${n}`, url: `https://www.na.gov.pk/test/${n}` }];
function withTies(): GraphIndex {
  const g = structuredClone(graph) as Graph;
  g.relatives = [
    { from: a, to: b, relation: "parent", sources: src("1"), _file: "test" },
    { from: b, to: c, relation: "spouse", sources: src("2"), _file: "test" },
    { from: d, to: e, relation: "sibling", sources: src("3"), notes: `<script>alert(1)</script>`, _file: "test" },
  ];
  return new GraphIndex(g);
}

describe("political families", () => {
  it("groups connected people, largest family first", () => {
    const fs = families(withTies());
    expect(fs.map((f) => f.members.length)).toEqual([3, 2]);
    expect(fs[0].members.map((m) => m.id).sort()).toEqual([a, b, c].sort());
    expect(fs[0].ties).toHaveLength(2);
    expect(familyOf(withTies(), c)?.id).toBe(fs[0].id);
  });

  it("puts parents above children and spouses side by side on the same row", () => {
    const f = families(withTies())[0];
    const at = new Map(generations(f).map((g) => [g.id, g]));
    expect(at.get(a)!.row).toBe(0); // parent
    expect(at.get(b)!.row).toBe(1); // child
    expect(at.get(c)!.row).toBe(1); // child's spouse
    expect(Math.abs(at.get(b)!.col - at.get(c)!.col)).toBe(1);
  });

  it("phrases each tie from the person's side", () => {
    const ix = withTies();
    expect(tiesOf(ix, a)[0].phrase).toBe("parent of");
    expect(tiesOf(ix, b).map((t) => t.phrase).sort()).toEqual(["child of", "spouse of"]);
  });

  it("shows every tie with its source on the family page, and escapes notes", () => {
    const ix = withTies();
    const page = familyView(ctx(ix), b)!.body.html;
    expect(page).toContain("https://www.na.gov.pk/test/1");
    expect(page).toContain("https://www.na.gov.pk/test/2");
    expect(page).toContain("parent of");
    expect(page).not.toContain("https://www.na.gov.pk/test/3"); // another family
    const other = familyView(ctx(ix), d)!.body.html;
    expect(other).not.toContain("<script>");
    expect(other).toContain("&lt;script&gt;");
  });

  it("adds a Family section to a member's page, and nothing to anyone else's", () => {
    const ix = withTies();
    expect(personView(ctx(ix), a)!.body.html).toContain(`href="#/family/${a}"`);
    const outsider = graph.people.find((p) => ![a, b, c, d, e].includes(p.id))!;
    expect(personView(ctx(ix), outsider.id)!.body.html).not.toContain("#/family/");
  });

  it("explains the empty state while no ties are recorded", () => {
    const ix = new GraphIndex(graph);
    expect(graph.relatives).toHaveLength(0);
    expect(familiesView(ctx(ix)).body.html).toContain("No family ties are recorded yet");
    expect(familyView(ctx(ix), a)).toBeUndefined();
  });
});
