import { describe, expect, it } from "vitest";
import { concepts, ServiceIndex } from "../src/lib/service-search.ts";
import type { ServiceItem } from "../src/schema.ts";

let n = 0;
const item = (title: string, kind: ServiceItem["kind"], url: string, excerpt?: string): ServiceItem => ({
  id: (++n).toString(16).padStart(12, "0"),
  url,
  title,
  site_id: "x",
  body_id: "fed-x",
  kind,
  type: url.endsWith(".pdf") ? "pdf" : "html",
  language: "en",
  fetched_at: "2026-10-21T00:00:00Z",
  http_status: 200,
  content_hash: "0".repeat(64),
  ...(excerpt ? { excerpt } : {}),
});

const items = [
  item("Passport Fee Schedule", "fee", "https://dgip.gov.pk/passport/fee.php", "Fee for a normal passport of 36 pages."),
  item("Passport Application Process", "procedure", "https://dgip.gov.pk/passport/process.php", "How to apply for a passport. The fee is paid at the bank."),
  item("Visa Application Fee", "fee", "https://dgip.gov.pk/visa/fee.php"),
  item("Domicile Certificate", "procedure", "https://ictadministration.gov.pk/services/domicile", "Requirements for a domicile certificate in Islamabad."),
  item("ڈومیسائل سرٹیفکیٹ فارم", "form", "https://punjab.gov.pk/domicile-form.pdf"),
  item("NTN Registration", "procedure", "https://fbr.gov.pk/ntn-registration", "Register for a National Tax Number with the FBR."),
  item("Contact Us", "contact", "https://nadra.gov.pk/contact", "NADRA helpline for CNIC queries."),
];
const ix = new ServiceIndex(items, (it) => (it.url.includes("fbr") ? "Federal Board of Revenue FBR" : ""));
const titles = (q: string) => ix.search(q).map((h) => h.item.title);

describe("service search: ranking basics", () => {
  it("puts the fee table first for 'passport fee', ahead of a page that only mentions fees", () => {
    const t = titles("passport fee");
    expect(t[0]).toBe("Passport Fee Schedule");
    expect(t).toContain("Passport Application Process");
    expect(t).not.toContain("Visa Application Fee"); // a fee, but not for a passport
  });

  it("matches across English, Urdu and Roman Urdu spellings of domicile", () => {
    for (const q of ["domicile", "domicile certificate", "ڈومیسائل", "dumisail kaise banwaye"]) {
      const t = titles(q);
      expect(t, q).toContain("Domicile Certificate");
      expect(t, q).toContain("ڈومیسائل سرٹیفکیٹ فارم");
    }
  });

  it("treats shanakhti card and CNIC as one thing", () => {
    expect(titles("shanakhti card helpline")[0]).toBe("Contact Us");
    expect(titles("CNIC")).toEqual(["Contact Us"]);
  });

  it("uses department names: 'FBR NTN' finds the NTN page", () => {
    expect(titles("FBR NTN")[0]).toBe("NTN Registration");
  });

  it("a kind word alone lists that kind; nothing matched means no results", () => {
    expect(titles("fees").slice(0, 2).sort()).toEqual(["Passport Fee Schedule", "Visa Application Fee"].sort());
    expect(titles("helicopter licence")).toEqual([]);
    expect(titles("")).toEqual([]);
  });

  it("splits queries into synonym concepts", () => {
    expect(concepts("passport fee").length).toBe(2);
    expect(concepts("fee fees").length).toBe(1);
    expect(concepts("shanakhti card").length).toBe(1);
  });
});
