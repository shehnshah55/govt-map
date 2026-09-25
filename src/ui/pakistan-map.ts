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
 * of Jammu & Kashmir; the Junagadh outline is schematic.
 */
import { geoArea, geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import world from "world-atlas/countries-50m.json";

/** Approximate southern boundary of the former princely state of Jammu & Kashmir (lon, lat), closed to the north. */
const JK_NORTH_OF: [number, number][] = [
  [73.6, 32.0],
  [75.35, 32.27],
  [75.75, 32.27],
  [76.1, 32.5],
  [76.5, 32.8],
  [77.1, 32.95],
  [77.8, 32.72],
  [78.3, 32.55],
  [78.9, 32.4],
  [79.6, 32.45],
  [80.6, 32.2],
  [81.5, 32.2],
  [81.5, 37.5],
  [73.6, 37.5],
  [73.6, 32.0],
];

/** Schematic outline of the former states of Junagadh and Manavadar (Kathiawar). */
const JUNAGADH: [number, number][] = [
  [69.95, 21.25],
  [70.2, 21.72],
  [70.65, 21.78],
  [71.02, 21.45],
  [71.05, 21.0],
  [70.75, 20.72],
  [70.3, 20.78],
  [69.95, 21.25],
];

function geometry(f: Feature): MultiPolygon {
  const g = f.geometry as Geometry;
  if (g.type === "Polygon") return [g.coordinates as Polygon];
  if (g.type === "MultiPolygon") return g.coordinates as MultiPolygon;
  return [];
}

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
  layers: string;
  project: (lonLat: [number, number]) => [number, number];
  notes: string[];
}

export function pakistanBaseMap(W: number, H: number): BaseMap {
  const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
  const countries = feature(topo, topo.objects.countries) as unknown as FeatureCollection;
  const byId = (id: string) => countries.features.find((f) => String(f.id) === id)!;
  const pak = byId("586");
  const india = byId("356");
  const box: Polygon = [JK_NORTH_OF];
  const jk = polygonClipping.intersection(geometry(india), [box]);
  const indiaRest = polygonClipping.difference(geometry(india), [box], [[JUNAGADH]]);
  const jkF = asFeature(jk);
  const junF = asFeature([[JUNAGADH]]);
  const focus: FeatureCollection = { type: "FeatureCollection", features: [pak, jkF, junF] };
  const proj = geoMercator().fitExtent([[24, 24], [W - 24, H - 24]], focus);
  const path = geoPath(proj);
  const p = (lonLat: [number, number]) => proj(lonLat) as [number, number];

  const neighbours = ["004", "364", "156"].map(byId).filter(Boolean);
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

  const layers = `
    ${neighbours.map((f) => `<path d="${path(f)}" fill="var(--surface-2)" stroke="var(--line)"/>`).join("")}
    <path d="${path(asFeature(indiaRest))}" fill="var(--surface-2)" stroke="var(--line)"/>
    <path d="${path(pak)}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.5"/>
    <path d="${path(junF)}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.2"/>
    <path d="${path(jkF)}" fill="url(#disputed-hatch)" stroke="var(--accent)" stroke-width="1.4" stroke-dasharray="5 3"/>
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
    layers,
    project: p,
    notes: [
      "Drawn to the conventions of the Government of Pakistan's official political map (4 August 2020).",
      "Indian Illegally Occupied Jammu & Kashmir (IIOJK): disputed territory, final status to be decided in line with the relevant UNSC resolutions.",
      "The frontier east of Ladakh is undefined, to be settled by the sovereign authorities concerned after the final settlement of the Jammu & Kashmir dispute.",
      "Junagadh and Manavadar are shown as Pakistani territory; the Sir Creek boundary lies on the eastern bank.",
      "Outlines from Natural Earth (1:50m); the disputed-territory and Junagadh outlines are schematic.",
    ],
  };
}
