/**
 * Build gate for the service index (data/service-index/, docs/SERVICE_INDEX.md). Run by
 * `npm run validate` and `npm run data`: every item must match the schema, have a url, body_id,
 * fetched_at and kind, sit on the host of a registry site, and carry no personal data.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { ServiceIndexChunk, type OfficialSite, type ServiceItem } from "../src/schema.ts";
import { bareHost, dedupeKey, excerptIsClean, LISTS_PEOPLE } from "./crawl-lib.ts";

/** Shipped size budget for all chunks together, gzipped. */
export const MAX_GZIP_BYTES = 5 * 1024 * 1024;

export interface IndexCheck {
  items: ServiceItem[];
  errors: string[];
  files: number;
  bytes: number;
  gzipBytes: number;
}

export function checkServiceIndex(dir: string, sites: readonly OfficialSite[], orgIds: ReadonlySet<string>): IndexCheck {
  const out: IndexCheck = { items: [], errors: [], files: 0, bytes: 0, gzipBytes: 0 };
  if (!existsSync(dir)) return out;
  const byId = new Map(sites.map((s) => [s.id, s]));
  const hostOf = (u: string) => bareHost(new URL(u).hostname);
  const registryHosts = new Set(sites.map((s) => hostOf(s.url)));
  const seen = new Map<string, string>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    if (!/^items-[a-z]+(-\d+)?\.json$/.test(f)) {
      out.errors.push(`${f}: unexpected file in data/service-index/ (only items-<level>[-n].json)`);
      continue;
    }
    const path = join(dir, f);
    const text = readFileSync(path, "utf8");
    out.files++;
    out.bytes += statSync(path).size;
    out.gzipBytes += gzipSync(text).length;
    const parsed = ServiceIndexChunk.safeParse(JSON.parse(text));
    if (!parsed.success) {
      out.errors.push(`${f}: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      continue;
    }
    for (const it of parsed.data.items) {
      const where = `${f} ${it.id}`;
      const site = byId.get(it.site_id);
      if (!site) out.errors.push(`${where}: site_id ${it.site_id} is not in data/official-sites.yaml`);
      else {
        if (site.level !== parsed.data.level) out.errors.push(`${where}: site ${it.site_id} is ${site.level}, file is ${parsed.data.level}`);
        if (hostOf(it.url) !== hostOf(site.url)) out.errors.push(`${where}: ${it.url} is not on ${site.url}`);
        if (site.body_id !== it.body_id) out.errors.push(`${where}: body_id ${it.body_id} differs from the registry's ${site.body_id ?? "(none)"}`);
      }
      if (!registryHosts.has(hostOf(it.url))) out.errors.push(`${where}: host ${hostOf(it.url)} is not in the registry`);
      if (!orgIds.has(it.body_id)) out.errors.push(`${where}: body_id ${it.body_id} is not a body in the graph`);
      const key = dedupeKey(it.url);
      if (seen.has(key)) out.errors.push(`${where}: duplicate of ${seen.get(key)} (${it.url})`);
      seen.set(key, where);
      if (it.excerpt && !excerptIsClean(it.excerpt)) out.errors.push(`${where}: excerpt carries a CNIC, mobile number or personal email`);
      if (!excerptIsClean(it.title)) out.errors.push(`${where}: title carries a CNIC, mobile number or personal email`);
      if (LISTS_PEOPLE.test(it.title)) out.errors.push(`${where}: looks like a list of individuals ("${it.title}")`);
      out.items.push(it);
    }
  }
  if (out.gzipBytes > MAX_GZIP_BYTES) out.errors.push(`service index is ${(out.gzipBytes / 1048576).toFixed(2)} MB gzipped, over the ${MAX_GZIP_BYTES / 1048576} MB budget`);
  return out;
}
