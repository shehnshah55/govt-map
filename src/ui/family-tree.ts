/**
 * A family tree drawn with the project's Cytoscape setup: generations top to bottom,
 * spouses, siblings and cousins on the same row. Tapping a tie shows its sources; the page also
 * lists every tie with its sources as text, so nothing depends on the drawing.
 */
import cytoscape from "cytoscape";
import { GENERATIONS, RELATION_PHRASE, type Tie } from "../lib/families.ts";

export interface TreeNode {
  id: string;
  /** Name, then party and offices, one per line. */
  label: string;
  focus?: boolean;
  /** Generation (0 = oldest) and position within it, from generations() in src/lib/families.ts. */
  row: number;
  col: number;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

export function mountFamilyTree(container: HTMLElement, nodes: TreeNode[], ties: Tie[], on: { openPerson: (id: string) => void; showTie: (tie: Tie) => void }) {
  const ink = css("--ink");
  const surface = css("--surface");
  const accent = css("--accent");
  const line = css("--line-strong");
  const muted = css("--muted");
  const ids = new Set(nodes.map((n) => n.id));
  const cy = cytoscape({
    container,
    elements: [
      ...nodes.map((n) => ({ data: { id: n.id, label: n.label }, classes: n.focus ? "focus" : "", position: { x: n.col * 250, y: n.row * 130 } })),
      ...ties
        .filter((t) => ids.has(t.from) && ids.has(t.to))
        .map((t, i) => ({
          data: { id: `t${i}`, source: t.from, target: t.to, i, label: RELATION_PHRASE[t.relation][0] },
          classes: GENERATIONS[t.relation] ? "descent" : "level",
        })),
    ],
    // generations are computed by the caller, so the positions are fixed ("preset")
    layout: { name: "preset", padding: 30, fit: true, animate: false },
    minZoom: 0.2,
    maxZoom: 2,
    wheelSensitivity: 0.25,
    style: [
      {
        selector: "node",
        style: {
          shape: "round-rectangle",
          width: 150,
          height: 54,
          "background-color": surface,
          "border-width": 1.5,
          "border-color": line,
          label: "data(label)",
          "text-wrap": "wrap",
          "text-max-width": "140px",
          "text-valign": "center",
          "font-family": "IBM Plex Sans, system-ui, sans-serif",
          "font-size": 10,
          color: ink,
        },
      },
      { selector: "node.focus", style: { "border-color": accent, "border-width": 3 } },
      { selector: "edge", style: { width: 1.5, "line-color": line, "curve-style": "taxi", "taxi-direction": "downward", label: "data(label)", "font-size": 9, color: muted, "text-background-color": surface, "text-background-opacity": 1, "text-background-padding": "2px" } },
      { selector: "edge.level", style: { "curve-style": "straight", "line-style": "dashed" } },
      { selector: "node:selected, edge:selected", style: { "border-color": accent, "line-color": accent } },
    ],
  });
  if (cy.zoom() > 1.2) {
    cy.zoom(1.2);
    cy.center();
  }
  cy.on("tap", "node", (e) => on.openPerson(e.target.id()));
  cy.on("tap", "edge", (e) => on.showTie(ties[e.target.data("i")]));
  return cy;
}
