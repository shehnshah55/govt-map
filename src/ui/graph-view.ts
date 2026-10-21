/**
 * The data behind the graph views: which nodes and edges each one shows. Drawing them is in
 * ./graph-canvas.ts, which loads Cytoscape only when a graph is about to be seen.
 */
import type { GraphIndex } from "../lib/graph-index.ts";
import type { RelationType } from "../schema.ts";

export interface VNode {
  id: string;
  label: string;
  type: "organization" | "position" | "person" | "jurisdiction" | "law";
  branch?: string;
  focus?: boolean;
}
export interface VEdge {
  source: string;
  target: string;
  type: RelationType;
}

export type LayoutName = "dagre-tb" | "dagre-lr" | "concentric" | "cose";

export const STRUCTURAL: RelationType[] = ["part_of", "head_of", "seat_in"];
export const POWER: RelationType[] = ["appoints", "elects", "nominates", "confirms", "advises", "holds"];

export type Lens = "branch" | "class";

/** Neighbourhood of an organization: hierarchy (parent, children, grandchildren), posts, holders and authored relations. */
export function orgNeighbourhood(ix: GraphIndex, orgId: string, mode: "structure" | "connections"): { nodes: VNode[]; edges: VEdge[] } {
  const nodes = new Map<string, VNode>();
  const edges: VEdge[] = [];
  const addOrg = (id: string, focus = false) => {
    const o = ix.org.get(id);
    if (o && !nodes.has(id)) nodes.set(id, { id, label: o.short_name ?? o.name, type: "organization", branch: o.branch, focus });
  };
  const addAny = (id: string) => {
    const k = ix.kindOf(id);
    if (!k || nodes.has(id)) return;
    if (k === "organization") return addOrg(id);
    const branch = k === "position" ? ix.org.get(ix.post.get(id)!.org)?.branch : undefined;
    nodes.set(id, { id, label: ix.shortLabel(id), type: k, branch });
  };
  addOrg(orgId, true);
  const o = ix.org.get(orgId)!;
  if (mode === "structure") {
    if (o.parent) {
      addOrg(o.parent);
      edges.push({ source: o.parent, target: orgId, type: "part_of" });
    }
    const kids = ix.children.get(orgId) ?? [];
    for (const c of kids.slice(0, 60)) {
      addOrg(c.id);
      edges.push({ source: orgId, target: c.id, type: "part_of" });
      if (kids.length <= 25)
        for (const g of (ix.children.get(c.id) ?? []).slice(0, 12)) {
          addOrg(g.id);
          edges.push({ source: c.id, target: g.id, type: "part_of" });
        }
    }
    for (const p of ix.leadership(orgId).filter((p) => p.role !== "member" && p.role !== "judge").slice(0, 4)) {
      addAny(p.id);
      edges.push({ source: p.id, target: orgId, type: "head_of" });
      for (const h of ix.currentHolders(p.id)) {
        addAny(h.person.id);
        edges.push({ source: h.person.id, target: p.id, type: "holds" });
      }
    }
    return { nodes: [...nodes.values()], edges };
  }
  // connections: authored relations of the org, its leadership posts, and the powers that appoint them
  const skip: RelationType[] = ["part_of", "established_by"];
  for (const e of [...(ix.out.get(orgId) ?? []), ...(ix.in.get(orgId) ?? [])]) {
    if (skip.includes(e.type) || e.type === "head_of" || e.type === "seat_in") continue;
    addAny(e.from);
    addAny(e.to);
    edges.push({ source: e.from, target: e.to, type: e.type });
  }
  for (const p of ix.leadership(orgId).slice(0, 6)) {
    addAny(p.id);
    edges.push({ source: p.id, target: orgId, type: p.role === "member" ? "seat_in" : "head_of" });
    for (const e of ix.in.get(p.id) ?? []) {
      if (!POWER.includes(e.type)) continue;
      addAny(e.from);
      edges.push({ source: e.from, target: p.id, type: e.type });
    }
    for (const e of ix.out.get(p.id) ?? []) {
      if (!["member_of", "chairs"].includes(e.type)) continue;
      addAny(e.to);
      edges.push({ source: p.id, target: e.to, type: e.type });
    }
  }
  return { nodes: [...nodes.values()], edges };
}

/** Appointment power map: every authored post and the posts/bodies that appoint, elect or nominate it. */
export function powerMap(ix: GraphIndex, scope: (jurisdiction: string) => boolean): { nodes: VNode[]; edges: VEdge[] } {
  const nodes = new Map<string, VNode>();
  const edges: VEdge[] = [];
  const add = (id: string) => {
    if (nodes.has(id)) return;
    const k = ix.kindOf(id);
    if (!k) return;
    const branch = k === "organization" ? ix.org.get(id)!.branch : k === "position" ? ix.org.get(ix.post.get(id)!.org)?.branch : undefined;
    nodes.set(id, { id, label: ix.shortLabel(id), type: k, branch });
  };
  for (const p of ix.g.positions) {
    if (p.generated || !scope(ix.org.get(p.org)?.jurisdiction ?? "")) continue;
    if (p.role === "judge" || p.role === "member") continue;
    for (const e of ix.in.get(p.id) ?? []) {
      if (!["appoints", "elects", "nominates", "confirms"].includes(e.type)) continue;
      add(e.from);
      add(p.id);
      edges.push({ source: e.from, target: p.id, type: e.type });
    }
  }
  return { nodes: [...nodes.values()], edges };
}

/** Organizational hierarchy under a root, excluding field administration unless asked. */
export function hierarchy(ix: GraphIndex, rootId: string, depth: number, includeField = false): { nodes: VNode[]; edges: VEdge[] } {
  const nodes: VNode[] = [];
  const edges: VEdge[] = [];
  const visit = (id: string, d: number) => {
    const o = ix.org.get(id)!;
    nodes.push({ id, label: o.short_name ?? o.name, type: "organization", branch: o.branch, focus: id === rootId });
    if (d >= depth) return;
    for (const c of ix.children.get(id) ?? []) {
      if (!includeField && c.kind === "field_administration") continue;
      if (c.abolished) continue;
      edges.push({ source: id, target: c.id, type: "part_of" });
      visit(c.id, d + 1);
    }
  };
  visit(rootId, 0);
  return { nodes, edges };
}
