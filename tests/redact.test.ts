import { describe, expect, it } from "vitest";
import { PATTERNS, redact, redactPath } from "../src/lib/redact.ts";

const clean = (s: string) => redact(s).text;

describe("redact", () => {
  it("removes CNIC numbers, with or without dashes, in ASCII or Urdu digits", () => {
    expect(clean("renew 35202-1234567-1 please")).toBe("renew [CNIC removed] please");
    expect(clean("3520212345671")).toBe("[CNIC removed]");
    expect(clean("35202 1234567 1")).toBe("[CNIC removed]");
    expect(clean("۳۵۲۰۲-۱۲۳۴۵۶۷-۱ کی تجدید")).toBe("[CNIC removed] کی تجدید");
    expect(clean("35202\u20131234567\u20131")).toBe("[CNIC removed]");
    expect(redact("35202-1234567-1").removed).toEqual(["CNIC"]);
  });

  it("removes mobile and landline numbers", () => {
    expect(clean("call 0300-1234567")).toBe("call [phone number removed]");
    expect(clean("call 03001234567")).toBe("call [phone number removed]");
    expect(clean("+92 300 1234567")).toBe("[phone number removed]");
    expect(clean("0092-300-1234567")).toBe("[phone number removed]");
    expect(clean("office 042-35761234")).toBe("office [phone number removed]");
    expect(clean("051 9201234")).toBe("[phone number removed]");
  });

  it("removes any other run of ten or more digits", () => {
    expect(clean("account 1234567890123456")).toBe("account [number removed]");
  });

  it("removes passport numbers and email addresses", () => {
    expect(clean("passport AB1234567 lost")).toBe("passport [passport number removed] lost");
    expect(clean("ab-1234567")).toBe("[passport number removed]");
    expect(clean("write to ali.khan+x@mail.example.pk today")).toBe("write to [email removed] today");
  });

  it("keeps ordinary questions, years, seat numbers and short numbers", () => {
    for (const q of ["Who appoints the Chief Justice of Pakistan?", "NA-122 result", "18th Amendment 2010", "laws 1973 2010 2018", "fee 1500 rupees", "Form 47", "شناختی کارڈ کیسے بنوائیں"])
      expect(clean(q)).toBe(q.normalize("NFKC"));
  });

  it("each pattern takes linear time, even on input far longer than the boxes accept", () => {
    const time = (s: string) => {
      const t = performance.now();
      for (const re of Object.values(PATTERNS)) s.replace(re, "x");
      return performance.now() - t;
    };
    for (const unit of ["1-", "a", "a@b", ".c", "ab", "1  "]) {
      const small = time(unit.repeat(20_000));
      const big = time(unit.repeat(200_000));
      // ten times the text: a quadratic pattern would take about a hundred times as long
      expect(big).toBeLessThan(Math.max(small, 1) * 30 + 50);
    }
  });

  it("takes little time on hostile input", () => {
    for (const evil of ["1-".repeat(50_000), "a".repeat(100_000) + "@", "a@" + "b".repeat(100_000), "1 ".repeat(50_000) + "x", "ab".repeat(50_000) + "1234567"]) {
      const t = performance.now();
      redact(evil);
      expect(performance.now() - t).toBeLessThan(200);
    }
  });
});

describe("redactPath", () => {
  it("rewrites only the q value, and only when something was removed", () => {
    expect(redactPath("/find?q=renew%2035202-1234567-1")).toBe("/find?q=renew%20%5BCNIC%20removed%5D");
    expect(redactPath("/search?q=0300%201234567")).toBe("/search?q=%5Bphone%20number%20removed%5D");
    expect(redactPath("/find?q=passport%20fee")).toBe("/find?q=passport%20fee");
    expect(redactPath("/person/nawaz-sharif")).toBe("/person/nawaz-sharif");
  });
});
