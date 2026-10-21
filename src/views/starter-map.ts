/**
 * Home-page starter map: the Federation and its seven units (four provinces, the federal
 * capital, Gilgit-Baltistan and AJK). Click or tab to a unit to see what it is, who leads it and
 * where to drill down. Drawn on the official-map base (src/ui/pakistan-map.ts), so the disputed
 * territory of Jammu and Kashmir is shown as on the Government of Pakistan's political map.
 * Every explanation comes from the data: the unit's government body, its heads and its counts.
 */
import type { MultiPolygon } from "../ui/pakistan-map.ts";
import units from "../geo/pk-units.json";
import { esc, html, raw, type Raw } from "../ui/dom.ts";
import { pakistanBaseMap } from "../ui/pakistan-map.ts";
import { legalList, link, type Ctx } from "./common.ts";
import { TIERS, TIER_GOVT, TIER_HEADS } from "./tiers.ts";

const KIND: Record<string, string> = {
  country: "The Federation",
  province: "Province",
  federal_capital: "Federal capital territory",
  special_territory: "Territory",
};

/** Label placement nudges (px) where the centroid would collide with the base map's own labels. */
const LABEL_NUDGE: Record<string, [number, number]> = { "pk-pb": [8, 0], "pk-ba": [-10, 0] };
/** Fixed label positions (lon, lat) and line breaks for units whose centroid label would clash. */
const LABEL_AT: Record<string, { at: [number, number]; lines: string[] }> = { "pk-kp": { at: [71.2, 34.4], lines: ["Khyber", "Pakhtunkhwa"] } };
/** GB and AJK are already labelled by the base map. */
const BASE_LABELLED = new Set(["pk-gb", "pk-ajk"]);

/** Where to drill down from each unit: [label, id or href]. */
function drillLinks(ctx: Ctx, t: string): [string, string][] {
  const { ix } = ctx;
  if (t === "pk")
    return [
      ["Prime Minister's Office", "fed-pm-office"],
      ["Federal Cabinet", "fed-cabinet"],
      ["National Assembly", "fed-national-assembly"],
      ["Senate", "fed-senate"],
      ["Supreme Court", "fed-supreme-court"],
    ].filter(([, id]) => ix.org.has(id)) as [string, string][];
  const out: [string, string][] = [["Government", TIER_GOVT[t]]];
  const assembly = ix.g.organizations.find((o) => o.kind === "legislature" && o.jurisdiction === t);
  if (assembly) out.push(["Assembly", assembly.id]);
  const cabinet = ix.g.organizations.find((o) => o.kind === "cabinet" && o.jurisdiction === t);
  if (cabinet) out.push(["Cabinet", cabinet.id]);
  out.push(["Divisions and districts", `#/place/${t}`]);
  return out.filter(([, id]) => id.startsWith("#") || ix.org.has(id));
}

function seatsOf(ctx: Ctx, t: string) {
  const { ix } = ctx;
  const houses = ix.g.organizations.filter((o) => (o.kind === "legislature" || o.kind === "chamber") && o.jurisdiction === t);
  return houses.reduce((n, o) => n + (ix.postsByOrg.get(o.id) ?? []).filter((p) => p.id.startsWith("seat-")).reduce((s, p) => s + (p.seats ?? 1), 0), 0);
}

function unitPanel(ctx: Ctx, t: string, selected: boolean): Raw {
  const { ix } = ctx;
  const place = ix.place.get(t)!;
  const gov = ix.org.get(TIER_GOVT[t]);
  const name = t === "pk" ? "Federal Government" : place.name;
  const bodies = t === "pk" ? ix.g.organizations.filter((o) => o.jurisdiction === "pk" && !o.abolished).length : ix.g.organizations.filter((o) => ix.tierOf(o.jurisdiction)?.id === t && !o.abolished).length;
  const divisions = ix.g.jurisdictions.filter((j) => j.kind === "division" && ix.placeTrail(j.id)[1]?.id === t).length;
  const districts = ix.g.jurisdictions.filter((j) => j.kind === "district" && ix.placeTrail(j.id)[1]?.id === t).length;
  const seats = seatsOf(ctx, t);
  const facts = [
    `${bodies} bodies`,
    divisions ? `${divisions} divisions` : "",
    districts ? `${districts} districts` : "",
    seats ? `${seats.toLocaleString("en-US")} elected seats` : "",
    place.capital ? `Capital: ${place.capital}` : "",
  ].filter(Boolean);
  const heads = TIER_HEADS[t] ?? [];
  return html`<div class="unit-panel" data-panel="${t}" ${selected ? "" : "hidden"}>
    <div class="eyebrow">${KIND[place.kind] ?? place.kind}</div>
    <h3>${gov ? link(ix, gov.id, name) : name}</h3>
    ${place.name_ur ? html`<div class="urdu" lang="ur">${t === "pk" ? ix.org.get("fed-federation")?.name_ur ?? place.name_ur : place.name_ur}</div>` : ""}
    ${gov?.description ? html`<p>${gov.description}</p>` : ""}
    ${gov?.legal_basis?.length ? html`<div class="hint">Legal basis: ${legalList(ix, gov.legal_basis)}</div>` : ""}
    ${heads.length
      ? html`<dl>${heads.map(([label, pid]) => {
          const h = ix.effectiveHolders(pid)[0];
          return html`<dt>${ix.post.has(pid) ? link(ix, pid, label) : label}</dt><dd>${h ? link(ix, h.person.id) : html`<span class="hint">not recorded</span>`}</dd>`;
        })}</dl>`
      : ""}
    <div class="hint num">${facts.join(" · ")}</div>
    <div class="btnrow">${drillLinks(ctx, t).map(([label, target], i) =>
      target.startsWith("#") ? html`<a class="btn ${i ? "ghost" : ""}" href="${target}">${label}</a>` : html`<a class="btn ${i ? "ghost" : ""}" href="#/org/${target}">${label}</a>`,
    )}</div>
  </div>`;
}

export function starterMap(ctx: Ctx, initial = "pk"): { body: Raw; mount: (root: HTMLElement) => void } {
  const { ix } = ctx;
  const W = 520;
  const H = 500;
  const base = pakistanBaseMap(W, H);
  const shapes = (units.features as unknown as { properties: { id: string }; geometry: { coordinates: MultiPolygon } }[]).filter((f) => TIERS.includes(f.properties.id));
  const nameOf = (t: string) => esc(t === "pk" ? "Federal Government" : ix.place.get(t)?.name ?? t);
  const paths = shapes
    .map((f) => {
      const t = f.properties.id;
      return `<path class="unit${t === initial ? " on" : ""}" data-unit="${esc(t)}" d="${base.draw(f.geometry.coordinates)}" tabindex="0" role="button" aria-label="${nameOf(t)}" aria-pressed="${t === initial}"><title>${nameOf(t)}</title></path>`;
    })
    .join("");
  const labels = shapes
    .filter((f) => !BASE_LABELLED.has(f.properties.id))
    .map((f) => {
      const t = f.properties.id;
      const [x, y] = base.centroid(f.geometry.coordinates);
      if (t === "pk-ict")
        return `<g class="unit-marker" data-unit="${t}" aria-hidden="true"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/><text x="${(x + 8).toFixed(1)}" y="${(y + 4).toFixed(1)}">Islamabad</text></g>`;
      const fixed = LABEL_AT[t];
      if (fixed) {
        const [lx, ly] = base.project(fixed.at);
        return `<text class="unit-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" aria-hidden="true">${fixed.lines.map((l, i) => `<tspan x="${lx.toFixed(1)}" dy="${i ? "1.15em" : "0"}">${esc(l)}</tspan>`).join("")}</text>`;
      }
      const [dx, dy] = LABEL_NUDGE[t] ?? [0, 0];
      return `<text class="unit-label" x="${(x + dx).toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="middle" aria-hidden="true">${nameOf(t)}</text>`;
    })
    .join("");
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Map of Pakistan's federating units. Select a unit to learn about it.">${base.svgDefs}${base.shapes}<g class="units">${paths}</g><g class="base-labels">${base.labels}</g>${labels}</svg>`;

  const body = html`<div class="starter" data-starter>
    <div class="starter-map">
      <div class="chips" role="group" aria-label="Choose a government">${TIERS.map(
        (t) => html`<button type="button" class="chip-btn" data-unit="${t}" aria-pressed="${String(t === initial)}">${t === "pk" ? "Federal" : ix.place.get(t)?.name ?? t}</button>`,
      )}</div>
      <div class="mapbox">${raw(svg) /* safe: names pass through esc(); ids are from the fixed TIERS list; paths are numeric */}</div>
      <p class="hint small">Drawn to the conventions of the Government of Pakistan's official political map: Indian Illegally Occupied Jammu &amp; Kashmir is shown as disputed territory. <a href="#/map">Full map and notes</a></p>
    </div>
    <div class="starter-panel" aria-live="polite">${TIERS.map((t) => unitPanel(ctx, t, t === initial))}</div>
  </div>`;

  const mount = (root: HTMLElement) => {
    const box = root.querySelector<HTMLElement>("[data-starter]");
    if (!box) return;
    const select = (t: string) => {
      box.querySelectorAll<HTMLElement>("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== t));
      box.querySelectorAll<Element>("[data-unit]").forEach((el) => {
        const on = (el as HTMLElement).dataset.unit === t;
        el.classList.toggle("on", on);
        if (el.hasAttribute("aria-pressed")) el.setAttribute("aria-pressed", String(on));
      });
      box.classList.toggle("fed", t === "pk");
    };
    box.addEventListener("click", (e) => {
      const el = (e.target as Element).closest<HTMLElement>("[data-unit]");
      if (el) select(el.dataset.unit!);
    });
    box.addEventListener("keydown", (e) => {
      const el = (e.target as Element).closest<HTMLElement>("path[data-unit]");
      if (el && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        select(el.dataset.unit!);
      }
    });
    select(initial);
  };
  return { body, mount };
}
