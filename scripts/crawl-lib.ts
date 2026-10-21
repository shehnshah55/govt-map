/**
 * Pure helpers for the service-index crawler (scripts/crawl.ts): robots.txt, per-host rate
 * limiting, sitemap and link extraction, page classification and the personal-data screen.
 * No network and no file access here, so all of it is unit-tested (tests/crawl.test.ts).
 */
import type { ServiceKind } from "../src/schema.ts";

export const USER_AGENT_TOKEN = "govt-map-service-index";
export const USER_AGENT = `${USER_AGENT_TOKEN}/1.0 (+https://github.com/shehnshah55/govt-map; public-interest index of official government pages; polite: robots.txt, 1 request/s per host)`;
/** Never faster than one request per second to any one host, whatever robots.txt says. */
export const MIN_DELAY_MS = 1000;
/** A Crawl-delay above this is honoured, but the site gets a smaller page budget (see crawl.ts). */
export const MAX_CRAWL_DELAY_MS = 30_000;

// ── robots.txt (RFC 9309) ─────────────────────────────────────────────────

interface Rule {
  allow: boolean;
  pattern: string;
}
export interface Robots {
  /** True when our user agent may fetch this path (with query string). */
  allows(pathAndQuery: string): boolean;
  /** Crawl-delay for our group, in ms, if the file sets one. */
  crawlDelayMs?: number;
  sitemaps: string[];
}

function patternToRegex(p: string): RegExp {
  const anchored = p.endsWith("$");
  const body = (anchored ? p.slice(0, -1) : p)
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** Parses robots.txt for our user agent: the most specific matching group, else `*`. */
export function parseRobots(txt: string, uaToken = USER_AGENT_TOKEN): Robots {
  const groups: { agents: string[]; rules: Rule[]; delay?: number }[] = [];
  const sitemaps: string[] = [];
  let current: (typeof groups)[number] | undefined;
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
    } else if (!current) {
      continue;
    } else if (key === "allow" || key === "disallow") {
      if (value) current.rules.push({ allow: key === "allow", pattern: value });
    } else if (key === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.delay = n * 1000;
    }
  }
  const token = uaToken.toLowerCase();
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules).map((r) => ({ ...r, re: patternToRegex(r.pattern) }));
  const delays = chosen.map((g) => g.delay).filter((d): d is number => d !== undefined);
  return {
    sitemaps,
    crawlDelayMs: delays.length ? Math.max(...delays) : undefined,
    allows(path: string) {
      let best: { allow: boolean; len: number } | undefined;
      for (const r of rules) {
        if (!r.re.test(path)) continue;
        const len = r.pattern.length;
        // longest match wins; on a tie, allow wins (RFC 9309 §2.2.2)
        if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
      }
      return best ? best.allow : true;
    },
  };
}

/** robots.txt for a host that could not be read: 4xx means no rules, anything else means stay out (RFC 9309 §2.3.1). */
export function robotsForStatus(status: number | undefined, body = ""): Robots {
  if (status !== undefined && status >= 200 && status < 300) return parseRobots(body);
  if (status !== undefined && status >= 400 && status < 500) return parseRobots("");
  return { sitemaps: [], allows: () => false };
}

// ── rate limit ────────────────────────────────────────────────────────────

/** Spaces requests to the same host at least `delayMs` apart (start to start), one at a time. */
export class HostLimiter {
  private next = new Map<string, number>();
  private chain = new Map<string, Promise<void>>();
  constructor(
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Resolves when a request to `host` may start. */
  wait(host: string, delayMs = MIN_DELAY_MS): Promise<void> {
    const gap = Math.max(MIN_DELAY_MS, delayMs);
    const prev = this.chain.get(host) ?? Promise.resolve();
    const turn = prev.then(async () => {
      const at = this.next.get(host) ?? 0;
      const t = this.now();
      if (at > t) await this.sleep(at - t);
      this.next.set(host, Math.max(at, t) + gap);
    });
    this.chain.set(host, turn);
    return turn;
  }
}

// ── URLs ──────────────────────────────────────────────────────────────────

export const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** Same site: the same host, ignoring a leading www. */
export function sameHost(a: string, b: string): boolean {
  try {
    return bareHost(new URL(a).hostname) === bareHost(new URL(b).hostname);
  } catch {
    return false;
  }
}

const TRACKING = /^(utm_|fbclid$|gclid$|_ga$|sessionid$|phpsessid$|jsessionid$)/i;
/** Pagination and sorting: the first page stands for the list. */
const PAGING = /(^|_)(page|pg|paged|sort|order|orderby|start|limit|offset|per_page|limitstart)$/i;
/** Canonical form used for de-duplication: no fragment, no tracking parameters, no default port. */
export function canonicalUrl(u: string): string | undefined {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    url.hash = "";
    for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k) || PAGING.test(k)) url.searchParams.delete(k);
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    return url.toString();
  } catch {
    return undefined;
  }
}

const SKIP_EXT = /\.(jpe?g|png|gif|webp|svg|ico|bmp|tiff?|mp[34]|m4a|wav|avi|mov|wmv|flv|webm|zip|rar|7z|gz|tar|exe|apk|msi|dmg|iso|css|js|json|xml|rss|atom|woff2?|ttf|eot|xlsx?|pptx?|csv)$/i;
const SKIP_PATH = /\/(wp-admin|wp-login|wp-json|login|signin|sign-in|register|cart|checkout|logout|feed|search|cgi-bin|gallery|photo|video|media-gallery|tag|author|calendar|print)(\/|$|\?)/i;
/** Sign-in and account pages, wherever they sit in the URL (Joomla's com_users, ASP.NET ReturnUrl …). */
const LOGIN = /(log-?in|sign-?in|com_users|returnurl=|redirect_to=|wp-login|auth(enticate)?\.aspx|account\/|session)/i;
export type LinkType = "html" | "pdf" | "doc";
export function linkType(u: string): LinkType | undefined {
  const path = (() => {
    try {
      return new URL(u).pathname;
    } catch {
      return "";
    }
  })();
  if (/\.pdf$/i.test(path)) return "pdf";
  if (/\.docx?$/i.test(path)) return "doc";
  if (SKIP_EXT.test(path)) return undefined;
  if (SKIP_PATH.test(path)) return undefined;
  if (LOGIN.test(u)) return undefined;
  if (/^(mailto|tel|javascript|whatsapp):/i.test(u)) return undefined;
  return "html";
}

// ── HTML ──────────────────────────────────────────────────────────────────

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", copy: "©", reg: "®", bull: "•", middot: "·", raquo: "»", laquo: "«" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const clean = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/** Drops scripts, styles, comments and page furniture (nav, header, footer, menus). */
export function stripChrome(html: string): string {
  let h = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of ["script", "style", "noscript", "svg", "template", "iframe", "nav", "header", "footer", "aside", "form", "select"]) h = h.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, "gi"), " ");
  const main = h.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? h.match(/<article\b[\s\S]*?<\/article>/i)?.[0];
  return main ?? h;
}

export function pageTitle(html: string): string | undefined {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = t ? clean(t) : "";
  const heading = h1 ? clean(h1) : "";
  // a page-specific <h1> beats a site-wide <title> that is only the site name
  if (heading && heading.length >= 4 && heading.length <= 160 && (!title || !title.toLowerCase().includes(heading.toLowerCase()))) {
    return title && title.length < 80 ? `${heading} | ${title}` : heading;
  }
  return title || heading || undefined;
}

export function metaDescription(html: string): string | undefined {
  const m = html.match(/<meta\b[^>]*name=["']description["'][^>]*>/i)?.[0] ?? html.match(/<meta\b[^>]*property=["']og:description["'][^>]*>/i)?.[0];
  const c = m?.match(/content=["']([^"']*)["']/i)?.[1];
  return c ? clean(c) : undefined;
}

/** Visible text of the main content. */
export function htmlText(html: string): string {
  return clean(stripChrome(html).replace(/<\/(p|div|li|h[1-6]|tr|td|br)>/gi, "\n"));
}

export interface Link {
  url: string;
  text: string;
}
export function extractLinks(html: string, base: string): Link[] {
  const baseHref = html.match(/<base\b[^>]*href=["']([^"']+)["']/i)?.[1];
  let b = base;
  try {
    if (baseHref) b = new URL(baseHref, base).toString();
  } catch {
    /* keep page URL */
  }
  const out: Link[] = [];
  const h = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script\b[\s\S]*?<\/script>/gi, " ");
  for (const m of h.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const raw = decodeEntities((href?.[1] ?? href?.[2] ?? href?.[3] ?? "").trim());
    if (!raw || raw.startsWith("#") || /^(mailto|tel|javascript|whatsapp|data):/i.test(raw)) continue;
    try {
      const url = canonicalUrl(new URL(raw, b).toString());
      const title = m[1].match(/title\s*=\s*["']([^"']*)["']/i)?.[1];
      if (url) out.push({ url, text: clean(m[2]) || (title ? clean(title) : "") });
    } catch {
      /* bad href */
    }
  }
  return out;
}

export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const locs = (tag: string) => [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<loc>\\s*([^<\\s]+)\\s*</loc>`, "gi"))].map((m) => decodeEntities(m[1]));
  return { urls: locs("url"), sitemaps: locs("sitemap") };
}

// ── classification ────────────────────────────────────────────────────────

const KIND_RULES: [ServiceKind, RegExp][] = [
  ["fee", /\b(fees?|charges|tariffs?|rates? (list|of)|schedule of (fees|charges|rates)|fee structure|price list)\b|فیس|نرخ|محصول/i],
  ["form", /\b(forms?|proforma|performa|application format|downloadable)\b|فارم/i],
  ["contact", /\b(contact[- ]?us|contacts?|helplines?|complaints?|grievances?|uan|toll[- ]free|call cent(er|re)|office locations?|our offices|reach us|feedback)\b|رابطہ|شکایت|ہیلپ لائن/i],
  ["procedure", /\b(procedures?|process(es)?|how[- ]to|eligibility|requirements?|required documents|documents required|criteria|guidelines?|steps|sops?|instructions|faqs?|frequently asked|registration|renewal|apply|application process|check ?list)\b|طریق|اہلیت|ضروری دستاویزات/i],
  ["notification", /\b(notifications?|notified|circulars?|s\.?r\.?o\.?s?|gazette|public notice|notices?|office orders?|ordinance)\b|اعلامیہ|نوٹیفکیشن|اطلاع/i],
];
/** Citizen services that are worth listing even when no kind word matches. */
const SERVICE_HINT = /\b(services?|e-?services|online|downloads?|citizens?|public|licen[cs]es?|certificates?|domicile|noc|permits?|registration|passport|cnic|identity|tax|ntn|scholarships?|admissions?|pension|vehicles?|driving|birth|death|marriage|nikah|fard|land|property|electricity|water|gas|bill|e-?stamp|verification|tracking|status|apply|benefits?|relief|subsid(y|ies)|zakat|welfare|complaint)\b|خدمات|ڈومیسائل|لائسنس|سرٹیفکیٹ|شناختی|پاسپورٹ/i;
/** Pages people do not come to for a service. */
const NOT_SERVICE = /\b(news|press[- ]releases?|events?|gallery|photos?|videos?|blogs?|speeches|tenders?|procurement|bids?|eoi|auction|vacanc(y|ies)|careers?|jobs?|annual reports?|newsletters?|media|messages? (of|from)|biography|profile|history|vision|mission|organogram|achievements?|sitemap|privacy|disclaimer|copyright|terms)\b/i;

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function classify(url: string, title = "", anchor = ""): { kind: ServiceKind; citizen: boolean } {
  let path = "";
  try {
    const u = new URL(url);
    path = safeDecode(u.pathname).replace(/[-_/.+=&?]+/g, " ");
  } catch {
    path = url;
  }
  const hay = `${title} ${anchor} ${path}`;
  for (const [kind, re] of KIND_RULES) if (re.test(hay)) return { kind, citizen: !NOT_SERVICE.test(`${title} ${anchor}`) || kind === "fee" || kind === "form" };
  return { kind: "other", citizen: SERVICE_HINT.test(hay) && !NOT_SERVICE.test(hay) };
}

/** Crawl order: likely service pages first. Higher is sooner. */
export function scoreLink(url: string, text = ""): number {
  const { kind, citizen } = classify(url, "", text);
  let s = citizen ? (kind === "other" ? 3 : 6) : 0;
  if (linkType(url) === "pdf" || linkType(url) === "doc") s += citizen ? 2 : -2;
  if (NOT_SERVICE.test(`${text} ${url}`)) s -= 4;
  if (/\/(\d{4})\/(\d{2})\//.test(url)) s -= 1; // dated archive pages
  return s;
}

// ── personal data ─────────────────────────────────────────────────────────

/** A 13-digit CNIC, written 12345-1234567-1 or as 13 digits next to the word CNIC. */
const CNIC = /\b\d{5}-\d{7}-\d\b|\b(cnic|nic|شناختی)\b[^\d]{0,20}\d{13}\b/i;
const MOBILE = /(?:\+92|0092|\b0)[\s-]?3\d{2}[\s-]?\d{7}\b/g;
const PERSONAL_EMAIL = /\b[\w.+-]+@(gmail|yahoo|hotmail|outlook|live|ymail|icloud)\.[a-z.]+\b/gi;
/** Pages that list individuals (merit lists, results, seniority lists): never indexed. */
export const LISTS_PEOPLE = /\b(merit[- ]?lists?|results?|shortlist(ed)?|short[- ]listed|candidates?|roll[- ]?n(o|umbers?)|selected|selection lists?|award lists?|waiting lists?|seniority lists?|employees? lists?|list of (employees|officers|students|beneficiar)|beneficiar(y|ies) lists?|transfers?[- ]postings?|postings?|interview schedule|admit cards?|answer keys?|defaulters?)\b/i;

/** Why a page must not be indexed, or undefined when it is fine. */
export function personalDataReason(text: string): string | undefined {
  if (CNIC.test(text)) return "lists a CNIC";
  const mobiles = new Set([...text.matchAll(MOBILE)].map((m) => m[0].replace(/\D/g, "").slice(-10)));
  if (mobiles.size > 3) return `lists ${mobiles.size} mobile numbers`;
  const emails = new Set([...text.matchAll(PERSONAL_EMAIL)].map((m) => m[0].toLowerCase()));
  if (emails.size > 3) return `lists ${emails.size} personal email addresses`;
  return undefined;
}

/** A short snippet is shown publicly, so it may not carry any phone number or personal address at all. */
export function excerptIsClean(s: string): boolean {
  return !CNIC.test(s) && !new RegExp(MOBILE.source).test(s) && !new RegExp(PERSONAL_EMAIL.source, "i").test(s);
}

// ── text ──────────────────────────────────────────────────────────────────

/** "ur" when most letters are Arabic-script, "mixed" when a fair share are, else "en". */
export function detectLanguage(text: string): "en" | "ur" | "mixed" {
  const arabic = (text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const total = arabic + latin;
  if (!total) return "en";
  const share = arabic / total;
  return share > 0.6 ? "ur" : share > 0.15 ? "mixed" : "en";
}

const BOILERPLATE = /(copyright|all rights reserved|©|cookies?|javascript|skip to (main )?content|lorem ipsum|designed (and|&) developed|powered by|click here|read more|not available right now|coming soon|under construction|»|https?:\/\/|www\.)/i;

/** Text that reads as words: not OCR noise or a run of codes. */
export function readable(s: string): boolean {
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return /^[\p{L}][\p{L}\p{N} ,.'’()&:/-]*$/u.test(s.trim());
  const wordy = tokens.filter((t) => /^[\p{L}][\p{L}'’.,:;()-]*$/u.test(t) && (/[aeiouy]/i.test(t) || /[\u0600-\u06FF]/.test(t))).length;
  return wordy / tokens.length >= 0.6 && !/[\]\[{}|$@#%^*_=<>~]{2,}/.test(s);
}
/**
 * A verbatim excerpt of at most `max` characters, cut at a word boundary: the meta description if
 * it says something, else the first substantial paragraph. Undefined when none is clean.
 */
export function pickExcerpt(candidates: (string | undefined)[], max = 300): string | undefined {
  for (const c of candidates) {
    const s = c?.replace(/\s+/g, " ").trim();
    if (!s || s.length < 40 || BOILERPLATE.test(s) || !excerptIsClean(s) || !readable(s)) continue;
    if (s.length <= max) return s;
    const cut = s.slice(0, max);
    const sp = cut.lastIndexOf(" ");
    return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–—-]+$/, "");
  }
  return undefined;
}

/** Paragraph-sized blocks of visible text, longest-first is not wanted: document order. */
export function paragraphs(html: string): string[] {
  const main = stripChrome(html);
  const blocks = (tag: string) =>
    [...main.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))]
      .map((m) => {
        const text = clean(m[1]);
        const linked = [...m[1].matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].reduce((n, a) => n + clean(a[1]).length, 0);
        return { text, linkShare: text.length ? linked / text.length : 1 };
      })
      // menus and link lists are not a description of the page
      .filter((b) => b.text.length >= 60 && b.text.length <= 2000 && b.linkShare < 0.3 && /[.:;،۔]/.test(b.text))
      .map((b) => b.text);
  return [...blocks("p"), ...blocks("li"), ...blocks("td")];
}

/** Soft error pages: a 200 that says "not found" or "access denied". */
export function looksLikeErrorPage(title: string | undefined, text: string): boolean {
  return /\b(404|page not found|not found|access denied|forbidden|error|under construction|coming soon|maintenance)\b/i.test(title ?? "") || (text.length < 200 && /not found|access denied/i.test(text));
}

/** PDF metadata titles are often the source file name: "Microsoft Word - Form A.docx" → "Form A". */
export function tidyPdfTitle(t: string | undefined): string | undefined {
  const s = t?.replace(/^microsoft (word|excel|powerpoint) - /i, "").replace(/\.(docx?|xlsx?|pptx?|pdf)$/i, "").replace(/\s+/g, " ").trim();
  if (!s || s.length < 4 || /^(untitled|document\d*|title|slide \d+|\d+|[a-f0-9-]{16,})$/i.test(s) || /^(camscanner|scanned|scan|img|image|doc|new doc|microsoft word|adobe|kodak|hp |canon|epson|home|add noting|print|output|default|layout|template|book\d*|presentation\d*)\b/i.test(s) || !readable(s) || /^\S+\.(docx?|pdf|tmp)$/i.test(s)) return undefined;
  return s;
}
