import { describe, expect, it } from "vitest";
import { compile } from "../scripts/compile.ts";
import { isArchiveUrl } from "../src/lib/policy.ts";
import { Law, OfficialSite, Source } from "../src/schema.ts";

const DATA = new URL("../data", import.meta.url).pathname;
const { graph } = compile(DATA);
const snap = "https://web.archive.org/web/20261017104654/https://www.nadra.gov.pk/";

describe("archived copies: cited by the official URL, with the snapshot alongside", () => {
  it("recognises web archive hosts", () => {
    expect(isArchiveUrl(snap)).toBe(true);
    expect(isArchiveUrl("https://archive.ph/20180201200257/http://nadra.gov.pk/")).toBe(true);
    expect(isArchiveUrl("https://nadra.gov.pk/")).toBe(false);
  });

  it("rejects an archive snapshot as a citation's url", () => {
    expect(Source.safeParse({ title: "NADRA", url: snap }).success).toBe(false);
    expect(Law.safeParse({ id: "x", title: "X", kind: "act", jurisdiction: "pk", url: snap }).success).toBe(false);
  });

  it("needs both the official url and the snapshot when fetched_via is archive", () => {
    expect(Source.safeParse({ title: "NADRA", url: "https://nadra.gov.pk/", fetched_via: "archive" }).success).toBe(false);
    expect(Source.safeParse({ title: "NADRA", archive_url: snap, fetched_via: "archive" }).success).toBe(false);
    expect(Source.safeParse({ title: "NADRA", url: "https://nadra.gov.pk/", archive_url: snap, fetched_via: "archive" }).success).toBe(true);
    expect(Source.safeParse({ title: "NADRA", url: "https://nadra.gov.pk/", archive_url: "https://nadra.gov.pk/old" }).success).toBe(false);
  });

  it("verified_via_archive sites carry their snapshot", () => {
    const base = { id: "nadra", name: "NADRA", url: "https://nadra.gov.pk/", level: "federal", category: "citizen_services", checked: "2026-10-21" };
    expect(OfficialSite.safeParse({ ...base, status: "verified_via_archive" }).success).toBe(false);
    expect(OfficialSite.safeParse({ ...base, status: "verified_via_archive", fetched_via: "archive", archive_url: snap }).success).toBe(true);
  });

  it("no record in the data cites an archive host as its url", () => {
    const urls: string[] = [];
    const walk = (v: unknown, key = ""): void => {
      if (typeof v === "string" && (key === "url" || key === "source_url")) urls.push(v);
      else if (Array.isArray(v)) v.forEach((x) => walk(x));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
    };
    walk(graph);
    expect(urls.length).toBeGreaterThan(100);
    expect(urls.filter(isArchiveUrl)).toEqual([]);
  });
});
