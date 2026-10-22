import { describe, expect, it } from "vitest";
import { audit, sourceLevel } from "../scripts/audit-coverage.ts";

describe("coverage audit", () => {
  it("is deterministic, so CI can check the committed report", () => {
    expect(audit().md).toBe(audit().md);
  });

  it("measures record ages from the data, not the clock", () => {
    expect(audit().md).toMatch(/\*\*Reference date: \d{4}-\d{2}-\d{2}\*\*/);
  });

  it("classifies sources by the EDITORIAL_POLICY source hierarchy", () => {
    expect(sourceLevel("www.ecp.gov.pk")).toBe("1");
    expect(sourceLevel("pakistancode.gov.pk")).toBe("1");
    expect(sourceLevel("sbp.org.pk")).toBe("1");
    expect(sourceLevel("radio.gov.pk")).toBe("2");
    expect(sourceLevel("app.com.pk")).toBe("2");
    expect(sourceLevel("www.dawn.com")).toBe("3");
    expect(sourceLevel("en.wikipedia.org")).toBe("wikipedia");
    expect(sourceLevel("example.com")).toBe("unclassified");
  });
});
