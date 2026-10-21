import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { compile } from "../scripts/compile.ts";
import { citedUrls } from "../scripts/staleness.ts";
import { isOfficialHost, isOfficialSiteUrl, OFFICIAL_ORG_HOSTS, publicGraph } from "../src/lib/policy.ts";
import { OfficialSite } from "../src/schema.ts";

const DATA = new URL("../data", import.meta.url).pathname;
const { graph, errors } = compile(DATA);
const sites = graph.official_sites;

describe("official websites registry (data/official-sites.yaml)", () => {
  it("compiles without errors and is not empty", () => {
    expect(errors).toEqual([]);
    expect(sites.length).toBeGreaterThan(150);
  });

  it("lists only official domains, over https", () => {
    for (const s of sites) {
      expect(isOfficialSiteUrl(s.url), s.id).toBe(true);
      expect(s.url.startsWith("https://"), s.id).toBe(true);
    }
  });

  it("has one entry per id and per URL", () => {
    expect(new Set(sites.map((s) => s.id)).size).toBe(sites.length);
    const key = (u: string) => u.replace(/^https:\/\/(www\.)?/, "").replace(/\/+$/, "");
    expect(new Set(sites.map((s) => key(s.url))).size).toBe(sites.length);
  });

  it("ties sites to bodies that exist, and records a check date and status", () => {
    const orgs = new Set(graph.organizations.map((o) => o.id));
    for (const s of sites) {
      if (s.body_id) expect(orgs.has(s.body_id), `${s.id} → ${s.body_id}`).toBe(true);
      expect(s.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(sites.filter((s) => s.body_id).length).toBeGreaterThan(100);
  });

  it("never cites a third-party aggregator", () => {
    for (const s of sites) expect(isOfficialHost(new URL(s.url).hostname), s.url).toBe(true);
  });

  it("is published, and its URLs go to the weekly link check", () => {
    const pub = publicGraph(graph);
    expect(pub.official_sites.length).toBe(sites.length);
    const urls = citedUrls(pub);
    for (const s of sites) expect(urls.has(s.url), s.url).toBe(true);
  });
});

describe("official-domain rule (src/lib/policy.ts)", () => {
  it("accepts government domains and listed statutory hosts, with subdomains", () => {
    for (const h of ["nadra.gov.pk", "www.fbr.gov.pk", "ppsc.gop.pk", "spsc.gos.pk", "bpsc.gob.pk", "ajkpolice.gok.pk", "x.gkp.pk", "dirbs.pta.gov.pk", "bill.pitc.com.pk", ...Object.keys(OFFICIAL_ORG_HOSTS)])
      expect(isOfficialHost(h), h).toBe(true);
  });

  it("rejects look-alikes and everything else", () => {
    for (const h of ["gov.pk.example.com", "notgov.pk", "fakegov.pk", "example.com", "nadra-gov.pk", "sbp.org.pk.example.net", "pakistan.gov", "com.pk"])
      expect(isOfficialHost(h), h).toBe(false);
    expect(isOfficialSiteUrl("not a url")).toBe(false);
  });

  it("is enforced by the schema", () => {
    const base = { id: "x", name: "X", level: "federal", category: "government", status: "verified", checked: "2026-10-21" };
    expect(OfficialSite.safeParse({ ...base, url: "https://www.nadra.gov.pk/" }).success).toBe(true);
    expect(OfficialSite.safeParse({ ...base, url: "https://example.com/" }).success).toBe(false);
    expect(OfficialSite.safeParse({ ...base, url: "http://www.nadra.gov.pk/" }).success).toBe(false);
    expect(OfficialSite.safeParse({ ...base, url: "javascript:alert(1)" }).success).toBe(false);
    expect(OfficialSite.safeParse({ ...base, url: "https://www.nadra.gov.pk/", checked: "21/10/2026" }).success).toBe(false);
  });
});

describe("compile rules for the registry", () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const withExtra = (yaml: string) => {
    const dir = mkdtempSync(join(tmpdir(), "gm-sites-"));
    dirs.push(dir);
    cpSync(DATA, join(dir, "data"), { recursive: true });
    writeFileSync(join(dir, "data", "zz-test.yaml"), yaml);
    return compile(join(dir, "data"));
  };

  it("rejects an unknown body_id and a duplicate URL", () => {
    const first = sites[0];
    const { errors: errs } = withExtra(
      `official_sites:\n  - { id: zz-one, name: One, url: "https://zz-one.gov.pk/", level: federal, category: government, body_id: no-such-body, status: verified, checked: "2026-10-21" }\n  - { id: zz-two, name: Two, url: "${first.url}", level: federal, category: government, status: verified, checked: "2026-10-21" }\n`,
    );
    expect(errs.some((e) => e.includes('unknown reference "no-such-body"'))).toBe(true);
    expect(errs.some((e) => e.includes(`same URL as ${first.id}`))).toBe(true);
  });

  it("gives a body with no website the one verified site tied to it", () => {
    const body = graph.organizations.find((o) => !o.website && !graph.official_sites.some((s) => s.body_id === o.id) && !o.generated)!;
    const { graph: g2, errors: errs } = withExtra(
      `official_sites:\n  - { id: zz-site, name: Test, url: "https://zz-site.gov.pk/", level: federal, category: government, body_id: ${body.id}, status: verified, checked: "2026-10-21" }\n`,
    );
    expect(errs).toEqual([]);
    expect(g2.organizations.find((o) => o.id === body.id)!.website).toBe("https://zz-site.gov.pk/");
  });

  it("never takes a service portal as a body's website", () => {
    const body = graph.organizations.find((o) => !o.website && !graph.official_sites.some((s) => s.body_id === o.id) && !o.generated)!;
    const { graph: g2, errors: errs } = withExtra(
      `official_sites:\n  - { id: zz-portal, name: Test portal, url: "https://zz-portal.gov.pk/", level: federal, category: government, body_id: ${body.id}, portal: true, status: verified, checked: "2026-10-21" }\n`,
    );
    expect(errs).toEqual([]);
    expect(g2.organizations.find((o) => o.id === body.id)!.website).toBeUndefined();
  });
});
