/**
 * Sourcing gaps: the exact list of records that still lack a usable source.
 *
 *   npx tsx scripts/sourcing-gaps.ts          Markdown list (used for GAPS.md)
 *   npx tsx scripts/sourcing-gaps.ts --json   machine-readable
 *
 * role   a current role (no `until`) with no source URL, or only an encyclopedia URL
 * person a person none of whose roles (or non-member statement) cites a source
 * body   an authored organization with no sources, no legal basis and no website
 * law    a law with no link to its text
 */
import { fileURLToPath } from "node:url";
import { compile } from "./compile.ts";
import { isEncyclopediaUrl } from "../src/lib/policy.ts";

type Graph = ReturnType<typeof compile>["graph"];
const ok = (s?: { url?: string }) => !!s?.url && !isEncyclopediaUrl(s.url);

export function sourcingGaps(g: Graph) {
  const roles = g.people.flatMap((p) =>
    p.roles
      .filter((r) => !r.until && !ok(r.source))
      .map((r) => ({ person: p.id, position: r.position, since: r.since, confidence: r.confidence ?? p.confidence, needs_source: !!r.needs_source })),
  );
  const people = g.people
    .filter((p) => !p.roles.some((r) => ok(r.source)) && !ok(p.non_member?.source))
    .map((p) => ({ id: p.id, name: p.name, confidence: p.confidence, needs_source: !!p.needs_source }));
  const bodies = g.organizations
    .filter((o) => !o.generated && !(o.sources ?? []).some(ok) && !o.legal_basis?.length && !o.website)
    .map((o) => ({ id: o.id, name: o.name, kind: o.kind, confidence: o.confidence, needs_source: !!o.needs_source }));
  const laws = g.laws.filter((l) => !l.url).map((l) => ({ id: l.id, title: l.title, jurisdiction: l.jurisdiction, needs_source: !!l.needs_source }));
  return { roles, people, bodies, laws };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { graph, errors } = compile(fileURLToPath(new URL("../data", import.meta.url)));
  if (errors.length) throw new Error(errors.join("\n"));
  const gaps = sourcingGaps(graph);
  if (process.argv.includes("--json")) console.log(JSON.stringify(gaps, null, 1));
  else {
    const out = ["# Sourcing gaps", ""];
    for (const [k, list] of Object.entries(gaps)) {
      out.push(`## ${k} (${list.length})`, "");
      for (const x of list as Record<string, unknown>[]) out.push(`- ${Object.values(x).filter((v) => v !== undefined && v !== false).join(" · ")}`);
      out.push("");
    }
    console.log(out.join("\n"));
  }
}
