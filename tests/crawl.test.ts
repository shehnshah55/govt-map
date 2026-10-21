import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canonicalUrl,
  classify,
  detectLanguage,
  excerptIsClean,
  extractLinks,
  HostLimiter,
  MIN_DELAY_MS,
  parseRobots,
  parseSitemap,
  personalDataReason,
  pickExcerpt,
  robotsForStatus,
  tidyPdfTitle,
  USER_AGENT,
} from "../scripts/crawl-lib.ts";
import { crawlSite } from "../scripts/crawl.ts";
import type { OfficialSite } from "../src/schema.ts";

describe("robots.txt", () => {
  const txt = `
User-agent: *
Disallow: /admin
Disallow: /*.php$
Allow: /admin/public
Crawl-delay: 2
Sitemap: https://example.gov.pk/sitemap.xml

User-agent: BadBot
Disallow: /
`;
  it("applies the * group: longest match wins, allow wins a tie, wildcards and $", () => {
    const r = parseRobots(txt);
    expect(r.allows("/")).toBe(true);
    expect(r.allows("/admin/settings")).toBe(false);
    expect(r.allows("/admin/public/forms")).toBe(true);
    expect(r.allows("/index.php")).toBe(false);
    expect(r.allows("/index.php?x=1")).toBe(true);
    expect(r.crawlDelayMs).toBe(2000);
    expect(r.sitemaps).toEqual(["https://example.gov.pk/sitemap.xml"]);
  });

  it("uses a group naming our crawler over *", () => {
    const r = parseRobots("User-agent: *\nDisallow:\n\nUser-agent: govt-map-service-index\nDisallow: /", "govt-map-service-index");
    expect(r.allows("/anything")).toBe(false);
  });

  it("4xx means no rules; 5xx or no answer means stay out", () => {
    expect(robotsForStatus(404).allows("/x")).toBe(true);
    expect(robotsForStatus(503).allows("/x")).toBe(false);
    expect(robotsForStatus(undefined).allows("/")).toBe(false);
  });
});

describe("rate limit", () => {
  it("spaces requests to one host at least a second apart, and never below the minimum", async () => {
    let t = 0;
    const starts: number[] = [];
    const lim = new HostLimiter(
      () => t,
      async (ms) => {
        t += ms;
      },
    );
    for (let i = 0; i < 4; i++) {
      await lim.wait("a.gov.pk", 10); // asks for 10 ms: gets the 1 s floor
      starts.push(t);
    }
    expect(starts).toEqual([0, 1000, 2000, 3000]);
    await lim.wait("a.gov.pk", 5000);
    expect(t).toBe(4000);
    await lim.wait("a.gov.pk", 5000);
    expect(t).toBe(9000);
  });

  it("does not hold back other hosts", async () => {
    let t = 0;
    const lim = new HostLimiter(() => t, async (ms) => void (t += ms));
    await lim.wait("a.gov.pk");
    await lim.wait("b.gov.pk");
    expect(t).toBe(0);
  });

  it("queues concurrent requests to the same host", async () => {
    let t = 0;
    const lim = new HostLimiter(() => t, async (ms) => void (t += ms));
    const order: number[] = [];
    await Promise.all([0, 1, 2].map(() => lim.wait("a.gov.pk").then(() => order.push(t))));
    expect(order).toEqual([0, 1000, 2000]);
  });
});

describe("links, sitemaps and classification", () => {
  it("resolves links, drops fragments, tracking and mailto, and folds double slashes", () => {
    const links = extractLinks(`<a href="/forms/a.pdf#p2">Form A</a><a href='mailto:x@y'>m</a><a href="//dgip.gov.pk//visa/fee.php?utm_source=x">Fee</a>`, "https://dgip.gov.pk/downloads/");
    expect(links).toEqual([
      { url: "https://dgip.gov.pk/forms/a.pdf", text: "Form A" },
      { url: "https://dgip.gov.pk/visa/fee.php", text: "Fee" },
    ]);
    expect(canonicalUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("reads urlsets and sitemap indexes", () => {
    expect(parseSitemap("<urlset><url><loc> https://a.gov.pk/x </loc></url></urlset>").urls).toEqual(["https://a.gov.pk/x"]);
    expect(parseSitemap("<sitemapindex><sitemap><loc>https://a.gov.pk/s1.xml</loc></sitemap></sitemapindex>").sitemaps).toEqual(["https://a.gov.pk/s1.xml"]);
  });

  it("sorts pages into kinds", () => {
    expect(classify("https://dgip.gov.pk/visa/fee.php", "Visa Application Fee").kind).toBe("fee");
    expect(classify("https://x.gov.pk/downloads/form_a.pdf", "Form A").kind).toBe("form");
    expect(classify("https://x.gov.pk/passport/process.php", "Passport Application Process").kind).toBe("procedure");
    expect(classify("https://x.gov.pk/contact-us", "Contact Us").kind).toBe("contact");
    expect(classify("https://x.gov.pk/sro/2024-11.pdf", "SRO 1145").kind).toBe("notification");
    expect(classify("https://x.gov.pk/news/minister-visits", "Minister visits").citizen).toBe(false);
    expect(classify("https://x.gov.pk/services/domicile", "Domicile").citizen).toBe(true);
  });
});

describe("personal data screen", () => {
  it("rejects pages with a CNIC or many mobile numbers, but not official helplines", () => {
    expect(personalDataReason("Applicant 35202-1234567-1 approved")).toMatch(/CNIC/);
    expect(personalDataReason("Ali 0300-1234567, Sara 0321 7654321, Omar 03331112223, Hina +92 345 5556667")).toMatch(/mobile/);
    expect(personalDataReason("UAN 111-786-786 · helpline 1122 · 051-9201234")).toBeUndefined();
  });

  it("keeps any mobile number or personal email out of excerpts", () => {
    expect(excerptIsClean("Call 0300-1234567 for help")).toBe(false);
    expect(excerptIsClean("Write to someone@gmail.com")).toBe(false);
    expect(excerptIsClean("Call the helpline 1199 or UAN 111-112-020")).toBe(true);
  });

  it("cuts excerpts verbatim at a word boundary, at most 300 characters", () => {
    const long = `${"The passport application process has several steps. ".repeat(10)}`;
    const e = pickExcerpt([undefined, "short", long])!;
    expect(e.length).toBeLessThanOrEqual(300);
    expect(long.includes(e)).toBe(true);
    expect(pickExcerpt(["Copyright © 2024 All rights reserved by the Government of Pakistan."])).toBeUndefined();
  });

  it("detects Urdu and tidies PDF titles", () => {
    expect(detectLanguage("ڈومیسائل سرٹیفکیٹ کے لیے درخواست")).toBe("ur");
    expect(detectLanguage("Domicile certificate")).toBe("en");
    expect(tidyPdfTitle("Microsoft Word - Form A.docx")).toBe("Form A");
    expect(tidyPdfTitle("CamScanner 10-31-2024 14.10")).toBeUndefined();
  });
});

describe("crawler politeness, end to end against a local server", () => {
  let server: Server;
  const log: { path: string; at: number; ua: string }[] = [];
  let base = "";
  beforeAll(async () => {
    server = createServer((req, res) => {
      log.push({ path: req.url ?? "", at: Date.now(), ua: String(req.headers["user-agent"]) });
      if (req.url === "/robots.txt") return res.end("User-agent: *\nDisallow: /private\n");
      if (req.url === "/sitemap.xml") return res.writeHead(404).end();
      res.setHeader("content-type", "text/html");
      if (req.url === "/") return res.end(`<a href="/private/list">secret</a><a href="/forms">Forms</a><a href="https://elsewhere.gov.pk/x">off-site</a>`);
      res.end(`<title>Forms</title><p>Application forms for citizens are listed here, with fees.</p>`);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  });
  afterAll(() => server.close());

  it("reads robots.txt first, skips disallowed and off-site links, identifies itself and waits a second between requests", async () => {
    const site = { id: "local", name: "Local", url: base, level: "federal", category: "government", body_id: "fed-x", status: "verified", checked: "2026-10-21" } as OfficialSite;
    const r = await crawlSite(site, new HostLimiter(), { maxRequests: 10, maxDepth: 2, maxDocs: 5, maxItems: 10, siteTimeoutMs: 60_000, seeds: [], now: () => new Date() });
    expect(r.outcome).toBe("crawled");
    expect(log[0].path).toBe("/robots.txt");
    expect(log.map((l) => l.path)).not.toContain("/private/list");
    expect(log.map((l) => l.path)).toContain("/forms");
    expect(log.every((l) => l.ua === USER_AGENT)).toBe(true);
    for (let i = 1; i < log.length; i++) expect(log[i].at - log[i - 1].at).toBeGreaterThanOrEqual(MIN_DELAY_MS - 20);
    // http pages are fetched but never published: the index only carries https links
    expect(r.items).toEqual([]);
  }, 30_000);
});
