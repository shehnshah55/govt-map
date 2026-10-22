/**
 * Writes src/geo/basemap.json: the outlines the Pakistan base map draws (src/ui/pakistan-map.ts),
 * cut once here instead of in every visitor's browser. The site then needs neither the world atlas
 * (738 KB, 224 KB gzipped) nor a polygon-clipping library at runtime.
 *
 *   npx tsx scripts/build-basemap.ts           write the file
 *   npx tsx scripts/build-basemap.ts --check   fail if the file is out of date (tests/basemap.test.ts)
 *
 * The map follows the conventions of the Government of Pakistan's official political map
 * (4 August 2020); see the comment in src/ui/pakistan-map.ts. Outlines are Natural Earth 1:50m
 * (the world-atlas package). Neighbours and the rest of India are clipped to a box well outside
 * the visible map, and coordinates are rounded to 0.01° (about 1 km, under half a pixel on the
 * largest map).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";
import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry } from "geojson";

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

/** Everything either map can show, with a wide margin (lon 50–90, lat 12–45). */
const AREA: Polygon = [
  [
    [50, 12],
    [90, 12],
    [90, 45],
    [50, 45],
    [50, 12],
  ],
];

const OUT = fileURLToPath(new URL("../src/geo/basemap.json", import.meta.url));

function geometry(f: Feature): MultiPolygon {
  const g = f.geometry as Geometry;
  if (g.type === "Polygon") return [g.coordinates as Polygon];
  if (g.type === "MultiPolygon") return g.coordinates as MultiPolygon;
  return [];
}

const round = (m: MultiPolygon): MultiPolygon => m.map((poly) => poly.map((ring) => ring.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100])));

export function basemap() {
  const world = JSON.parse(readFileSync(fileURLToPath(import.meta.resolve("world-atlas/countries-50m.json")), "utf8")) as Topology<{ countries: GeometryCollection }>;
  const countries = feature(world, world.objects.countries) as unknown as FeatureCollection;
  const byId = (id: string) => geometry(countries.features.find((f) => String(f.id) === id)!);
  const india = byId("356");
  const box: Polygon = [JK_NORTH_OF];
  return {
    source: "Natural Earth 1:50m (world-atlas countries-50m.json), cut by scripts/build-basemap.ts",
    pakistan: round(byId("586")),
    /** Indian Illegally Occupied Jammu & Kashmir: India's outline north of the former state's southern boundary. */
    jk: round(polygonClipping.intersection(india, [box])),
    junagadh: round([[JUNAGADH]]),
    india: round(polygonClipping.difference(polygonClipping.intersection(india, AREA), [box], [[JUNAGADH]])),
    /** Afghanistan, Iran and China. */
    neighbours: ["004", "364", "156"].map((id) => round(polygonClipping.intersection(byId(id), AREA))),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = JSON.stringify(basemap()) + "\n";
  if (process.argv.includes("--check")) {
    if (readFileSync(OUT, "utf8") !== text) {
      console.error("src/geo/basemap.json is out of date: run npx tsx scripts/build-basemap.ts");
      process.exit(1);
    }
    console.log("src/geo/basemap.json is up to date");
  } else {
    writeFileSync(OUT, text);
    console.log(`wrote src/geo/basemap.json (${(text.length / 1024).toFixed(0)} KB)`);
  }
}
