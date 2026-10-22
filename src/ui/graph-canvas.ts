/**
 * Draws the graph views with Cytoscape: themed, clickable node-link diagrams. Loaded on demand
 * (see graphPanel() in src/views/common.ts), so pages without a visible graph don't download or
 * run it.
 */
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import { POWER, STRUCTURAL, type LayoutName, type Lens, type VEdge, type VNode } from "./graph-view.ts";

cytoscape.use(dagre);

function wrap(s: string) {
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}

function cssVar(el: Element, name: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || "#888";
}

export function mountGraph(
  container: HTMLElement,
  data: { nodes: VNode[]; edges: VEdge[] },
  opts: { layout: LayoutName; onOpen: (id: string) => void; lens?: Lens; classify?: (id: string) => { sel?: string; origin?: string } },
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

  const classColor: Record<string, string> = {
    elected: color("--k-green"),
    political: color("--k-purple"),
    constitutional: color("--k-navy"),
    judicial: color("--k-burgundy"),
    military: color("--k-olive"),
    civil_service: color("--k-slate"),
    regulatory: color("--k-gold-fill"),
    statutory: color("--k-teal"),
    ex_officio: muted,
    executive: color("--k-slate"),
    conventional: muted,
    unrecorded: muted,
  };
  const fillFor = (n: VNode) => {
    if (opts.lens === "class" && opts.classify) {
      const c = opts.classify(n.id);
      const key = c.sel ?? c.origin;
      if (key) return classColor[key] ?? muted;
    }
    return n.branch ? branchColor[n.branch] ?? muted : muted;
  };
  const ids = new Set(data.nodes.map((n) => n.id));
  const elements: cytoscape.ElementDefinition[] = [
    ...data.nodes.map((n) => ({
      data: { id: n.id, label: wrap(n.label), type: n.type, fill: fillFor(n) },
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
      { selector: "node.position", style: { shape: "ellipse", width: 11, height: 11, "background-color": opts.lens === "class" ? "data(fill)" : warm } },
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

