/** Open-data exports: flat CSVs and a Popolo-compatible JSON document. */
import type { Graph } from "../src/schema.ts";

const cell = (v: unknown) => {
  const s = v == null ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: Record<string, unknown>[], cols: string[]) =>
  [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n";

export function toCsvExports(g: Graph): Record<string, string> {
  return {
    "organizations.csv": csv(
      g.organizations.map((o) => ({
        ...o,
        legal_basis: o.legal_basis?.map((l) => (l.provision ? `${l.law} ${l.provision}` : l.law)),
      })),
      ["id", "name", "short_name", "name_ur", "kind", "branch", "jurisdiction", "parent", "sectors", "established", "abolished", "legal_basis", "website", "confidence"],
    ),
    "positions.csv": csv(
      g.positions.map((p) => ({
        ...p,
        method: p.appointment?.method,
        appointed_by: p.appointment?.by,
        on_advice_of: p.appointment?.on_advice_of,
        nominated_by: p.appointment?.nominated_by,
        confirmation: p.appointment?.confirmation,
        term: p.appointment?.term,
      })),
      ["id", "title", "org", "role", "grade", "seats", "method", "appointed_by", "on_advice_of", "nominated_by", "confirmation", "term", "ex_officio_of", "generated", "confidence"],
    ),
    "tenures.csv": csv(
      g.people.flatMap((p) =>
        p.roles.map((r) => ({ person_id: p.id, name: p.name, party: p.party, position: r.position, since: r.since, until: r.until, status: r.status, as_of: p.as_of, confidence: p.confidence })),
      ),
      ["person_id", "name", "party", "position", "since", "until", "status", "as_of", "confidence"],
    ),
    "jurisdictions.csv": csv(g.jurisdictions as unknown as Record<string, unknown>[], ["id", "name", "name_ur", "kind", "parent", "capital", "headquarters", "confidence"]),
    "edges.csv": csv(g.edges as unknown as Record<string, unknown>[], ["from", "type", "to", "description", "derived", "confidence"]),
    "laws.csv": csv(g.laws as unknown as Record<string, unknown>[], ["id", "title", "kind", "year", "jurisdiction", "url"]),
  };
}

/** https://www.popoloproject.com/specs/ — Organization, Post, Person, Membership. */
export function toPopolo(g: Graph) {
  const postOrg = new Map(g.positions.map((p) => [p.id, p.org]));
  return {
    organizations: g.organizations.map((o) => ({
      id: o.id,
      name: o.name,
      other_names: [o.short_name, o.name_ur].filter(Boolean).map((name) => ({ name })),
      classification: o.kind,
      parent_id: o.parent ?? null,
      area_id: o.jurisdiction,
      founding_date: o.established ?? null,
      dissolution_date: o.abolished ?? null,
      links: o.website ? [{ url: o.website, note: "website" }] : [],
      sources: o.sources ?? [],
    })),
    posts: g.positions.map((p) => ({ id: p.id, label: p.title, role: p.role, organization_id: p.org })),
    persons: g.people.map((p) => ({ id: p.id, name: p.name, other_names: p.name_ur ? [{ name: p.name_ur }] : [] })),
    memberships: g.people.flatMap((p) =>
      p.roles.map((r, i) => ({
        id: `${p.id}-${i}`,
        person_id: p.id,
        post_id: r.position,
        organization_id: postOrg.get(r.position),
        start_date: r.since ?? null,
        end_date: r.until ?? null,
        role: r.status,
      })),
    ),
    areas: g.jurisdictions.map((j) => ({ id: j.id, name: j.name, classification: j.kind, parent_id: j.parent ?? null })),
  };
}
