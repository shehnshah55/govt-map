/**
 * npm run data      → validate data/ and write public/data/ (graph + exports)
 * npm run validate  → validate only; exits non-zero on any error
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "./compile.ts";
import { checkResults } from "./results-check.ts";
import { checkServiceIndex } from "./service-index-check.ts";
import { toCsvExports, toPopolo } from "./exports.ts";
import { PUBLISH, publicGraph, publishedCaseProblems } from "../src/lib/policy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

const { graph: full, errors, warnings } = compile(join(root, "data"));
// the published graph: fields hidden by the editorial policy are removed before anything is written
const graph = publicGraph(full);
if (!PUBLISH.legalCases && graph.people.some((p) => p.legal_cases)) throw new Error("policy: legal cases must not be published");
// a case marked for publishing must show its charge, outcome, the date of that outcome and a source for it
const caseGate = [...publishedCaseProblems(full), ...publishedCaseProblems(graph)];
if (caseGate.length) {
  for (const e of new Set(caseGate)) console.error(`error: policy: ${e}`);
  throw new Error("policy: a legal case marked publish: true lacks a charge, an outcome, an as-of date, a source URL or a dated, sourced, ordered timeline");
}
if (graph.people.some((p) => p.legal_cases?.some((c) => "publish" in c || "hold_reason" in c))) throw new Error("policy: internal legal-case flags must not be published");
for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\n${errors.length} error(s). Fix the data files above.`);
  process.exit(1);
}
// service index (data/service-index/): schema, hosts in the registry, bodies in the graph, no personal data
const services = checkServiceIndex(join(root, "data", "service-index"), full.official_sites, new Set(full.organizations.map((o) => o.id)));
if (services.errors.length) {
  for (const e of services.errors.slice(0, 50)) console.error(`error: service index: ${e}`);
  console.error(`\n${services.errors.length} service index error(s). Re-run the crawl or fix data/service-index/.`);
  process.exit(1);
}
console.log(`ok: service index: ${services.items.length} items in ${services.files} files, ${(services.bytes / 1048576).toFixed(2)} MB (${(services.gzipBytes / 1048576).toFixed(2)} MB gzipped)`);
// election results (data/results/) and census figures (data/census/): schema, sums, ECP totals
const results = checkResults(join(root, "data"), full);
if (results.errors.length) {
  for (const e of results.errors.slice(0, 50)) console.error(`error: results: ${e}`);
  console.error(`\n${results.errors.length} results or census error(s). Fix data/results/ or data/census/.`);
  process.exit(1);
}
if (results.results.length || results.census.length)
  console.log(`ok: results: ${results.results.map((r) => `${r.election}-${r.house} (${r.results.length})`).join(", ") || "none"}; census: ${results.census.map((c) => c.census).join(", ") || "none"}`);
const c = graph.meta.counts;
console.log(
  `ok: ${c.organizations} organizations, ${c.positions} positions, ${c.people} people, ` +
    `${c.jurisdictions} jurisdictions, ${c.laws} laws, ${c.edges} edges (${warnings.length} warnings)`,
);
if (checkOnly) process.exit(0);

const out = join(root, "public", "data");
mkdirSync(join(out, "export"), { recursive: true });
writeFileSync(join(out, "graph.json"), JSON.stringify(graph));
writeFileSync(join(out, "export", "popolo.json"), JSON.stringify(toPopolo(graph), null, 2));
for (const [name, csv] of Object.entries(toCsvExports(graph))) writeFileSync(join(out, "export", name), csv);
console.log(`wrote ${join("public", "data")}`);
