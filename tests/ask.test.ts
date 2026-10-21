import { describe, expect, it } from "vitest";
import { compile } from "../scripts/compile.ts";
import { foldRoman, keyTerms, normalise, rankRecords, rankSites } from "../src/lib/ask.ts";
import { GraphIndex } from "../src/lib/graph-index.ts";

const { graph } = compile(new URL("../data", import.meta.url).pathname);
const ix = new GraphIndex(graph);
const top = (q: string) => rankSites(graph.official_sites, q, ix).map((h) => new URL(h.site.url).hostname.replace(/^www\./, ""));

describe("text normalisation", () => {
  it("folds Arabic letter forms to Urdu ones and drops diacritics and joiners", () => {
    expect(normalise("كيا")).toBe(normalise("کیا"));
    expect(normalise("شناختی\u200C کارڈ")).toBe("شناختی کارڈ");
    expect(normalise("پاسپورٹ؟")).toBe("پاسپورٹ");
  });

  it("folds Roman Urdu spellings to one key", () => {
    expect(foldRoman("tareeqa")).toBe(foldRoman("tariqa"));
    expect(foldRoman("shanakhti")).toBe(foldRoman("shnakhti"));
    expect(foldRoman("pasport")).toBe(foldRoman("passport"));
  });

  it("drops question words in all three languages", () => {
    expect(keyTerms("How do I renew my CNIC?")).toEqual(keyTerms("renew CNIC"));
    expect(keyTerms("NICOP banwane ka tareeqa kya hai?")).toEqual(keyTerms("NICOP"));
    expect(keyTerms("پاسپورٹ کی فیس کیا ہے؟")).toEqual(keyTerms("پاسپورٹ فیس"));
  });
});

describe("ask: official websites for a question", () => {
  it("finds NADRA for identity cards in English, Roman Urdu and Urdu", () => {
    expect(top("How do I renew my CNIC?")[0]).toBe("nadra.gov.pk");
    expect(top("shanakhti card banwane ka tareeqa")[0]).toBe("nadra.gov.pk");
    expect(top("شناختی کارڈ")[0]).toBe("nadra.gov.pk");
    expect(top("NICOP banwane ka tareeqa kya hai?")[0]).toBe("nadra.gov.pk");
  });

  it("finds the passport office, FBR and BISP", () => {
    expect(top("Passport fee for 10 years")[0]).toBe("dgip.gov.pk");
    expect(top("پاسپورٹ کی فیس کتنی ہے؟")[0]).toBe("dgip.gov.pk");
    expect(top("How do I become a tax filer (NTN)?")[0]).toBe("fbr.gov.pk");
    expect(top("Am I eligible for BISP Kafaalat?").slice(0, 2)).toContain("bisp.gov.pk");
  });

  it("finds the PTA device check for a blocked phone", () => {
    expect(top("My phone is blocked, how do I register it with PTA?").slice(0, 2)).toContain("dirbs.pta.gov.pk");
  });

  it("returns nothing for an empty or stop-word-only question", () => {
    expect(rankSites(graph.official_sites, "", ix)).toEqual([]);
    expect(rankSites(graph.official_sites, "kya hai?", ix)).toEqual([]);
  });

  it("falls back to single words for graph records", () => {
    expect(rankRecords(ix, "Punjab Police").some((r) => r.id === "pb-police")).toBe(true);
    expect(rankRecords(ix, "who runs the Punjab Police").length).toBeGreaterThan(0);
  });
});
