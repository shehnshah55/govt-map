import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { compile } from "../scripts/compile.ts";
import { toCsvExports, toPopolo } from "../scripts/exports.ts";
import { caseProblems, isAssetSource, isEncyclopediaUrl, LICENCE, PUBLISH, publicGraph, publishedCaseProblems } from "../src/lib/policy.ts";
import { Person } from "../src/schema.ts";

const DATA = new URL("../data", import.meta.url).pathname;
const { graph: full } = compile(DATA);
const published = publicGraph(full);

describe("what the public build contains", () => {
  it("publishes only cited legal cases marked publish: true, and none of the held-back ones", () => {
    expect(PUBLISH.legalCases).toBe(true);
    const all = full.people.flatMap((p) => p.legal_cases ?? []);
    const held = all.filter((c) => c.publish !== true);
    const shown = published.people.flatMap((p) => p.legal_cases ?? []);
    expect(held.length).toBeGreaterThan(0);
    expect(shown.length).toBe(all.length - held.length);
    const outputs = {
      "graph.json": JSON.stringify(published),
      "popolo.json": JSON.stringify(toPopolo(published)),
      ...toCsvExports(published),
    };
    for (const [name, text] of Object.entries(outputs)) {
      for (const c of held) if (c.hold_reason) expect(text, `${name}: ${c.title}`).not.toContain(c.hold_reason);
      expect(text, name).not.toContain('"publish"');
      expect(text, name).not.toContain("hold_reason");
    }
  });

  it("shows every published case's charge, outcome, as-of date and outcome source", () => {
    expect(publishedCaseProblems(full)).toEqual([]);
    for (const c of published.people.flatMap((p) => p.legal_cases ?? [])) {
      expect(caseProblems(c), c.title).toEqual([]);
      expect(c.charges).toBeTruthy();
      expect(c.status_as_of).toMatch(/^\d{4}(-\d{2}(-\d{2})?)?$/);
      expect(c.status_source?.url).toMatch(/^https:\/\//);
    }
  });

  it("fails the gate for a case marked publish: true without a charge, outcome date or outcome source", () => {
    const base = { title: "T", filed: "2020", status: "pending" as const, sources: [{ title: "s", url: "https://www.dawn.com/news/1" }], publish: true };
    const g = (c: object) => ({ ...full, people: [{ ...full.people[0], legal_cases: [c] }] }) as typeof full;
    expect(publishedCaseProblems(g(base)).join()).toMatch(/no charge.*no status_as_of date.*no status_source URL/);
    expect(publishedCaseProblems(g({ ...base, charges: "c", status_as_of: "2024-01", status_source: { title: "s", url: "https://www.dawn.com/news/1" } }))).toEqual([]);
    expect(publishedCaseProblems(g({ ...base, charges: "c", status_as_of: "2024-01", status_source: { title: "w", url: "https://en.wikipedia.org/wiki/X" } }))[0]).toMatch(/encyclopedia/);
    // not marked publish: true → not gated, and not published
    expect(publishedCaseProblems(g({ ...base, publish: false }))).toEqual([]);
    expect(publicGraph(g({ ...base, publish: false })).people[0].legal_cases).toBeUndefined();
    // marked publish: true but failing the gate → still never published
    expect(publicGraph(g(base)).people[0].legal_cases).toBeUndefined();
  });

  it("keeps the verification entry about legal cases, which now covers only published cases", () => {
    const v = published.verification.find((x) => x.topic === "legal_cases");
    expect(v).toBeDefined();
    const shownPeople = new Set(published.people.filter((p) => p.legal_cases?.length).map((p) => p.id));
    for (const r of v!.records ?? []) expect(shownPeople.has(r), r).toBe(true);
  });

  it("states the data licence in graph.json and the Popolo export", () => {
    expect(published.meta.licence?.data.id).toBe("CC-BY-4.0");
    expect(published.meta.licence?.attribution).toBe("Pakistan Government Graph");
    expect((toPopolo(published) as { meta: { licence: typeof LICENCE } }).meta.licence.data.id).toBe("CC-BY-4.0");
  });

  it("leaves the full graph untouched for validation and the coverage audit", () => {
    expect(full.meta.licence).toBeUndefined();
    expect(full.people.filter((p) => p.legal_cases?.length).length).toBeGreaterThan(0);
  });

  it("strips Wikipedia and Britannica citations from the published graph (§0.2.2)", () => {
    expect(isEncyclopediaUrl("https://en.wikipedia.org/wiki/Pakistan")).toBe(true);
    expect(isEncyclopediaUrl("https://www.britannica.com/place/Pakistan")).toBe(true);
    expect(isEncyclopediaUrl("https://www.dawn.com/news/1")).toBe(false);

    // Source YAML still has encyclopedia citations (Phase 0 baseline); the publish path must not.
    const authoredWiki = full.people.some((p) => p.roles.some((r) => isEncyclopediaUrl(r.source?.url)))
      || full.verification.some((v) => v.sources?.some((s) => isEncyclopediaUrl(s.url)));
    expect(authoredWiki).toBe(true);

    const publishedText = JSON.stringify(published);
    expect(publishedText).not.toMatch(/wikipedia\.org/i);
    expect(publishedText).not.toMatch(/britannica\.com/i);
    expect(published.people.some((p) => p.roles.some((r) => isEncyclopediaUrl(r.source?.url)))).toBe(false);
    expect(published.verification.some((v) => v.sources?.some((s) => isEncyclopediaUrl(s.url)))).toBe(false);
  });
});

describe("declared assets (§1.5: ECP only)", () => {
  const person = (url: string) => ({
    id: "x",
    name: "X",
    roles: [],
    as_of: "2026-09",
    declared_assets: [{ amount_pkr: 1, as_of: "2024-25", basis: "Annual statement (s. 137)", source: { title: "t", url } }],
  });

  it("accepts ECP publications only", () => {
    expect(isAssetSource("https://www.ecp.gov.pk/Documents/assets.pdf")).toBe(true);
    expect(isAssetSource("https://ecp.gov.pk/x")).toBe(true);
    for (const url of ["https://www.thenews.com.pk/print/1", "https://ecp.gov.pk.example.com/x", "https://notecp.gov.pk/x", "not a url"]) expect(isAssetSource(url), url).toBe(false);
    expect(Person.safeParse(person("https://www.ecp.gov.pk/a.pdf")).success).toBe(true);
    expect(Person.safeParse(person("https://www.thenews.com.pk/print/1")).success).toBe(false);
  });
});

describe("family ties", () => {
  const dir = mkdtempSync(join(tmpdir(), "govt-map-policy-"));
  cpSync(DATA, join(dir, "data"), { recursive: true });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const people = full.people.filter((p) => p.roles.length).map((p) => p.id);
  const run = (yaml: string) => {
    writeFileSync(join(dir, "data", "zz-relatives-test.yaml"), yaml);
    return compile(join(dir, "data")).errors.filter((e) => e.includes("relatives"));
  };
  const tie = (from: string, to: string, sources: string) => `relatives:\n  - { from: ${from}, to: ${to}, relation: sibling, sources: [${sources}] }\n`;
  const press = (n: number, host = "dawn.com") => `{ title: "Report ${n}", url: "https://www.${host}/news/${n}" }`;

  it("accepts an official source, or two independent outlets", () => {
    expect(run(tie(people[0], people[1], `{ title: "Official", url: "https://www.na.gov.pk/en/profile.php?uid=1" }`))).toEqual([]);
    expect(run(tie(people[0], people[1], `${press(1)}, ${press(2, "tribune.com.pk")}`))).toEqual([]);
  });

  it("rejects a single press report, or two from the same outlet", () => {
    expect(run(tie(people[0], people[1], press(1)))).toHaveLength(1);
    expect(run(tie(people[0], people[1], `${press(1)}, ${press(2)}`))).toHaveLength(1);
  });

  it("rejects people with no public or party office, and unknown people", () => {
    const yaml = `people:\n  - { id: private-relative, name: Private Relative, roles: [], as_of: "2026-09" }\n${tie(people[0], "private-relative", `{ title: "Official", url: "https://www.na.gov.pk/x" }`)}`;
    expect(run(yaml).some((e) => e.includes("holds no public or party office"))).toBe(true);
    expect(run(tie(people[0], "nobody-by-this-id", `{ title: "Official", url: "https://www.na.gov.pk/x" }`)).some((e) => e.includes("unknown person"))).toBe(true);
  });
});
