/**
 * Base map of Pakistan drawn to the conventions of the Government of Pakistan's
 * official political map (released 4 August 2020, Survey of Pakistan):
 *  - Indian Illegally Occupied Jammu & Kashmir (IIOJK) shown as disputed territory,
 *    final status to be decided in line with the relevant UNSC resolutions;
 *  - the frontier east of Ladakh marked "frontier undefined";
 *  - Junagadh and Manavadar shown as Pakistani territory;
 *  - the Sir Creek boundary on the eastern bank.
 * Country outlines come from Natural Earth (1:50m). The disputed region is cut from the
 * Natural Earth India polygon along the southern boundary of the former princely state
 * of Jammu & Kashmir; the Junagadh outline is schematic. The cutting is done at build time
 * (scripts/build-basemap.ts → src/geo/basemap.json).
 */
import { geoArea, geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection } from "geojson";
// outlines cut at build time by scripts/build-basemap.ts, so the browser needs no world atlas
import outlines from "../geo/basemap.json";

/** [lon, lat] rings, as GeoJSON MultiPolygon coordinates. */
export type MultiPolygon = number[][][][];

/** d3-geo expects spherical (clockwise) winding; flip any polygon it would read as covering the rest of the globe. */
function rewind(coords: MultiPolygon): MultiPolygon {
  return coords.map((poly) => {
    const f: Feature = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: poly } };
    return geoArea(f) > 2 * Math.PI ? poly.map((ring) => [...ring].reverse()) : poly;
  });
}

const asFeature = (coords: MultiPolygon, props: Record<string, string> = {}): Feature => ({
  type: "Feature",
  properties: props,
  geometry: { type: "MultiPolygon", coordinates: rewind(coords) },
});

export interface BaseMap {
  svgDefs: string;
  /** Shapes and labels together. */
  layers: string;
  /** Shapes only, for callers that draw their own shapes between the base and the labels. */
  shapes: string;
  labels: string;
  project: (lonLat: [number, number]) => [number, number];
  /** SVG path data for extra shapes (e.g. provinces) in the same projection. */
  draw: (coords: MultiPolygon) => string;
  /** Projected centroid of an extra shape. */
  centroid: (coords: MultiPolygon) => [number, number];
  notes: string[];
}

const made = new Map<string, BaseMap>();

/** The base map for a W × H viewport. The same size always gives the same map, so it is made once. */
export function pakistanBaseMap(W: number, H: number): BaseMap {
  const key = `${W}x${H}`;
  const hit = made.get(key);
  if (hit) return hit;
  const map = makeBaseMap(W, H);
  made.set(key, map);
  return map;
}

function makeBaseMap(W: number, H: number): BaseMap {
  const pak = asFeature(outlines.pakistan);
  const jkF = asFeature(outlines.jk);
  const junF = asFeature(outlines.junagadh);
  const indiaRest = outlines.india;
  const focus: FeatureCollection = { type: "FeatureCollection", features: [pak, jkF, junF] };
  const proj = geoMercator().fitExtent([[24, 24], [W - 24, H - 24]], focus);
  const path = geoPath(proj);
  const p = (lonLat: [number, number]) => proj(lonLat) as [number, number];

  const neighbours = outlines.neighbours.map((n) => asFeature(n));
  const label = (lonLat: [number, number], text: string, opts: { size?: number; anchor?: string; weight?: number; italic?: boolean } = {}) => {
    const [x, y] = p(lonLat);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${opts.size ?? 12}" text-anchor="${opts.anchor ?? "middle"}" font-weight="${opts.weight ?? 500}" ${opts.italic ? 'font-style="italic"' : ""} fill="var(--ink-2)" font-family="IBM Plex Sans, sans-serif" paint-order="stroke" stroke="var(--surface)" stroke-width="3">${text}</text>`;
  };

  const svgDefs = `<defs>
    <pattern id="disputed-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
      <rect width="7" height="7" fill="var(--accent-soft)"/>
      <line x1="0" y1="0" x2="0" y2="7" stroke="var(--accent)" stroke-width="1.6" stroke-opacity="0.55"/>
    </pattern>
  </defs>`;

  const shapes = `
    ${neighbours.map((f) => `<path d="${path(f)}" fill="var(--surface-2)" stroke="var(--line)"/>`).join("")}
    <path d="${path(asFeature(indiaRest))}" fill="var(--surface-2)" stroke="var(--line)"/>
    <path d="${path(pak)}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.5"/>
    <path d="${path(junF)}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.2"/>
    <path d="${path(jkF)}" fill="url(#disputed-hatch)" stroke="var(--accent)" stroke-width="1.4" stroke-dasharray="5 3"/>`;
  const labels = `
    ${label([77.2, 34.45], "IIOJK", { size: 14, weight: 700 })}
    ${label([77.2, 34.05], "Disputed territory", { size: 11, italic: true })}
    ${label([79.7, 35.75], "Frontier undefined", { size: 10, italic: true, anchor: "end" })}
    ${label([73.35, 35.0], "AJK", { size: 11, weight: 600, anchor: "end" })}
    ${label([75.6, 36.35], "Gilgit-Baltistan", { size: 12, weight: 600 })}
    ${label([70.5, 20.45], "Junagadh & Manavadar", { size: 10 })}
    ${label([68.9, 23.35], "Sir Creek", { size: 10, italic: true, anchor: "end" })}
  `;
  return {
    svgDefs,
    layers: shapes + labels,
    shapes,
    labels,
    project: p,
    draw: (coords) => path(asFeature(coords)) ?? "",
    centroid: (coords) => path.centroid(asFeature(coords)) as [number, number],
    notes: [
      "Drawn to the conventions of the Government of Pakistan's official political map (4 August 2020).",
      "Indian Illegally Occupied Jammu & Kashmir (IIOJK): disputed territory, final status to be decided in line with the relevant UNSC resolutions.",
      "The frontier east of Ladakh is undefined, to be settled by the sovereign authorities concerned after the final settlement of the Jammu & Kashmir dispute.",
      "Junagadh and Manavadar are shown as Pakistani territory; the Sir Creek boundary lies on the eastern bank.",
      "Outlines from Natural Earth (1:50m); the disputed-territory and Junagadh outlines are schematic.",
    ],
  };
}
