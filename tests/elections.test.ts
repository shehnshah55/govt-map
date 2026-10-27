import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkResults } from "../scripts/results-check.ts";
import { compile } from "../scripts/compile.ts";
import { notDirectlyElected, notLegallyElected } from "../src/lib/elections.ts";
import { byDistrict, leaderOf, shift, weightedFit } from "../src/lib/vote-explorer.ts";
import { GraphIndex } from "../src/lib/graph-index.ts";
import { PUBLISH, publicGraph } from "../src/lib/policy.ts";
import type { CensusFile, Graph, ResultsFile } from "../src/schema.ts";
import { electionsBody } from "../src/views/elections.ts";
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

// Elections and census (#/elections). The figures below are made up for these tests and never ship:
// real results come only from ECP publications in data/results/, census figures only from PBS in data/census/.
const ECP = { title: "ECP result", url: "https://www.ecp.gov.pk/result", accessed: "2026-10-27" };
const PBS = { title: "PBS census", url: "https://www.pbs.gov.pk/census", accessed: "2026-10-27" };

const row = (constituency: string, districts: string[], registered: number, votes: [string, number][], rejected = 0, extra = {}) => {
  const valid = votes.reduce((s, [, v]) => s + v, 0);
  return { constituency, districts, registered, polled: valid + rejected, valid, rejected, votes: votes.map(([party, v]) => ({ party, votes: v })), source: ECP, ...extra };
};

const ge2024: ResultsFile = {
  election: "ge-2024",
  house: "na",
  title: "General election 2024, National Assembly",
  checked: "2026-10-27",
  results: [
    row("con-na-120", ["pk-pb-lahore"], 1000, [["party-pmln", 300], ["independent", 200]], 10),
    row("con-na-121", ["pk-pb-lahore"], 1000, [["party-pmln", 250], ["independent", 300]], 10),
    row("con-na-1", ["pk-kp-bannu", "pk-kp-lakki-marwat"], 800, [["independent", 400]]),
    row("con-na-2", ["pk-kp-swat"], 900, [["independent", 500], ["party-juif", 100]]),
    row("con-na-3", ["pk-kp-swat"], 900, [["independent", 1]], 0, { not_held: "postponed" }),
  ],
};
const ge2018: ResultsFile = {
  election: "ge-2018",
  house: "na",
  title: "General election 2018, National Assembly",
  checked: "2026-10-27",
  results: [row("con-na-120", ["pk-pb-lahore"], 1800, [["party-pmln", 700], ["party-pti", 400]]), row("con-na-2", ["pk-kp-swat"], 800, [["party-pti", 400], ["party-juif", 200]])],
};

describe("results by district", () => {
  const d = byDistrict(ge2024);

  it("counts every held constituency nationally, and only single-district ones in district rows", () => {
    expect(d.national.constituencies).toBe(4);
    expect(d.national.registered).toBe(3700);
    expect(d.spanning.map((r) => r.constituency)).toEqual(["con-na-1"]);
    expect(d.notHeld.map((r) => r.constituency)).toEqual(["con-na-3"]);
    expect(d.rows.map((r) => r.district)).toEqual(["pk-kp-swat", "pk-pb-lahore"]);
    const lahore = d.rows.find((r) => r.district === "pk-pb-lahore")!;
    expect(lahore.registered).toBe(2000);
    expect(lahore.turnoutPct).toBeCloseTo((1070 / 2000) * 100);
    expect(lahore.leader).toBe("party-pmln");
    expect(lahore.leaderPct).toBeCloseTo((550 / 1050) * 100);
  });

  it("breaks a tie the same way every time", () => {
    expect(leaderOf(new Map([["b", 5], ["a", 5]]))).toEqual(["a", 5]);
  });

  it("compares two elections through shared districts, raw and relative to the national change", () => {
    const s = shift(byDistrict(ge2018), d, "turnout");
    expect(s.rows.map((r) => r.district)).toEqual(["pk-kp-swat", "pk-pb-lahore"]);
    const swat = s.rows.find((r) => r.district === "pk-kp-swat")!;
    expect(swat.before).toBeCloseTo(75);
    expect(swat.after).toBeCloseTo((600 / 900) * 100);
    expect(swat.raw).toBeCloseTo(swat.after - swat.before);
    expect(swat.relative).toBeCloseTo(swat.raw - (s.nationalAfter - s.nationalBefore));
    expect(swat.leaderBefore).toBe("party-pti");
    expect(swat.leaderAfter).toBe("independent");
    expect(s.unmatched).toEqual([]);
  });
});

describe("weighted fit", () => {
  it("recovers an exact line with r = 1", () => {
    const f = weightedFit([1, 2, 3, 4].map((x) => ({ x, y: 2 * x + 1, w: x })))!;
    expect(f.slope).toBeCloseTo(2);
    expect(f.intercept).toBeCloseTo(1);
    expect(f.r).toBeCloseTo(1);
  });

  it("lets a heavy point pull the line", () => {
    const pts = [{ x: 0, y: 0, w: 1 }, { x: 1, y: 1, w: 1 }, { x: 2, y: 0, w: 1 }];
    const light = weightedFit(pts)!;
    const heavy = weightedFit([...pts.slice(0, 2), { x: 2, y: 0, w: 100 }])!;
    expect(heavy.slope).toBeLessThan(light.slope);
  });

  it("refuses fewer than three points or no spread", () => {
    expect(weightedFit([{ x: 1, y: 1, w: 1 }, { x: 2, y: 2, w: 1 }])).toBeUndefined();
    expect(weightedFit([1, 2, 3].map((y) => ({ x: 5, y, w: 1 })))).toBeUndefined();
  });
});

describe("results and census build gate", () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const run = (files: Record<string, unknown>) => {
    const root = mkdtempSync(join(tmpdir(), "results-"));
    dirs.push(root);
    for (const [path, body] of Object.entries(files)) {
      mkdirSync(join(root, path.split("/")[0]), { recursive: true });
      writeFileSync(join(root, path), JSON.stringify(body));
    }
    return checkResults(root, graph).errors;
  };
  const census: CensusFile = {
    census: "2023",
    title: "Census 2023",
    source: PBS,
    definitions: { population: "Enumerated population", literacy_pct: "Share aged 10 and over who can read and write" },
    districts: [{ district: "pk-pb-lahore", population: 100, literacy_pct: 80 }],
    checked: "2026-10-27",
  };

  it("passes consistent files", () => {
    expect(run({ "results/ge-2024-na.json": ge2024, "results/ge-2018-na.json": ge2018, "census/districts-2023.json": census })).toEqual([]);
  });

  it("catches sums that don't add up and polls above the roll", () => {
    const bad = structuredClone(ge2024);
    bad.results[0].valid += 1;
    bad.results[1].polled = 5000;
    const errors = run({ "results/ge-2024-na.json": bad }).join("\n");
    expect(errors).toMatch(/con-na-120: valid .* ≠ polled/);
    expect(errors).toMatch(/con-na-120: votes listed add up to 500, not the 501 valid votes/);
    expect(errors).toMatch(/con-na-121: polled \(5000\) exceeds registered/);
  });

  it("checks constituencies, houses, districts and parties against the graph", () => {
    const bad = structuredClone(ge2024);
    bad.results[0].constituency = "con-na-9999";
    bad.results[1].districts = ["pk-kp-swat"];
    bad.results[3].votes[1].party = "party-nonexistent";
    bad.results.push(row("con-pp-150", ["pk-pb-lahore"], 10, [["independent", 1]]));
    const errors = run({ "results/ge-2024-na.json": bad }).join("\n");
    expect(errors).toMatch(/con-na-9999: no such constituency/);
    expect(errors).toMatch(/con-na-121: district pk-kp-swat is not in pk-pb/);
    expect(errors).toMatch(/con-na-121: data\/legislatures.yaml places it in pk-pb-lahore/);
    expect(errors).toMatch(/unknown party party-nonexistent/);
    expect(errors).toMatch(/con-pp-150: not a NA constituency/);
  });

  it("reconciles the rows with the ECP's own totals", () => {
    const withTotals = { ...ge2024, totals: { registered: 3700, polled: 2070, source: ECP } };
    expect(run({ "results/ge-2024-na.json": withTotals })).toEqual([]);
    const off = { ...ge2024, totals: { registered: 3701, polled: 2070, source: ECP } };
    expect(run({ "results/ge-2024-na.json": off }).join("\n")).toMatch(/rows add up to 3700 registered voters, ECP totals say 3701/);
  });

  it("accepts results only from the ECP and census figures only from PBS", () => {
    const notEcp = structuredClone(ge2024);
    notEcp.results[0].source = { ...ECP, url: "https://example-party.org/results" };
    expect(run({ "results/ge-2024-na.json": notEcp }).join("\n")).toMatch(/ECP publication/);
    expect(run({ "census/districts-2023.json": { ...census, source: { ...PBS, url: "https://www.gov.pk/census" } } }).join("\n")).toMatch(/Pakistan Bureau of Statistics/);
    expect(run({ "census/districts-2023.json": { ...census, definitions: { population: "x" } } }).join("\n")).toMatch(/definitions.literacy_pct/);
  });
});

describe("elections page", () => {
  const census: CensusFile = {
    census: "2023",
    title: "Census 2023",
    source: PBS,
    definitions: { population: "Enumerated population", literacy_pct: "Share aged 10 and over who can read and write" },
    districts: [
      { district: "pk-pb-lahore", population: 100, literacy_pct: 80 },
      { district: "pk-kp-swat", population: 100, literacy_pct: 60 },
    ],
    checked: "2026-10-27",
  };

  it("says what district figures leave out, and keeps independents as the ECP lists them", () => {
    const out = electionsBody(ctx(ix), { results: [ge2018, ge2024], census: [census] }, new URLSearchParams()).html;
    expect(out).toContain("1 constituencies cover more than one district");
    expect(out).toContain("Not counted: NA-3 (postponed)");
    expect(out).toContain("Independents</b> are shown as the ECP lists them");
    expect(out).toContain("Change since 2018");
    expect(out).toMatch(/PML-N|Pakistan Muslim League/);
  });

  it("escapes party names taken from the data", () => {
    const hostile = structuredClone(ge2024);
    hostile.results[3].votes[1] = { party_name: '<img src=x onerror="alert(1)">', votes: 100 } as never;
    const out = electionsBody(ctx(ix), { results: [hostile], census: [] }, new URLSearchParams("m=name:%3Cimg%20src%3Dx%20onerror%3D%22alert(1)%22%3E")).html;
    expect(out).not.toContain("<img src=x");
    expect(out).toContain("&lt;img src=x");
  });
});
