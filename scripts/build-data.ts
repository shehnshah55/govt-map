/**
 * npm run data      → validate data/ and write public/data/ (graph + exports)
 * npm run validate  → validate only; exits non-zero on any error
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "./compile.ts";
import { toCsvExports, toPopolo } from "./exports.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

const { graph, errors, warnings } = compile(join(root, "data"));
for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\n${errors.length} error(s). Fix the data files above.`);
  process.exit(1);
}
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
