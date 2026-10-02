/**
 * Political families (docs/LAUNCH_PLAN.md §7.15): groups of officeholders connected by recorded
 * family ties. Only ties that pass the editorial policy reach the graph (scripts/compile.ts checks
 * that both people hold or held an office, and the sourcing), so everything here is publishable.
 */
import type { GraphIndex, Human } from "./graph-index.ts";
import type { Graph } from "../schema.ts";

export type Tie = Graph["relatives"][number];
export type Relation = Tie["relation"];

/** "from is the … of to", and the reverse. */
export const RELATION_PHRASE: Record<Relation, [string, string]> = {
  parent: ["parent of", "child of"],
  spouse: ["spouse of", "spouse of"],
  sibling: ["sibling of", "sibling of"],
  grandparent: ["grandparent of", "grandchild of"],
  uncle_or_aunt: ["uncle or aunt of", "nephew or niece of"],
  cousin: ["cousin of", "cousin of"],
  in_law: ["in-law of", "in-law of"],
};

/** Generations between `from` and `to` (positive: `from` is older). In-laws are drawn level. */
export const GENERATIONS: Record<Relation, number> = { parent: 1, grandparent: 2, uncle_or_aunt: 1, spouse: 0, sibling: 0, cousin: 0, in_law: 0 };

/** The ties touching one person, each phrased from that person's side. */
export function tiesOf(ix: GraphIndex, personId: string): { tie: Tie; other: string; phrase: string }[] {
  return ix.g.relatives
    .filter((t) => t.from === personId || t.to === personId)
    .map((t) => (t.from === personId ? { tie: t, other: t.to, phrase: RELATION_PHRASE[t.relation][0] } : { tie: t, other: t.from, phrase: RELATION_PHRASE[t.relation][1] }));
}

export interface Family {
  /** The family's page is keyed by any member; this is the first by id. */
  id: string;
  members: Human[];
  ties: Tie[];
}

/** Connected groups of people linked by ties, largest first. */
export function families(ix: GraphIndex): Family[] {
  const adj = new Map<string, Set<string>>();
  for (const t of ix.g.relatives) {
    adj.set(t.from, (adj.get(t.from) ?? new Set()).add(t.to));
    adj.set(t.to, (adj.get(t.to) ?? new Set()).add(t.from));
  }
  const seen = new Set<string>();
  const out: Family[] = [];
  for (const start of [...adj.keys()].sort()) {
    if (seen.has(start)) continue;
    const ids: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const id = stack.pop()!;
      ids.push(id);
      for (const n of adj.get(id) ?? []) if (!seen.has(n)) (seen.add(n), stack.push(n));
    }
    ids.sort();
    const set = new Set(ids);
    out.push({
      id: ids[0],
      members: ids.map((id) => ix.person.get(id)).filter((p): p is Human => !!p),
      ties: ix.g.relatives.filter((t) => set.has(t.from)),
    });
  }
  return out.sort((a, b) => b.members.length - a.members.length || a.id.localeCompare(b.id));
}

export const familyOf = (ix: GraphIndex, personId: string) => families(ix).find((f) => f.members.some((m) => m.id === personId));

/** Where members hold or held directly elected seats: constituency, district and province. */
export function seatsOf(ix: GraphIndex, f: Family) {
  return f.members.flatMap((m) =>
    m.roles
      .map((r) => ({ r, post: ix.post.get(r.position) }))
      .filter(({ post }) => post?.area && post.appointment?.method === "direct_election")
      .map(({ r, post }) => {
        const trail = ix.placeTrail(post!.area!);
        return { person: m, post: post!, current: !r.until, constituency: ix.place.get(post!.area!), district: trail.find((p) => p.kind === "district"), province: trail[1] };
      }),
  );
}

/**
 * Rows for the family tree: each person's generation (0 = oldest recorded), and the order within
 * each row, with spouses, siblings and cousins placed next to each other. Computed here because
 * dagre cannot keep two linked people on the same row.
 */
export function generations(f: Family): { id: string; row: number; col: number }[] {
  const gen = new Map<string, number>();
  const order: string[] = [];
  const queue = [f.members[0]?.id].filter(Boolean) as string[];
  if (queue[0]) gen.set(queue[0], 0);
  const remaining = new Set(f.members.map((m) => m.id));
  while (remaining.size) {
    if (!queue.length) {
      // a person not reachable from the first one (should not happen within a family)
      const next = [...remaining][0];
      gen.set(next, 0);
      queue.push(next);
    }
    const id = queue.shift()!;
    if (!remaining.has(id)) continue;
    remaining.delete(id);
    order.push(id);
    const sameRow: { other: string; spouse: boolean }[] = [];
    for (const t of f.ties) {
      const g = GENERATIONS[t.relation];
      const [other, delta] = t.from === id ? [t.to, g] : t.to === id ? [t.from, -g] : [undefined, 0];
      if (!other || gen.has(other)) continue;
      gen.set(other, gen.get(id)! + delta);
      if (delta === 0) sameRow.push({ other, spouse: t.relation === "spouse" });
      else queue.push(other);
    }
    // same-row relatives go straight after this person, spouse first, so they sit side by side
    sameRow.sort((x, y) => Number(y.spouse) - Number(x.spouse));
    queue.unshift(...sameRow.map((x) => x.other));
  }
  const min = Math.min(...gen.values());
  const rows = new Map<number, string[]>();
  for (const id of order) {
    const r = gen.get(id)! - min;
    rows.set(r, [...(rows.get(r) ?? []), id]);
  }
  return [...rows].flatMap(([row, ids]) => ids.map((id, col) => ({ id, row, col: col - (ids.length - 1) / 2 })));
}
