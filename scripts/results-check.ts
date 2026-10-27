/**
 * Build gate for election results (data/results/) and census figures (data/census/). Run by
 * `npm run validate` and `npm run data`. Every row must match the schema and add up:
 *  - valid + rejected = polled, and polled ≤ registered;
 *  - the votes listed add up to the valid votes;
 *  - each constituency appears once, exists in the graph, belongs to the file's house, and its
 *    districts are districts of the same province (including the district the graph places it in);
 *  - where the file gives the ECP's own totals, the rows add up to them exactly.
 * Census rows must name districts in the graph, once each.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CensusFile, ResultsFile, type Graph } from "../src/schema.ts";

export interface ResultsCheck {
  results: ResultsFile[];
  census: CensusFile[];
  errors: string[];
}

type Jur = Graph["jurisdictions"][number];

/** The province (or territory) a jurisdiction sits in: the first ancestor directly under the country. */
function provinceOf(byId: Map<string, Jur>, id: string): string | undefined {
  let j = byId.get(id);
  for (let i = 0; j && i < 8; i++) {
    const parent = j.parent ? byId.get(j.parent) : undefined;
    if (!parent || parent.kind === "country") return j.id;
    j = parent;
  }
  return undefined;
}

const zodErrors = (file: string, issues: { path: PropertyKey[]; message: string }[]) => issues.slice(0, 20).map((i) => `${file}: ${i.path.join(".")}: ${i.message}`);

export function checkResults(root: string, g: Pick<Graph, "jurisdictions" | "organizations">): ResultsCheck {
  const out: ResultsCheck = { results: [], census: [], errors: [] };
  const byId = new Map(g.jurisdictions.map((j) => [j.id, j]));
  const parties = new Set(g.organizations.filter((o) => o.kind === "political_party").map((o) => o.id));

  const resultsDir = join(root, "results");
  if (existsSync(resultsDir)) {
    const seenFile = new Set<string>();
    for (const f of readdirSync(resultsDir).filter((n) => n.endsWith(".json")).sort()) {
      const parsed = ResultsFile.safeParse(JSON.parse(readFileSync(join(resultsDir, f), "utf8")));
      if (!parsed.success) {
        out.errors.push(...zodErrors(f, parsed.error.issues));
        continue;
      }
      const file = parsed.data;
      if (f !== `${file.election}-${file.house}.json`) out.errors.push(`${f}: name it ${file.election}-${file.house}.json`);
      if (seenFile.has(f)) continue;
      seenFile.add(f);
      const seen = new Set<string>();
      for (const r of file.results) {
        const at = `${f}: ${r.constituency}`;
        if (seen.has(r.constituency)) out.errors.push(`${at}: listed twice`);
        seen.add(r.constituency);
        const con = byId.get(r.constituency);
        if (!con || con.kind !== "constituency") out.errors.push(`${at}: no such constituency in data/legislatures.yaml`);
        if (!r.constituency.startsWith(`con-${file.house}-`)) out.errors.push(`${at}: not a ${file.house.toUpperCase()} constituency`);
        const province = con ? provinceOf(byId, con.id) : undefined;
        for (const d of r.districts) {
          const dj = byId.get(d);
          if (!dj || dj.kind !== "district") out.errors.push(`${at}: ${d} is not a district in data/jurisdictions.yaml`);
          else if (province && provinceOf(byId, d) !== province) out.errors.push(`${at}: district ${d} is not in ${province}`);
        }
        if (new Set(r.districts).size !== r.districts.length) out.errors.push(`${at}: a district is listed twice`);
        if (con?.parent && byId.get(con.parent)?.kind === "district" && !r.districts.includes(con.parent)) out.errors.push(`${at}: data/legislatures.yaml places it in ${con.parent}, which districts must include`);
        if (r.valid + r.rejected !== r.polled) out.errors.push(`${at}: valid (${r.valid}) + rejected (${r.rejected}) ≠ polled (${r.polled})`);
        if (r.polled > r.registered) out.errors.push(`${at}: polled (${r.polled}) exceeds registered (${r.registered})`);
        const sum = r.votes.reduce((s, v) => s + v.votes, 0);
        if (sum !== r.valid) out.errors.push(`${at}: votes listed add up to ${sum}, not the ${r.valid} valid votes`);
        for (const v of r.votes) if (v.party && v.party !== "independent" && !parties.has(v.party)) out.errors.push(`${at}: unknown party ${v.party} (use a party id, independent, or party_name)`);
      }
      if (file.totals) {
        const counted = file.results.filter((r) => !r.not_held);
        const reg = counted.reduce((s, r) => s + r.registered, 0);
        const pol = counted.reduce((s, r) => s + r.polled, 0);
        if (reg !== file.totals.registered) out.errors.push(`${f}: rows add up to ${reg} registered voters, ECP totals say ${file.totals.registered}`);
        if (pol !== file.totals.polled) out.errors.push(`${f}: rows add up to ${pol} votes polled, ECP totals say ${file.totals.polled}`);
      }
      out.results.push(file);
    }
  }

  const censusDir = join(root, "census");
  if (existsSync(censusDir)) {
    for (const f of readdirSync(censusDir).filter((n) => n.endsWith(".json")).sort()) {
      const parsed = CensusFile.safeParse(JSON.parse(readFileSync(join(censusDir, f), "utf8")));
      if (!parsed.success) {
        out.errors.push(...zodErrors(f, parsed.error.issues));
        continue;
      }
      const file = parsed.data;
      if (f !== `districts-${file.census}.json`) out.errors.push(`${f}: name it districts-${file.census}.json`);
      const seen = new Set<string>();
      for (const d of file.districts) {
        if (seen.has(d.district)) out.errors.push(`${f}: ${d.district} listed twice`);
        seen.add(d.district);
        if (byId.get(d.district)?.kind !== "district") out.errors.push(`${f}: ${d.district} is not a district in data/jurisdictions.yaml`);
      }
      for (const k of ["literacy_pct", "urban_pct"] as const)
        if (file.districts.some((d) => d[k] !== undefined) && !file.definitions[k]) out.errors.push(`${f}: ${k} is used, so definitions.${k} must say how PBS defines it`);
      out.census.push(file);
    }
  }
  return out;
}
