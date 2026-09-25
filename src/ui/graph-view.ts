/** Cytoscape wrapper: themed, clickable node-link diagrams for the graph views. */
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import type { GraphIndex } from "../lib/graph-index.ts";
import type { RelationType } from "../schema.ts";

cytoscape.use(dagre);

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

const STRUCTURAL: RelationType[] = ["part_of", "head_of", "seat_in"];
const POWER: RelationType[] = ["appoints", "elects", "nominates", "confirms", "advises", "holds"];

function cssVar(el: Element, name: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || "#888";
}

export function mountGraph(
  container: HTMLElement,
  data: { nodes: VNode[]; edges: VEdge[] },
  opts: { layout: LayoutName; onOpen: (id: string) => void },
) {
  const root = document.documentElement;
  const color = (n: string) => cssVar(root, n);
  const branchColor: Record<string, string> = {
    executive: color("--b-executive"),
    legislative: color("--b-legislative"),
    judicial: color("--b-judicial"),
    constitutional: color("--b-constitutional"),
    military: color("--b-military"),
    local: color("--b-local"),
    political: color("--b-political"),
  };
  const ink = color("--ink");
  const muted = color("--muted");
  const surface = color("--surface");
  const line = color("--line-strong");
  const accent = color("--accent");
  const warm = color("--power");

  const ids = new Set(data.nodes.map((n) => n.id));
  const elements: cytoscape.ElementDefinition[] = [
    ...data.nodes.map((n) => ({
      data: { id: n.id, label: wrap(n.label), type: n.type, fill: n.branch ? branchColor[n.branch] ?? muted : muted },
      classes: [n.type, n.focus ? "focus" : ""].join(" "),
    })),
    ...data.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
      .map((e, i) => ({
        data: { id: `e${i}`, source: e.source, target: e.target, type: e.type },
        classes: STRUCTURAL.includes(e.type) ? "structural" : POWER.includes(e.type) ? "power" : "relation",
      })),
  ];

  const layout: cytoscape.LayoutOptions =
    opts.layout === "dagre-tb" || opts.layout === "dagre-lr"
      ? ({ name: "dagre", rankDir: opts.layout === "dagre-tb" ? "TB" : "LR", nodeSep: 14, rankSep: 70, edgeSep: 6, animate: false } as cytoscape.LayoutOptions)
      : opts.layout === "concentric"
        ? ({
            name: "concentric",
            concentric: (n: cytoscape.NodeSingular) => (n.hasClass("focus") ? 10 : n.data("type") === "position" ? 6 : n.data("type") === "person" ? 4 : 2),
            levelWidth: () => 1,
            minNodeSpacing: 18,
            animate: false,
          } as cytoscape.LayoutOptions)
        : ({ name: "cose", animate: false, nodeRepulsion: () => 9000, idealEdgeLength: () => 90, numIter: 1200 } as cytoscape.LayoutOptions);

  const cy = cytoscape({
    container,
    elements,
    layout,
    minZoom: 0.15,
    maxZoom: 2.5,
    wheelSensitivity: 0.25,
    style: [
      {
        selector: "node",
        style: {
          label: "data(label)",
          "font-family": "IBM Plex Sans, system-ui, sans-serif",
          "font-size": 10,
          color: ink,
          "text-valign": "bottom",
          "text-margin-y": 4,
          "text-wrap": "wrap",
          "text-max-width": "140px",
          "background-color": "data(fill)",
          width: 14,
          height: 14,
          "border-width": 2,
          "border-color": surface,
        },
      },
      { selector: "node.organization", style: { shape: "round-rectangle", width: 18, height: 14 } },
      { selector: "node.position", style: { shape: "ellipse", width: 11, height: 11, "background-color": warm } },
      { selector: "node.person", style: { shape: "diamond", width: 13, height: 13, "background-color": ink } },
      { selector: "node.law", style: { shape: "tag", "background-color": muted } },
      { selector: "node.jurisdiction", style: { shape: "hexagon", "background-color": muted } },
      { selector: "node.focus", style: { width: 26, height: 22, "border-width": 3, "border-color": accent, "font-weight": 600, "font-size": 12 } },
      {
        selector: "edge",
        style: { width: 1.2, "line-color": line, "curve-style": "bezier", "target-arrow-shape": "triangle", "target-arrow-color": line, "arrow-scale": 0.7 },
      },
      { selector: "edge.structural", style: { "target-arrow-shape": "none", width: 1 } },
      { selector: "edge.power", style: { "line-color": warm, "target-arrow-color": warm, "line-style": "solid" } },
      { selector: "edge.relation", style: { "line-style": "dashed", "line-color": muted, "target-arrow-color": muted } },
      { selector: "node:selected, node.hover", style: { "border-color": accent, "border-width": 3 } },
      { selector: ".faded", style: { opacity: 0.15 } },
    ],
  });

  // Small neighbourhoods would otherwise be blown up to fill the canvas.
  if (cy.zoom() > 1.1) {
    cy.zoom(1.1);
    cy.center();
  }
  cy.on("tap", "node", (evt) => opts.onOpen(evt.target.id()));
  cy.on("mouseover", "node", (evt) => {
    const n = evt.target;
    cy.elements().addClass("faded");
    n.closedNeighborhood().removeClass("faded");
    n.addClass("hover");
    container.style.cursor = "pointer";
  });
  cy.on("mouseout", "node", (evt) => {
    cy.elements().removeClass("faded");
    evt.target.removeClass("hover");
    container.style.cursor = "";
  });
  return cy;
}

function wrap(s: string) {
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}

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
