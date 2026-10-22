/**
 * Service-index crawler (docs/SERVICE_INDEX.md). Visits the official websites in
 * data/official-sites.yaml and records the citizen-facing pages and documents it finds (forms,
 * fees, procedures, contacts, notifications) in data/service-index/. Each record links to the
 * official page, which stays the source of record; the excerpt is copied verbatim from it.
 *
 * Polite by design: obeys robots.txt (and its Crawl-delay), never sends more than one request per
 * second to a host, stays on the site's own host, reads sitemaps first, and caps depth and pages
 * per site. It identifies itself with a User-Agent that links to this repository.
 *
 *   npx tsx scripts/crawl.ts                      verified and cert_issue sites
 *   npx tsx scripts/crawl.ts --sites fbr,dgip     only these registry ids
 *   npx tsx scripts/crawl.ts --include-unreachable  also sites our checker could not load (run from Pakistan)
 *   npx tsx scripts/crawl.ts --via-archive --sites nadra,pta   read these sites from Wayback Machine snapshots
 *   options: --max-requests 120 --max-depth 3 --concurrency 10 --seeds urls.txt --seed-report out.json --dry
 *
 * Sites whose crawl fails keep the items they had, so a partial run (for example from a network
 * outside Pakistan) never deletes what an earlier run found.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { parse } from "yaml";
import { OfficialSite, ServiceIndexChunk, type ServiceItem, type ServiceKind, type SiteLevel } from "../src/schema.ts";
import {
  bareHost,
  canonicalUrl,
  classify,
  detectLanguage,
  excerptIsClean,
  extractLinks,
  HostLimiter,
  htmlText,
  linkType,
  LISTS_PEOPLE,
  looksLikeErrorPage,
  MAX_CRAWL_DELAY_MS,
  metaDescription,
  pageTitle,
  paragraphs,
  parseSitemap,
  personalDataReason,
  pickExcerpt,
  readable,
  robotsForStatus,
  scoreLink,
  tidyPdfTitle,
  USER_AGENT,
  type LinkType,
  type Robots,
} from "./crawl-lib.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
export const INDEX_DIR = join(ROOT, "data", "service-index");
const LEVELS: SiteLevel[] = ["federal", "punjab", "sindh", "kp", "balochistan", "ict", "ajk", "gb"];
/** Items per chunk file; keeps every file small enough to review and to load lazily. */
const CHUNK = 1500;

// ── HTTP ──────────────────────────────────────────────────────────────────

export interface Fetched {
  status: number;
  url: string;
  contentType: string;
  body?: Buffer;
  error?: string;
  /** Archive mode: the snapshot the bytes came from, and when it was taken. */
  archiveUrl?: string;
  archivedAt?: Date;
}

function rawGet(url: string, opts: { insecure: boolean; maxBytes: number; timeoutMs: number; accept: string }): Promise<Fetched & { location?: string }> {
  return new Promise((resolve) => {
    const u = new URL(url);
    const mod = u.protocol === "http:" ? http : https;
    let done = false;
    const finish = (r: Fetched & { location?: string }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    const req = mod.request(
      u,
      {
        method: "GET",
        headers: { "User-Agent": USER_AGENT, Accept: opts.accept, "Accept-Encoding": "gzip, deflate, br", "Accept-Language": "en, ur;q=0.8" },
        rejectUnauthorized: !opts.insecure,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return finish({ status, url, contentType, location: new URL(res.headers.location, url).toString() });
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > opts.maxBytes) {
          res.destroy();
          return finish({ status, url, contentType, error: `too large (${declared} bytes)` });
        }
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream = enc.includes("br") ? res.pipe(zlib.createBrotliDecompress()) : enc.includes("gzip") ? res.pipe(zlib.createGunzip()) : enc.includes("deflate") ? res.pipe(zlib.createInflate()) : res;
        const parts: Buffer[] = [];
        let size = 0;
        stream.on("data", (c: Buffer) => {
          size += c.length;
          if (size > opts.maxBytes) {
            req.destroy();
            finish({ status, url, contentType, error: `too large (> ${opts.maxBytes} bytes)` });
          } else parts.push(c);
        });
        stream.on("end", () => finish({ status, url, contentType, body: Buffer.concat(parts) }));
        stream.on("error", (e: Error) => finish({ status, url, contentType, error: e.message }));
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      finish({ status: 0, url, contentType: "", error: "timeout" });
    }, opts.timeoutMs);
    req.on("error", (e) => finish({ status: 0, url, contentType: "", error: (e as NodeJS.ErrnoException).code ?? e.message }));
    req.end();
  });
}

export interface SiteFetcher {
  get(url: string, kind: "robots" | "html" | "pdf" | "doc" | "sitemap"): Promise<Fetched>;
  requests: number;
}

/** A fetcher for one site: rate-limited, robots-checked, same-host redirects only, https preferred. */
export function siteFetcher(limiter: HostLimiter, home: string, insecure: boolean, delay: () => number, robots: () => Robots | undefined): SiteFetcher {
  const self: SiteFetcher = {
    requests: 0,
    async get(url, kind) {
      let current = url;
      for (let hop = 0; hop < 6; hop++) {
        const u = new URL(current);
        if (bareHost(u.hostname) !== bareHost(new URL(home).hostname)) return { status: 0, url: current, contentType: "", error: "redirects to another host" };
        const r = robots();
        if (kind !== "robots" && r && !r.allows(u.pathname + u.search)) return { status: 0, url: current, contentType: "", error: "disallowed by robots.txt" };
        await limiter.wait(bareHost(u.hostname), delay());
        self.requests++;
        const maxBytes = kind === "pdf" ? 15e6 : kind === "doc" ? 10e6 : kind === "sitemap" ? 8e6 : kind === "robots" ? 5e5 : 3e6;
        const accept = kind === "pdf" ? "application/pdf,*/*;q=0.5" : kind === "sitemap" ? "application/xml,text/xml,*/*;q=0.5" : kind === "robots" ? "text/plain,*/*;q=0.5" : "text/html,application/xhtml+xml,*/*;q=0.5";
        const res = await rawGet(current, { insecure, maxBytes, timeoutMs: kind === "pdf" || kind === "doc" ? 60_000 : 30_000, accept });
        if (!res.location) return { ...res, url: current };
        current = res.location;
      }
      return { status: 0, url: current, contentType: "", error: "too many redirects" };
    },
  };
  return self;
}

// ── archive mode ─────────────────────────────────────────────────────────
//
// Many official hosts refuse connections from outside Pakistan. In archive mode (--via-archive) a
// site is read from its Wayback Machine snapshots instead: the raw archived bytes (`id_`), never a
// live request to the site. Items still link to the official URL; the snapshot is kept alongside in
// archive_url (docs/SERVICE_INDEX.md § Archive mode). The site's own archived robots.txt is obeyed,
// and requests to the archive are spaced out (one every ARCHIVE_DELAY_MS) across all sites.

export const WAYBACK = "https://web.archive.org";
export const ARCHIVE_HOST = "web.archive.org";
export const ARCHIVE_DELAY_MS = 1500;
/** Snapshots older than this are not used: an old copy is not evidence of what the site offers now. */
export const ARCHIVE_MIN_TIMESTAMP = "20241001000000";

/** Parses a Wayback snapshot URL into its timestamp and the original URL. */
export function parseWayback(u: string): { ts: string; original: string } | undefined {
  const m = u.match(/^https?:\/\/web\.archive\.org\/web\/(\d{14})(?:[a-z]{2}_)?\/(.+)$/);
  if (!m) return undefined;
  let original = m[2];
  if (!/^https?:\/\//i.test(original)) original = original.replace(/^(https?):\/+/i, "$1://");
  return { ts: m[1], original };
}

const waybackTime = (ts: string) => new Date(`${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`);

/** The official address of an archived original: the registry's scheme (https) on the same host, without :80/:443. */
export function officialFromArchived(original: string, home: string): string | undefined {
  try {
    const o = new URL(original);
    const h = new URL(home);
    if (bareHost(o.hostname) !== bareHost(h.hostname)) return undefined;
    o.protocol = h.protocol;
    o.port = "";
    return o.toString();
  } catch {
    return undefined;
  }
}

/** A fetcher that reads a site's pages from the Wayback Machine (raw snapshots, closest to now). */
export function archiveFetcher(limiter: HostLimiter, home: string, robots: () => Robots | undefined): SiteFetcher {
  const self: SiteFetcher = {
    requests: 0,
    async get(url, kind) {
      const r = robots();
      const target = new URL(url);
      if (kind !== "robots" && r && !r.allows(target.pathname + target.search)) return { status: 0, url, contentType: "", error: "disallowed by robots.txt" };
      const now = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
      let current = `${WAYBACK}/web/${now}id_/${url}`; // the archive redirects to the snapshot closest to now
      for (let hop = 0; hop < 6; hop++) {
        await limiter.wait(ARCHIVE_HOST, ARCHIVE_DELAY_MS);
        self.requests++;
        const maxBytes = kind === "pdf" ? 15e6 : kind === "doc" ? 10e6 : kind === "sitemap" ? 8e6 : kind === "robots" ? 5e5 : 3e6;
        const res = await rawGet(current, { insecure: false, maxBytes, timeoutMs: 60_000, accept: "*/*" });
        if (res.status === 429) return { status: 0, url, contentType: "", error: "archive rate limit" };
        if (res.location) {
          const next = new URL(res.location, current).toString();
          const snap = parseWayback(next);
          if (!snap || !officialFromArchived(snap.original, home)) return { status: 0, url, contentType: "", error: "archived redirect leaves the site" };
          current = next.replace(/\/web\/(\d{14})\//, "/web/$1id_/");
          continue;
        }
        const snap = hop > 0 ? parseWayback(current) : undefined;
        if (!snap) {
          // the first request asks for the closest snapshot; the archive answers with a redirect, or
          // serves it straight away and names it in Content-Location / Link headers we do not parse
          return { status: res.status === 200 ? 0 : res.status, url, contentType: "", error: res.status === 200 ? "archive did not name the snapshot" : res.error ?? `not archived (${res.status})` };
        }
        if (snap.ts < ARCHIVE_MIN_TIMESTAMP) return { status: 404, url, contentType: "", error: `newest snapshot is from ${snap.ts.slice(0, 8)}` };
        const official = officialFromArchived(snap.original, home) ?? url;
        return { ...res, url: official, archiveUrl: `${WAYBACK}/web/${snap.ts}/${snap.original}`, archivedAt: waybackTime(snap.ts) };
      }
      return { status: 0, url, contentType: "", error: "too many redirects" };
    },
  };
  return self;
}

/** Archived pages of a host (Wayback CDX index): unique URLs with a 200 capture since ARCHIVE_MIN_TIMESTAMP. */
export async function archivedUrls(limiter: HostLimiter, home: string, limit = 3000): Promise<string[]> {
  const host = bareHost(new URL(home).hostname);
  const out = new Set<string>();
  for (const h of [host, `www.${host}`]) {
    await limiter.wait(ARCHIVE_HOST, ARCHIVE_DELAY_MS);
    const q = `${WAYBACK}/cdx/search/cdx?url=${encodeURIComponent(`${h}/*`)}&output=json&fl=original,mimetype&filter=statuscode:200&collapse=urlkey&from=${ARCHIVE_MIN_TIMESTAMP.slice(0, 8)}&limit=${limit}`;
    const r = await rawGet(q, { insecure: false, maxBytes: 2e7, timeoutMs: 120_000, accept: "application/json" });
    if (r.status !== 200 || !r.body) continue;
    try {
      const rows = JSON.parse(r.body.toString("utf8")) as string[][];
      for (const [original, mime] of rows.slice(1)) {
        if (!/html|pdf|msword|officedocument/.test(mime ?? "")) continue;
        const o = officialFromArchived(original, home);
        if (o) out.add(o);
      }
    } catch {
      // an empty or truncated index answer: fall back to links found on the pages
    }
  }
  return [...out];
}

// ── PDFs ──────────────────────────────────────────────────────────────────

async function readPdf(buf: Buffer): Promise<{ pages?: number; title?: string; text: string }> {
  const { PDFParse } = await import("pdf-parse");
  const p = new PDFParse({ data: new Uint8Array(buf) });
  const work = (async () => {
    const info = await p.getInfo().catch(() => undefined);
    const text = await p.getText({ first: 3 }).then((t) => t.text).catch(() => "");
    return { pages: info?.total || undefined, title: info?.info?.Title as string | undefined, text: text.replace(/--\s*\d+\s+of\s+\d+\s*--/g, " ") };
  })();
  const timeout = new Promise<{ text: string }>((r) => setTimeout(() => r({ text: "" }), 30_000));
  try {
    return await Promise.race([work, timeout]);
  } finally {
    p.destroy().catch(() => {});
  }
}

// ── one site ──────────────────────────────────────────────────────────────

export interface SiteResult {
  site_id: string;
  host: string;
  outcome: "crawled" | "unreachable" | "robots_disallowed" | "no_body" | "failed";
  reason?: string;
  requests: number;
  pages: number;
  pdfs: number;
  docs: number;
  items: ServiceItem[];
  seeds: { url: string; status: number; error?: string }[];
}

export interface CrawlOptions {
  maxRequests: number;
  maxDepth: number;
  maxDocs: number;
  maxItems: number;
  siteTimeoutMs: number;
  seeds: string[];
  now: () => Date;
  /** Read the site from web archive snapshots instead of the live host. */
  viaArchive?: boolean;
}

const sha = (alg: "sha1" | "sha256", data: string | Buffer) => createHash(alg).update(data).digest("hex");
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const GENERIC_ANCHOR = /^(download|click here|here|view|open|pdf|read more|more|details|link|\d+|download (pdf|form|file)|view (pdf|file))$/i;
const fileName = (u: string) => {
  try {
    return decodeURIComponent(new URL(u).pathname.split("/").pop() ?? "").replace(/\.(pdf|docx?)$/i, "").replace(/[-_+]+/g, " ").trim();
  } catch {
    return "";
  }
};

export async function crawlSite(site: OfficialSite, limiter: HostLimiter, opts: CrawlOptions): Promise<SiteResult> {
  const home = canonicalUrl(site.url)!;
  const host = bareHost(new URL(home).hostname);
  const result: SiteResult = { site_id: site.id, host, outcome: "crawled", requests: 0, pages: 0, pdfs: 0, docs: 0, items: [], seeds: [] };
  if (!site.body_id) return { ...result, outcome: "no_body", reason: "registry entry has no body_id" };
  const deadline = Date.now() + opts.siteTimeoutMs;
  let robots: Robots | undefined;
  let delayMs = 1000;
  const f = opts.viaArchive ? archiveFetcher(limiter, home, () => robots) : siteFetcher(limiter, home, site.status === "cert_issue", () => delayMs, () => robots);

  // robots.txt first, from the homepage's origin
  const origin = new URL(home).origin;
  let rb = await f.get(`${origin}/robots.txt`, "robots");
  if (!rb.status) rb = await f.get(`${origin}/robots.txt`, "robots"); // one retry: resets are often transient
  robots = rb.status ? robotsForStatus(rb.status, rb.body?.toString("utf8")) : robotsForStatus(undefined);
  if (!rb.status) {
    result.requests = f.requests;
    return { ...result, outcome: "unreachable", reason: `robots.txt: ${rb.error ?? "no response"}` };
  }
  if (robots.crawlDelayMs) delayMs = Math.min(Math.max(1000, robots.crawlDelayMs), MAX_CRAWL_DELAY_MS);
  const budget = robots.crawlDelayMs && robots.crawlDelayMs > 10_000 ? Math.min(opts.maxRequests, 25) : opts.maxRequests;
  if (!robots.allows(new URL(home).pathname)) {
    result.requests = f.requests;
    return { ...result, outcome: "robots_disallowed", reason: "robots.txt disallows the homepage" };
  }

  interface Entry {
    url: string;
    depth: number;
    anchor: string;
    score: number;
    seed?: boolean;
  }
  const queue: Entry[] = [];
  const seen = new Set<string>();
  const anchors = new Map<string, string>();
  const push = (url: string | undefined, depth: number, anchor = "", seed = false) => {
    const c = url && canonicalUrl(url);
    if (!c || seen.has(c)) return;
    try {
      if (bareHost(new URL(c).hostname) !== host) return;
    } catch {
      return;
    }
    if (!linkType(c)) return;
    if (anchor && !anchors.has(c)) anchors.set(c, anchor);
    seen.add(c);
    queue.push({ url: c, depth, anchor, score: scoreLink(c, anchor) + (seed ? 5 : 0) - depth, seed });
  };
  push(home, 0);
  for (const s of opts.seeds) push(s, 1, "", true);

  // archive mode: the archive's own index of the site's pages stands in for its sitemaps
  if (opts.viaArchive) for (const u of (await archivedUrls(limiter, home)).sort((a, b) => scoreLink(b) - scoreLink(a)).slice(0, 3000)) push(u, 1);

  // sitemaps: listed in robots.txt, else /sitemap.xml
  const maps = (robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`]).filter((m) => {
    try {
      return bareHost(new URL(m).hostname) === host;
    } catch {
      return false;
    }
  });
  const mapQueue = opts.viaArchive ? [] : maps.slice(0, 3);
  for (let i = 0; i < mapQueue.length && i < 5; i++) {
    const r = await f.get(mapQueue[i], "sitemap");
    if (r.status !== 200 || !r.body) continue;
    let xml = r.body;
    if (xml[0] === 0x1f && xml[1] === 0x8b) xml = zlib.gunzipSync(xml);
    const { urls, sitemaps } = parseSitemap(xml.toString("utf8"));
    for (const s of sitemaps.sort((a, b) => scoreLink(b) - scoreLink(a)).slice(0, 4)) if (mapQueue.length < 5) mapQueue.push(s);
    for (const u of urls.slice(0, 3000)) push(u, 1);
  }

  const byHash = new Set<string>();
  const add = (item: Omit<ServiceItem, "id" | "site_id" | "body_id">) => {
    if (!item.url.startsWith("https://")) return; // only https links are published
    if (!linkType(item.url) || !excerptIsClean(item.title)) return; // sign-in pages; titles with a phone number or CNIC
    if (result.items.some((i) => i.url === item.url)) return;
    if (byHash.has(item.content_hash) || result.items.length >= opts.maxItems) return;
    byHash.add(item.content_hash);
    result.items.push({ id: sha("sha1", item.url).slice(0, 12), site_id: site.id, body_id: site.body_id!, ...item });
  };
  let homeOk = false;

  while (queue.length && f.requests < budget && Date.now() < deadline) {
    queue.sort((a, b) => b.score - a.score || a.depth - b.depth);
    const e = queue.shift()!;
    let type: LinkType = linkType(e.url)!;
    const anchor = e.anchor || anchors.get(e.url) || "";
    if (type !== "html") {
      const { kind, citizen } = classify(e.url, "", anchor);
      if (!e.seed && (!citizen || kind === "other")) continue;
      if (result.pdfs + result.docs >= opts.maxDocs) continue;
      if (LISTS_PEOPLE.test(`${anchor} ${fileName(e.url)}`)) continue;
    }
    const r = await f.get(e.url, type);
    if (e.seed) result.seeds.push({ url: e.url, status: r.status, error: r.error });
    if (e.depth === 0 && r.status === 200) homeOk = true;
    if (r.status !== 200 || !r.body || r.error) continue;
    const finalUrl = canonicalUrl(r.url) ?? r.url;
    if (r.contentType.includes("pdf") || r.body.subarray(0, 5).toString("latin1") === "%PDF-") type = "pdf";
    else if (type === "html" && !/html|xml/.test(r.contentType) && r.contentType) continue;
    const fetched_at = iso(r.archivedAt ?? opts.now());
    const via = r.archiveUrl ? { fetched_via: "archive" as const, archive_url: r.archiveUrl } : {};
    const content_hash = sha("sha256", r.body);

    if (type === "html") {
      result.pages++;
      const html = r.body.toString("utf8");
      const title = pageTitle(html);
      const text = htmlText(html);
      if (e.depth < opts.maxDepth) for (const l of extractLinks(html, finalUrl)) push(l.url, e.depth + 1, l.text);
      if (e.depth === 0 || finalUrl.replace(/\/$/, "") === home.replace(/\/$/, "")) continue; // the homepage is already in the registry
      if (!title || looksLikeErrorPage(title, text)) continue;
      // the page's own title and address decide the kind; the link text only helps decide whether it is a service page
      const { kind, citizen: own } = classify(finalUrl, title);
      const citizen = own || classify(finalUrl, title, anchor).citizen;
      if (!citizen && !e.seed) continue;
      if (LISTS_PEOPLE.test(`${title} ${finalUrl}`) || personalDataReason(text)) continue;
      const excerpt = pickExcerpt([metaDescription(html), ...paragraphs(html)]);
      add({ url: finalUrl, title: title.slice(0, 300), kind, type, language: detectLanguage(`${title} ${excerpt ?? ""} ${text.slice(0, 3000)}`), fetched_at, http_status: r.status, content_hash, ...(excerpt ? { excerpt } : {}), ...via });
    } else if (type === "pdf") {
      result.pdfs++;
      const pdf = await readPdf(r.body).catch(() => ({ text: "", pages: undefined, title: undefined }));
      if (personalDataReason(pdf.text)) continue;
      const lines = pdf.text.split(/\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 3);
      const title = (anchor && !GENERIC_ANCHOR.test(anchor) && anchor.length >= 6 && readable(anchor) ? anchor : undefined) ?? tidyPdfTitle(pdf.title) ?? lines.find((l) => l.length >= 8 && l.length <= 140 && readable(l)) ?? fileName(finalUrl);
      if (!title || LISTS_PEOPLE.test(`${title} ${anchor}`)) continue;
      const { kind } = classify(finalUrl, title, anchor);
      const excerpt = pickExcerpt([lines.join(" ")]);
      add({ url: finalUrl, title: title.slice(0, 300), kind, type, language: detectLanguage(`${title} ${pdf.text.slice(0, 3000)}`), fetched_at, http_status: r.status, content_hash, size: r.body.length, ...(pdf.pages ? { pages: pdf.pages } : {}), ...(excerpt && excerptIsClean(excerpt) ? { excerpt } : {}), ...via });
    } else {
      result.docs++;
      const title = anchor && !GENERIC_ANCHOR.test(anchor) && anchor.length >= 4 ? anchor : fileName(finalUrl);
      if (!title) continue;
      const { kind } = classify(finalUrl, title, anchor);
      add({ url: finalUrl, title: title.slice(0, 300), kind, type: "doc", language: detectLanguage(title), fetched_at, http_status: r.status, content_hash, size: r.body.length, ...via });
    }
  }
  result.items = dropSiteBoilerplate(result.items);
  result.requests = f.requests;
  if (!homeOk && result.pages === 0) return { ...result, outcome: "unreachable", reason: "homepage did not load" };
  return result;
}

/**
 * Text that repeats across a site is its furniture, not the page: an excerpt found on three or more
 * of a site's items is dropped, and so is an item whose title and path repeat another item's.
 */
export function dropSiteBoilerplate(items: ServiceItem[]): ServiceItem[] {
  const count = new Map<string, number>();
  for (const i of items) if (i.excerpt) count.set(`${i.site_id}\n${i.excerpt}`, (count.get(`${i.site_id}\n${i.excerpt}`) ?? 0) + 1);
  const seen = new Set<string>();
  const out: ServiceItem[] = [];
  for (const i of items) {
    const key = `${i.site_id}\n${i.title}\n${new URL(i.url).pathname}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (i.excerpt && (count.get(`${i.site_id}\n${i.excerpt}`) ?? 0) >= 3) {
      const { excerpt: _drop, ...rest } = i;
      out.push(rest);
    } else out.push(i);
  }
  return out;
}

// ── index files ───────────────────────────────────────────────────────────

export function readIndex(dir = INDEX_DIR): ServiceItem[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^items-.*\.json$/.test(f))
    .flatMap((f) => ServiceIndexChunk.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))).items);
}

/** One item per line, sorted, so a re-crawl shows up as a readable diff. */
export function writeIndex(items: ServiceItem[], levelOf: (siteId: string) => SiteLevel, dir = INDEX_DIR) {
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (/^items-.*\.json$/.test(f)) unlinkSync(join(dir, f));
  for (const level of LEVELS) {
    const mine = items.filter((i) => levelOf(i.site_id) === level).sort((a, b) => a.site_id.localeCompare(b.site_id) || a.url.localeCompare(b.url));
    for (let n = 0; n * CHUNK < mine.length; n++) {
      const part = mine.slice(n * CHUNK, (n + 1) * CHUNK);
      const name = `items-${level}${mine.length > CHUNK ? `-${n + 1}` : ""}.json`;
      writeFileSync(join(dir, name), `{"schema":1,"level":${JSON.stringify(level)},"items":[\n${part.map((i) => JSON.stringify(i)).join(",\n")}\n]}\n`);
    }
  }
}

export function loadRegistry(): OfficialSite[] {
  const d = parse(readFileSync(join(ROOT, "data", "official-sites.yaml"), "utf8")) as { official_sites: unknown[] };
  return d.official_sites.map((s) => OfficialSite.parse(s));
}

// ── CLI ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const arg = (k: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const num = (k: string, d: number) => Number(arg(k) ?? d);
  const only = arg("sites")?.split(",");
  const viaArchive = args.includes("--via-archive");
  const includeUnreachable = args.includes("--include-unreachable") || viaArchive;
  const registry = loadRegistry();
  const levelOf = new Map(registry.map((s) => [s.id, s.level]));
  if (args.includes("--prune")) {
    // re-apply the current filters to the stored index, without fetching anything
    const seenUrls = new Set<string>();
    const before = readIndex();
    const tidy = (i: ServiceItem): ServiceItem => {
      let it = i;
      if (it.excerpt && !pickExcerpt([it.excerpt])) it = (({ excerpt: _x, ...rest }) => rest)(it);
      // document titles that are software names or OCR noise give way to the file name
      if (it.type !== "html" && !tidyPdfTitle(it.title)) {
        const name = fileName(it.url);
        if (name && readable(name)) it = { ...it, title: name };
      }
      // page kinds come from the page's own title and path
      if (it.type === "html") it = { ...it, kind: classify(it.url, it.title).kind };
      return it;
    };
    const after = dropSiteBoilerplate(before.filter((i) => canonicalUrl(i.url) === i.url)).map(tidy).filter((i) => {
      const ok = levelOf.has(i.site_id) && !!linkType(i.url) && excerptIsClean(i.title) && !LISTS_PEOPLE.test(i.title) && (!i.excerpt || excerptIsClean(i.excerpt)) && !seenUrls.has(i.url);
      seenUrls.add(i.url);
      return ok;
    });
    writeIndex(after, (id) => levelOf.get(id)!);
    console.log(`pruned ${before.length - after.length} of ${before.length} items`);
    return;
  }
  const freshHours = arg("skip-fresh-hours");
  const existing = readIndex();
  const fresh = new Set<string>();
  if (freshHours) {
    const cutoff = Date.now() - Number(freshHours) * 3_600_000;
    const stale = new Set(existing.filter((i) => Date.parse(i.fetched_at) < cutoff).map((i) => i.site_id));
    for (const i of existing) if (!stale.has(i.site_id)) fresh.add(i.site_id);
  }
  const targets = registry.filter((s) => (only ? only.includes(s.id) : includeUnreachable || s.status !== "unreachable_from_ci") && !fresh.has(s.id));
  if (fresh.size) console.log(`skipping ${fresh.size} sites crawled in the last ${freshHours} h`);
  const seedsFile = arg("seeds");
  const seedUrls = seedsFile ? readFileSync(seedsFile, "utf8").split(/\s+/).filter(Boolean) : [];
  const seedsFor = (s: OfficialSite) => seedUrls.filter((u) => {
    try {
      return bareHost(new URL(u).hostname) === bareHost(new URL(s.url).hostname);
    } catch {
      return false;
    }
  });
  const opts = (s: OfficialSite): CrawlOptions => ({
    maxRequests: num("max-requests", 120),
    maxDepth: num("max-depth", 3),
    maxDocs: num("max-docs", 40),
    maxItems: num("max-items", 200),
    siteTimeoutMs: num("site-minutes", 12) * 60_000,
    seeds: seedsFor(s),
    now: () => new Date(),
    viaArchive,
  });
  const limiter = new HostLimiter();
  const dry = args.includes("--dry");
  const results: SiteResult[] = [];
  let next = 0;
  const started = Date.now();
  async function worker() {
    while (next < targets.length) {
      const s = targets[next++];
      const r = await crawlSite(s, limiter, opts(s)).catch((e: Error): SiteResult => ({ site_id: s.id, host: new URL(s.url).hostname, outcome: "failed", reason: e.message, requests: 0, pages: 0, pdfs: 0, docs: 0, items: [], seeds: [] }));
      results.push(r);
      // written after every site, so an interrupted run keeps what it found
      if (!dry && r.outcome === "crawled") {
        const others = readIndex().filter((i) => i.site_id !== r.site_id && levelOf.has(i.site_id));
        writeIndex([...others, ...r.items], (id) => levelOf.get(id)!);
      }
      console.log(`[${results.length}/${targets.length}] ${r.site_id}: ${r.outcome}${r.reason ? ` (${r.reason})` : ""} · ${r.requests} req · ${r.pages} pages · ${r.pdfs} pdf · ${r.docs} doc · ${r.items.length} items`);
    }
  }
  await Promise.all(Array.from({ length: num("concurrency", 10) }, worker));

  // earlier items stay for sites that did not crawl this time (each crawled site replaced its own above)
  const crawled = new Set(results.filter((r) => r.outcome === "crawled").map((r) => r.site_id));
  const kept = existing.filter((i) => !crawled.has(i.site_id) && levelOf.has(i.site_id));
  const items = dry ? [...kept, ...results.flatMap((r) => (r.outcome === "crawled" ? r.items : []))] : readIndex().filter((i) => levelOf.has(i.site_id));
  const byUrl = new Map(items.map((i) => [i.url, i]));
  const final = [...byUrl.values()];
  const count = (k: ServiceKind) => final.filter((i) => i.kind === k).length;
  const summary = {
    sites_attempted: results.length,
    crawled: results.filter((r) => r.outcome === "crawled").length,
    unreachable: results.filter((r) => r.outcome === "unreachable").map((r) => r.site_id),
    robots_disallowed: results.filter((r) => r.outcome === "robots_disallowed").map((r) => r.site_id),
    no_body: results.filter((r) => r.outcome === "no_body").map((r) => r.site_id),
    failed: results.filter((r) => r.outcome === "failed").map((r) => `${r.site_id}: ${r.reason}`),
    requests: results.reduce((n, r) => n + r.requests, 0),
    pages: results.reduce((n, r) => n + r.pages, 0),
    pdfs: results.reduce((n, r) => n + r.pdfs, 0),
    docs: results.reduce((n, r) => n + r.docs, 0),
    items: final.length,
    kept_from_earlier_runs: kept.length,
    by_kind: Object.fromEntries((["form", "fee", "procedure", "contact", "notification", "other"] as const).map((k) => [k, count(k)])),
    by_type: { html: final.filter((i) => i.type === "html").length, pdf: final.filter((i) => i.type === "pdf").length, doc: final.filter((i) => i.type === "doc").length },
    minutes: Math.round((Date.now() - started) / 60000),
  };
  console.log(JSON.stringify(summary, null, 2));
  const report = arg("seed-report");
  if (report) writeFileSync(report, JSON.stringify(results.flatMap((r) => r.seeds.map((s) => ({ site: r.site_id, ...s }))), null, 2));
  const out = arg("summary");
  if (out) writeFileSync(out, JSON.stringify({ summary, sites: results.map(({ items, seeds, ...r }) => ({ ...r, items: items.length })) }, null, 2));
  if (dry) return;
  writeIndex(final, (id) => levelOf.get(id)!);
  console.log(`wrote ${final.length} items to data/service-index/`);
}

if (process.argv[1]?.endsWith("crawl.ts")) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
