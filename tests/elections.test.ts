import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { compile } from "../scripts/compile.ts";
import { notDirectlyElected, notLegallyElected } from "../src/lib/elections.ts";
import { GraphIndex } from "../src/lib/graph-index.ts";
import { PUBLISH, publicGraph } from "../src/lib/policy.ts";
import type { Graph } from "../src/schema.ts";
import { personView, postView } from "../src/views/entities.ts";

const DATA = new URL("../data", import.meta.url).pathname;
const { graph } = compile(DATA);
const ix = new GraphIndex(graph);
const ctx = (i: GraphIndex) => ({ ix: i, repo: "https://github.com/shehnshah55/govt-map", go: () => {} });

describe("Not directly elected", () => {
  it("tags a senator, with the reason", () => {
    const senators = graph.people.filter((p) => p.roles.some((r) => !r.until && (r.position === "fed-senator" || r.position.startsWith("seat-senate-"))));
    expect(senators.length).toBeGreaterThan(0);
    for (const p of senators) expect(notDirectlyElected(ix, p)?.reason, p.id).toBe("indirect_seat");
  });

  it("never tags someone holding a directly elected seat", () => {
    for (const p of graph.people.filter((x) => x.roles.some((r) => !r.until && ix.post.get(r.position)?.appointment?.method === "direct_election")))
      expect(notDirectlyElected(ix, p), p.id).toBeUndefined();
  });

  it("does not tag a minister just because no seat is recorded for them", () => {
    const ministers = graph.people.filter(
      (p) => !p.non_member && p.roles.some((r) => !r.until && /-minister$/.test(r.position)) && !p.roles.some((r) => !r.until && ix.post.get(r.position)?.org && ["chamber", "legislature"].includes(ix.org.get(ix.post.get(r.position)!.org)?.kind ?? "")),
    );
    expect(ministers.length).toBeGreaterThan(5);
    for (const p of ministers) expect(notDirectlyElected(ix, p), p.id).toBeUndefined();
  });

  it("tags a minister or adviser once a source records them as a non-member", () => {
    const minister = graph.people.find((p) => p.id === "mustafa-kamal")!;
    expect(notDirectlyElected(ix, minister)).toBeUndefined();
    const g = structuredClone(graph) as Graph;
    g.people.find((p) => p.id === "mustafa-kamal")!.non_member = { as_of: "2026-09", source: { title: "Cabinet Division notification", url: "https://cabinet.gov.pk/x" } };
    const i2 = new GraphIndex(g);
    expect(notDirectlyElected(i2, i2.person.get("mustafa-kamal")!)?.reason).toBe("non_member");
    expect(personView(ctx(i2), "mustafa-kamal")!.body.html).toContain("Not directly elected");
  });
});

// A synthetic check on a real seat, used only in these tests.
const holder = graph.people.find((p) => p.roles.some((r) => r.position === "seat-na-123" && !r.until))!;
const ecp = (n: string) => `{ title: "ECP ${n}", url: "https://www.ecp.gov.pk/test/${n}.pdf" }`;
const check = (o: { status?: string; leader?: number; declared?: number; stations?: string; f45url?: string; person?: string; seat?: string } = {}) => `election_checks:
  - seat: ${o.seat ?? "seat-na-123"}
    election: "2024-02-08"
    person: ${o.person ?? holder.id}
    form47: { winner: { name: "${holder.name}", party: party-pmln, votes: 63953 }, source: ${ecp("form47")} }
    form45:
      leader: { name: "Test Candidate", votes: ${o.leader ?? 70000} }
      declared_winner: { name: "${holder.name}", party: party-pmln, votes: ${o.declared ?? 60000} }
      ${o.stations ?? "polling_stations: 300\n      of_polling_stations: 300"}
      sources: [${o.f45url ?? ecp("form45")}]
    status: ${o.status ?? "differs"}
    checked: "2026-10-01"
`;

describe("Form 45 / Form 47 checks", () => {
  const dir = mkdtempSync(join(tmpdir(), "govt-map-f45-"));
  cpSync(DATA, join(dir, "data"), { recursive: true });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const run = (yaml: string) => {
    writeFileSync(join(dir, "data", "elections", "form45-checks.yaml"), yaml);
    return compile(join(dir, "data"));
  };

  it("accepts a complete, ECP-sourced check and shows the label with its evidence", () => {
    const { graph: g, errors } = run(check());
    expect(errors).toEqual([]);
    const i2 = new GraphIndex(publicGraph(g));
    expect(PUBLISH.form45Labels).toBe(true);
    expect(notLegallyElected(i2, i2.person.get(holder.id)!)).toBeDefined();
    const page = personView(ctx(i2), holder.id)!.body.html;
    expect(page).toContain("Not legally elected");
    expect(page).toContain("70,000"); // Form 45 leader
    expect(page).toContain("60,000"); // declared winner in Form 45
    expect(page).toContain("63,953"); // Form 47
    expect(page).toContain("https://www.ecp.gov.pk/test/form45.pdf");
    expect(page).toContain("https://www.ecp.gov.pk/test/form47.pdf");
    expect(page).toContain("300 of 300 polling stations");
    expect(postView(ctx(i2), "seat-na-123")!.body.html).toContain("Not legally elected");
  });

  it("shows no label when the Form 45s agree", () => {
    const { graph: g, errors } = run(check({ status: "matches", leader: 50000, declared: 60000 }));
    expect(errors).toEqual([]);
    const i2 = new GraphIndex(g);
    expect(notLegallyElected(i2, i2.person.get(holder.id)!)).toBeUndefined();
    expect(personView(ctx(i2), holder.id)!.body.html).not.toContain("Not legally elected");
  });

  it("rejects a check whose figures or sources don't support it", () => {
    const err = (o: Parameters<typeof check>[0]) => run(check(o)).errors.join("\n");
    expect(err({ f45url: `{ title: "Party compilation", url: "https://example.org/form45" }`})).toMatch(/ECP publication/);
    expect(err({ stations: "polling_stations: 250\n      of_polling_stations: 300" })).toMatch(/every polling station/);
    expect(err({ stations: "" })).toMatch(/every polling station/);
    expect(err({ leader: 50000, declared: 60000 })).toMatch(/status "differs" needs/);
    expect(err({ status: "matches" })).toMatch(/can't be "matches"/);
    expect(err({ person: "nawaz-sharif" })).toMatch(/has no role in seat-na-123/);
    expect(err({ seat: "fed-senator" })).toMatch(/only directly elected seats/);
  });

  it("escapes names from the documents", () => {
    const yaml = check().replace('"Test Candidate"', '"<img src=x onerror=alert(1)>"');
    const { graph: g, errors } = run(yaml);
    expect(errors).toEqual([]);
    const page = personView(ctx(new GraphIndex(g)), holder.id)!.body.html;
    expect(page).not.toContain("<img");
    expect(page).toContain("&lt;img");
  });
});
