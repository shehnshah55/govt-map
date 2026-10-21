/**
 * Weekly freshness report. It never edits data: it writes a Markdown
 * report that the scheduled workflow posts to one issue, "Records needing re-verification".
 *
 *   npx tsx scripts/staleness.ts urls  [--out link-check/urls.md]
 *       lists every source and law URL in the published graph, for the link checker
 *   npx tsx scripts/staleness.ts report [--today YYYY-MM-DD] [--links lychee.json] [--out report.md]
 *       people and legal cases not re-checked for 90 days, and broken links
 *
 * The report is public once the repository is, so it is built from publicGraph(): while legal
 * cases are unpublished it gives only a count of cases due, and their sources are not listed.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "./compile.ts";
import { PUBLISH, publicGraph } from "../src/lib/policy.ts";
import type { Graph } from "../src/schema.ts";

export const STALE_DAYS = 90;
export const ISSUE_TITLE = "Records needing re-verification";
export const MARKER = "<!-- staleness-report -->";

const day = (s: string) => Date.parse(s.length === 4 ? `${s}-01-01` : s.length === 7 ? `${s}-01` : s);
const ageDays = (date: string, today: string) => Math.floor((day(today) - day(date)) / 86_400_000);

/** Every URL in the graph, with the records that cite it. */
export function citedUrls(g: Graph): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (url: unknown, id: string) => {
    if (typeof url !== "string" || !/^https?:/.test(url)) return;
    out.set(url, (out.get(url) ?? new Set()).add(id));
  };
  const walk = (x: unknown, id: string): void => {
    if (Array.isArray(x)) return x.forEach((v) => walk(v, id));
    if (!x || typeof x !== "object") return;
    for (const [k, v] of Object.entries(x)) {
      if (k === "url" || k === "website") add(v, id);
      else walk(v, id);
    }
  };
  for (const coll of [g.organizations, g.positions, g.people, g.laws, g.jurisdictions]) for (const r of coll) walk(r, r.id);
  for (const v of g.verification) walk(v.sources, `verification: ${v.claim}`);
  for (const r of g.relatives) walk(r.sources, `relatives: ${r.from} / ${r.to}`);
  for (const c of g.election_checks) walk(c, `election check: ${c.seat}`);
  return out;
}

export interface BrokenLink {
  url: string;
  status: string;
}

/** Reads lychee's JSON output (both the older fail_map and the newer error_map shape). */
export function parseLychee(json: unknown): { broken: BrokenLink[]; total: number } {
  const j = json as { total?: number; fail_map?: Record<string, unknown[]>; error_map?: Record<string, unknown[]> };
  const entries = Object.values({ ...(j.fail_map ?? {}), ...(j.error_map ?? {}) }).flat() as { url: string; status?: { text?: string; code?: number } | string }[];
  const seen = new Map<string, BrokenLink>();
  for (const e of entries) {
    const status = typeof e.status === "string" ? e.status : [e.status?.code, e.status?.text].filter(Boolean).join(" ");
    seen.set(e.url, { url: e.url, status: status || "failed" });
  }
  return { broken: [...seen.values()].sort((a, b) => a.url.localeCompare(b.url)), total: j.total ?? seen.size };
}

/** lychee adds a trailing slash to bare domains; compare URLs without it. */
const norm = (u: string) => u.replace(/\/+$/, "");
/** When most links fail at once, the runner's network is the likely cause, not the links. */
export const OUTAGE_SHARE = 0.5;

export function report(full: Graph, today: string, links: { broken: BrokenLink[]; total: number } = { broken: [], total: 0 }): { markdown: string; counts: Record<string, number> } {
  const { broken, total } = links;
  const outage = total > 0 && broken.length / total > OUTAGE_SHARE;
  const g = publicGraph(full);
  const stalePeople = g.people
    .filter((p) => p.roles.some((r) => !r.until) && ageDays(p.as_of, today) > STALE_DAYS)
    .sort((a, b) => a.as_of.localeCompare(b.as_of) || a.id.localeCompare(b.id));
  // legal cases have no check date of their own: they are due when their person's record is
  const casesDue = full.people.filter((p) => p.legal_cases?.length && ageDays(p.as_of, today) > STALE_DAYS).reduce((n, p) => n + p.legal_cases!.length, 0);
  const urls = new Map([...citedUrls(g)].map(([u, ids]) => [norm(u), ids]));
  const cell = (t: string) => t.replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 90);
  const lines = [
    MARKER,
    `Generated ${today} by the weekly freshness workflow (\`scripts/staleness.ts\`). It lists records to re-check; it never changes data. Fix records in a pull request with a fresh source, and this issue updates itself next week.`,
    "",
    `## Officeholders not re-checked for more than ${STALE_DAYS} days (${stalePeople.length})`,
    "",
    ...(stalePeople.length
      ? ["| Person | Record checked | Days | File |", "|---|---|---:|---|", ...stalePeople.map((p) => `| ${p.name} (\`${p.id}\`) | ${p.as_of} | ${ageDays(p.as_of, today)} | \`${p._file}\` |`)]
      : ["None."]),
    "",
    `## Legal cases due for re-check (${casesDue})`,
    "",
    PUBLISH.legalCases
      ? casesDue
        ? "See the people above with legal cases: each case's current status must be re-checked against the court record."
        : "None."
      : `${casesDue} case records belong to people not re-checked for ${STALE_DAYS} days. Legal cases are not published at present, so they are not listed here; check them in \`data/people.yaml\`.`,
    "",
    `## Broken links (${outage ? "check did not complete" : broken.length})`,
    "",
    ...(outage
      ? [`${broken.length} of ${total} links failed at once, which points to a network problem on the runner rather than broken links. Nothing is listed this week; re-run the workflow to check again.`]
      : broken.length
      ? [
          "Reported, not fixed automatically. Some government sites block automated checks, so confirm each one by hand before replacing it.",
          "",
          "| URL | Result | Cited by |",
          "|---|---|---|",
          ...broken.map((b) => `| ${cell(b.url)} | ${cell(b.status)} | ${[...(urls.get(norm(b.url)) ?? [])].slice(0, 5).map((id) => `\`${cell(id)}\``).join(", ")} |`),
        ]
      : ["None found, or the link check did not run."]),
    "",
  ];
  return { markdown: lines.join("\n"), counts: { stalePeople: stalePeople.length, casesDue, broken: outage ? -1 : broken.length } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { graph, errors } = compile(join(root, "data"));
  if (errors.length) throw new Error(`data does not compile:\n${errors.join("\n")}`);
  const write = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  if (process.argv[2] === "urls") {
    const out = arg("out") ?? "link-check/urls.md";
    const urls = [...citedUrls(publicGraph(graph)).keys()].sort();
    write(out, urls.map((u) => `- <${u}>`).join("\n") + "\n");
    console.log(`wrote ${urls.length} URLs to ${out}`);
  } else if (process.argv[2] === "report") {
    const links = arg("links");
    let broken: { broken: BrokenLink[]; total: number } | undefined;
    try {
      if (links) broken = parseLychee(JSON.parse(readFileSync(links, "utf8")));
    } catch (e) {
      console.warn(`could not read link results from ${links}: ${(e as Error).message}`);
    }
    const { markdown, counts } = report(graph, arg("today") ?? new Date().toISOString().slice(0, 10), broken);
    write(arg("out") ?? "staleness-report.md", markdown);
    console.log(JSON.stringify(counts));
  } else {
    console.error("usage: staleness.ts urls|report [options]");
    process.exit(2);
  }
}
