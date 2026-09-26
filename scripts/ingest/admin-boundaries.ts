/**
 * Boundaries of Pakistan's federating units for the home-page starter map.
 *
 *   npx tsx scripts/ingest/admin-boundaries.ts [--from <local copy of the Natural Earth file>]
 *
 * Source: Natural Earth 1:10m Admin 1 – States, Provinces (public domain).
 * Natural Earth still draws the former Federally Administered Tribal Areas (PK-TA) separately;
 * they were merged into Khyber Pakhtunkhwa by the Constitution (Twenty-fifth Amendment) Act 2018,
 * so this script merges the two polygons. Shapes are simplified for a small, overview-scale map.
 * Writes src/geo/pk-units.json.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from "polygon-clipping";

export const SOURCE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";
const OUT = fileURLToPath(new URL("../../src/geo/pk-units.json", import.meta.url));

/** Natural Earth ISO 3166-2 code → jurisdiction id in data/jurisdictions.yaml. */
export const UNIT_OF_ISO: Record<string, string> = {
  "PK-PB": "pk-pb",
  "PK-SD": "pk-sd",
  "PK-KP": "pk-kp",
  "PK-TA": "pk-kp", // former FATA, merged into KP (25th Amendment, 2018)
  "PK-BA": "pk-ba",
  "PK-IS": "pk-ict",
  "PK-GB": "pk-gb",
  "PK-JK": "pk-ajk",
};

const TOLERANCE = 0.01; // degrees (about 1 km): enough for an overview map
const round = (n: number) => Math.round(n * 1000) / 1000;

/** Douglas–Peucker simplification of a closed ring. */
function simplifyRing(ring: Ring): Ring {
  const pts = ring.slice(0, -1);
  if (pts.length < 8) return ring;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > max) [max, idx] = [d, i];
    }
    if (idx >= 0 && max > TOLERANCE) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = pts.filter((_, i) => keep[i]).map(([x, y]) => [round(x), round(y)] as [number, number]);
  if (out.length < 3) return ring;
  return [...out, out[0]];
}

const asMulti = (g: { type: string; coordinates: unknown }): MultiPolygon =>
  g.type === "Polygon" ? [g.coordinates as Polygon] : (g.coordinates as MultiPolygon);

export function buildUnits(ne: { features: { properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }[] }, accessed: string) {
  const byUnit = new Map<string, MultiPolygon[]>();
  const seen = new Set<string>();
  for (const f of ne.features) {
    if (f.properties.adm0_a3 !== "PAK") continue;
    const iso = String(f.properties.iso_3166_2);
    const unit = UNIT_OF_ISO[iso];
    if (!unit) throw new Error(`Unmapped Natural Earth unit ${iso} (${f.properties.name})`);
    seen.add(iso);
    byUnit.set(unit, [...(byUnit.get(unit) ?? []), asMulti(f.geometry)]);
  }
  const missing = Object.keys(UNIT_OF_ISO).filter((iso) => !seen.has(iso));
  if (missing.length) throw new Error(`Natural Earth file lacks ${missing.join(", ")}`);
  const features = [...byUnit].map(([id, parts]) => {
    const merged = parts.length > 1 ? polygonClipping.union(parts[0], ...parts.slice(1)) : parts[0];
    const simplified = merged.map((poly) => poly.map(simplifyRing)).filter((poly) => poly[0].length >= 4);
    return { type: "Feature" as const, properties: { id }, geometry: { type: "MultiPolygon" as const, coordinates: simplified } };
  });
  features.sort((a, b) => a.properties.id.localeCompare(b.properties.id));
  return {
    type: "FeatureCollection" as const,
    metadata: {
      source: "Natural Earth 1:10m Admin 1 – States, Provinces",
      url: SOURCE_URL,
      licence: "Public domain",
      licence_url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/LICENSE.md",
      merger_source: { title: "APP — President signs 25th Constitutional Amendment, formally merging FATA with KP", url: "https://www.app.com.pk/national/president-signs-25th-constitutional-amendment-formally-merging-fata-kp/" },
      accessed,
      processing: `Pakistan only; former FATA (PK-TA) merged into Khyber Pakhtunkhwa per the Constitution (Twenty-fifth Amendment) Act 2018; Douglas–Peucker simplification at ${TOLERANCE}°; coordinates rounded to 0.001°.`,
      note: "Overview-scale shapes for navigation, not for measurement. The disputed territory of Jammu and Kashmir is drawn separately by src/ui/pakistan-map.ts.",
    },
    features,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const from = process.argv.indexOf("--from");
  const text = from > 0 ? readFileSync(process.argv[from + 1], "utf8") : await (await fetch(SOURCE_URL)).text();
  const accessed = new Date().toISOString().slice(0, 10);
  const out = buildUnits(JSON.parse(text), accessed);
  mkdirSync(fileURLToPath(new URL("../../src/geo/", import.meta.url)), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out) + "\n");
  const pts = out.features.reduce((n, f) => n + f.geometry.coordinates.flat(2).length, 0);
  console.log(`wrote src/geo/pk-units.json: ${out.features.length} units, ${pts} points, ${Buffer.byteLength(JSON.stringify(out))} bytes`);
}
