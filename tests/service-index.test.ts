import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { compile } from "../scripts/compile.ts";
import { checkServiceIndex, MAX_GZIP_BYTES } from "../scripts/service-index-check.ts";
import { ServiceItem } from "../src/schema.ts";

const DATA = new URL("../data", import.meta.url).pathname;
const { graph } = compile(DATA);
const orgs = new Set(graph.organizations.map((o) => o.id));
const real = checkServiceIndex(join(DATA, "service-index"), graph.official_sites, orgs);

describe("service index (data/service-index/)", () => {
  it("passes the build gate", () => {
    expect(real.errors).toEqual([]);
    expect(real.items.length).toBeGreaterThan(500);
    expect(real.gzipBytes).toBeLessThan(MAX_GZIP_BYTES);
  });

  it("every item has url, body_id, fetched_at and kind, on an https registry host", () => {
    const hosts = new Set(graph.official_sites.map((s) => new URL(s.url).hostname.replace(/^www\./, "")));
    for (const it of real.items) {
      expect(it.url.startsWith("https://"), it.id).toBe(true);
      expect(hosts.has(new URL(it.url).hostname.replace(/^www\./, "")), it.url).toBe(true);
      expect(it.body_id && it.fetched_at && it.kind, it.id).toBeTruthy();
      expect((it.excerpt ?? "").length).toBeLessThanOrEqual(300);
    }
  });

  it("covers the services people ask about most", () => {
    const has = (re: RegExp) => real.items.some((i) => re.test(`${i.title} ${i.url}`));
    expect(has(/passport/i)).toBe(true);
    expect(has(/domicile|ڈومیسائل/i)).toBe(true);
  });
});

describe("service index gate rejects bad items", () => {
  const dir = mkdtempSync(join(tmpdir(), "svc-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const site = graph.official_sites.find((s) => s.id === "dgip")!;
  const good = {
    id: "0123456789ab",
    url: "https://dgip.gov.pk/visa/fee.php",
    title: "Visa Application Fee",
    site_id: "dgip",
    body_id: site.body_id!,
    kind: "fee",
    type: "html",
    language: "en",
    fetched_at: "2026-10-21T04:00:00Z",
    http_status: 200,
    content_hash: "a".repeat(64),
  };
  const run = (items: unknown[], level = "federal") => {
    writeFileSync(join(dir, `items-${level}.json`), JSON.stringify({ schema: 1, level, items }));
    const r = checkServiceIndex(dir, graph.official_sites, orgs);
    rmSync(join(dir, `items-${level}.json`));
    return r.errors;
  };

  it("accepts a good item", () => {
    expect(ServiceItem.safeParse(good).success).toBe(true);
    expect(run([good])).toEqual([]);
  });

  it.each([
    ["missing kind", { ...good, kind: undefined }],
    ["missing fetched_at", { ...good, fetched_at: undefined }],
    ["missing body_id", { ...good, body_id: undefined }],
    ["http link", { ...good, url: "http://dgip.gov.pk/visa/fee.php" }],
    ["host not in the registry", { ...good, url: "https://example.com/visa/fee.php" }],
    ["host of another site", { ...good, url: "https://fbr.gov.pk/x" }],
    ["body that differs from the registry", { ...good, body_id: "fed-fbr" }],
    ["unknown site", { ...good, site_id: "nope" }],
    ["excerpt over 300 characters", { ...good, excerpt: "x".repeat(301) }],
    ["a mobile number in the excerpt", { ...good, excerpt: "For queries call Mr Khan on 0300-1234567 during office hours." }],
    ["a CNIC in the excerpt", { ...good, excerpt: "Applicant with CNIC 35202-1234567-1 is shortlisted for the post." }],
    ["a list of people", { ...good, title: "Merit List of Candidates 2026" }],
    ["an unknown field", { ...good, phone: "042-111" }],
  ])("rejects %s", (_name, bad) => {
    expect(run([bad]).length).toBeGreaterThan(0);
  });

  it("rejects duplicates and an item filed under the wrong level", () => {
    expect(run([good, { ...good, id: "0123456789ac" }]).join()).toMatch(/duplicate/);
    expect(run([good], "punjab").join()).toMatch(/is federal/);
  });
});
