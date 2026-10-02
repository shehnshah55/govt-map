import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { compile } from "../scripts/compile.ts";
import { toCsvExports, toPopolo } from "../scripts/exports.ts";
import { isAssetSource, LICENCE, PUBLISH, publicGraph } from "../src/lib/policy.ts";
import { Person } from "../src/schema.ts";

const DATA = new URL("../data", import.meta.url).pathname;
const { graph: full } = compile(DATA);
const published = publicGraph(full);

describe("what the public build contains", () => {
  it("has no legal cases anywhere while they are hidden (§1.4)", () => {
    expect(PUBLISH.legalCases).toBe(false);
    // the source data does contain them, so this test would notice if hiding stopped working
    expect(full.people.some((p) => p.legal_cases?.length)).toBe(true);
    const titles = full.people.flatMap((p) => p.legal_cases ?? []).map((c) => c.title);
    const outputs = {
      "graph.json": JSON.stringify(published),
      "popolo.json": JSON.stringify(toPopolo(published)),
      ...toCsvExports(published),
    };
    for (const [name, text] of Object.entries(outputs)) {
      expect(text, name).not.toContain("legal_cases");
      for (const t of titles) expect(text, `${name}: ${t}`).not.toContain(t);
    }
  });

  it("drops verification entries about hidden content", () => {
    expect(full.verification.some((v) => v.topic === "legal_cases")).toBe(true);
    expect(published.verification.some((v) => v.topic === "legal_cases")).toBe(false);
    expect(published.verification.length).toBeGreaterThan(0);
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
