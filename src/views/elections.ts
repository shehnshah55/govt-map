/**
 * Elections and census (#/elections): ECP results added up by district, beside PBS census figures,
 * and the change between two elections. The method is in src/lib/vote-explorer.ts and is spelled
 * out on the page, so every number can be traced. The page exists only once data/results/ holds
 * results; the data loads on first visit, as separate same-origin files.
 */
import { byDistrict, byUnit, joinCensus, partyKey, leaderFlows, leaderOf, measureOf, shift, sumRows, toCsv, topParties, weightedFit, type ByDistrict, type Indicator, type Measure, type PartyKey, type Tally } from "../lib/vote-explorer.ts";
import pkUnits from "../geo/pk-units.json";
import { pakistanBaseMap, type MultiPolygon } from "../ui/pakistan-map.ts";
import type { CensusFile, ResultsFile } from "../schema.ts";
import { safeHref } from "../lib/safe-url.ts";
import { esc, html, raw, type Raw } from "../ui/dom.ts";
import { wireFilters } from "./entities.ts";
import type { Ctx, View } from "./common.ts";

const resultFiles = import.meta.glob<ResultsFile>("../../data/results/*.json", { import: "default" });
const censusFiles = import.meta.glob<CensusFile>("../../data/census/*.json", { import: "default" });

/** True once any results are in data/results/; until then the page and its menu link don't exist. */
export const hasElectionData = Object.keys(resultFiles).length > 0;

export interface ElectionData {
  results: ResultsFile[];
  census: CensusFile[];
}

export async function loadElectionData(): Promise<ElectionData> {
  const [results, census] = await Promise.all([Promise.all(Object.values(resultFiles).map((l) => l())), Promise.all(Object.values(censusFiles).map((l) => l()))]);
  return { results, census };
}

const HOUSE: Record<string, string> = { na: "National Assembly", pp: "Punjab Assembly", ps: "Sindh Assembly", pk: "Khyber Pakhtunkhwa Assembly", pb: "Balochistan Assembly" };
const INDICATOR: Record<Indicator, string> = { literacy_pct: "Literacy", urban_pct: "Urban population" };
const yearOf = (election: string) => election.replace(/^ge-/, "");
const n0 = (n: number) => Math.round(n).toLocaleString("en-US");
const p1 = (n: number) => `${n.toFixed(1)}%`;
const pp = (n: number) => `${n > 0 ? "▲ +" : n < 0 ? "▼ −" : ""}${Math.abs(n).toFixed(1)} pts`;

export function partyLabel(ctx: Ctx, key: PartyKey): string {
  if (key === "independent") return "Independent";
  if (key.startsWith("name:")) return key.slice(5);
  const o = ctx.ix.org.get(key);
  return o?.short_name ?? o?.name ?? key;
}

const districtName = (ctx: Ctx, id: string) => ctx.ix.place.get(id)?.name ?? id;
const provinceOf = (ctx: Ctx, id: string) => ctx.ix.placeTrail(id)[1];

/** Parties worth a measure option: 1% of valid votes nationally, plus independents if any. */
function partyOptions(d: ByDistrict): PartyKey[] {
  return [...d.national.votes]
    .filter(([k, v]) => k === "independent" || v >= d.national.valid / 100)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

const measureLabel = (ctx: Ctx, m: Measure) => (m === "turnout" ? "Turnout" : `${partyLabel(ctx, m.party)} share of valid votes`);

/** Scatter of a census figure (x) against the measure (y), one circle per district sized by registered voters. */
function scatter(ctx: Ctx, points: { id: string; x: number; y: number; w: number }[], xLabel: string, yLabel: string): Raw {
  const W = 640;
  const H = 380;
  const m = { t: 16, r: 16, b: 44, l: 52 };
  const lo = (v: number[]) => Math.max(0, Math.floor(Math.min(...v) / 10) * 10);
  const hi = (v: number[]) => Math.min(100, Math.ceil(Math.max(...v) / 10) * 10);
  const [x0, x1] = [lo(points.map((p) => p.x)), Math.max(lo(points.map((p) => p.x)) + 10, hi(points.map((p) => p.x)))];
  const [y0, y1] = [lo(points.map((p) => p.y)), Math.max(lo(points.map((p) => p.y)) + 10, hi(points.map((p) => p.y)))];
  const sx = (v: number) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r);
  const sy = (v: number) => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);
  const wMax = Math.max(...points.map((p) => p.w));
  const fit = weightedFit(points);
  const ticks = (a: number, b: number) => Array.from({ length: Math.floor((b - a) / 10) + 1 }, (_, i) => a + i * 10);
  // safe: every value below is a number formatted here, or a name passed through html``
  const grid = raw(
    ticks(x0, x1).map((t) => `<line class="grid" x1="${sx(t).toFixed(1)}" x2="${sx(t).toFixed(1)}" y1="${m.t}" y2="${H - m.b}"/><text class="tick" x="${sx(t).toFixed(1)}" y="${H - m.b + 16}" text-anchor="middle">${t}%</text>`).join("") +
      ticks(y0, y1).map((t) => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${sy(t).toFixed(1)}" y2="${sy(t).toFixed(1)}"/><text class="tick" x="${m.l - 6}" y="${(sy(t) + 4).toFixed(1)}" text-anchor="end">${t}%</text>`).join(""),
  );
  const line = fit ? raw(`<line class="fit" x1="${sx(x0).toFixed(1)}" y1="${sy(fit.intercept + fit.slope * x0).toFixed(1)}" x2="${sx(x1).toFixed(1)}" y2="${sy(fit.intercept + fit.slope * x1).toFixed(1)}"/>`) : "";
  return html`<figure class="chart scatter-chart">
    <figcaption><span class="chart-title">${yLabel} against ${xLabel.toLowerCase()}, by district</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${`Scatter plot of ${yLabel} against ${xLabel}, one circle per district. The table below lists the same figures.`}">
      <defs><clipPath id="scatter-clip"><rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/></clipPath></defs>
      ${grid}<g clip-path="url(#scatter-clip)">${line}</g>
      ${points
        .sort((a, b) => b.w - a.w)
        .map(
          (p) => html`<a href="#/place/${p.id}" data-card-id="${p.id}"><circle class="dot" cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="${(3 + 11 * Math.sqrt(p.w / wMax)).toFixed(1)}"><title>${`${districtName(ctx, p.id)}: ${xLabel} ${p1(p.x)}, ${yLabel} ${p1(p.y)}, ${n0(p.w)} registered voters`}</title></circle></a>`,
        )}
      <text class="axis" x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle">${xLabel} (census)</text>
      <text class="axis" transform="rotate(-90)" x="${-(m.t + H - m.b) / 2}" y="14" text-anchor="middle">${yLabel}</text>
    </svg>
    <p class="chart-basis">${
      fit
        ? `Line: least-squares fit weighted by registered voters, over ${fit.n} districts; correlation r = ${fit.r.toFixed(2)}. A correlation describes these districts together; it does not say why voters voted as they did, nor how any one person voted.`
        : "Too few districts with both figures to draw a fit."
    } Circle size: registered voters.</p>
  </figure>`;
}

/** Minimum registered voters a district must have to be shown (their "min votes" filter). */
const MIN_REGISTERED = [0, 100_000, 250_000, 500_000, 1_000_000];

/** Everything the page shows for one address: the file, the measure and the filtered rows. */
export function selection(ctx: Ctx, data: ElectionData, params: URLSearchParams) {
  const houses: string[] = [...new Set(data.results.map((r) => r.house))];
  const h = houses.includes(params.get("h") ?? "") ? params.get("h")! : houses.includes("na") ? "na" : houses[0];
  const files = data.results.filter((r) => r.house === h).sort((a, b) => a.election.localeCompare(b.election));
  const file = files.find((f) => f.election === params.get("e")) ?? files[files.length - 1];
  const d = byDistrict(file);
  const parties = partyOptions(d);
  const mp = params.get("m");
  const measure: Measure = mp && parties.includes(mp) ? { party: mp } : "turnout";
  const census = [...data.census].sort((a, b) => b.census.localeCompare(a.census))[0];
  const indicators = (["literacy_pct", "urban_pct"] as Indicator[]).filter((k) => census?.districts.some((c) => c[k] !== undefined));
  const xi = indicators.includes(params.get("x") as Indicator) ? (params.get("x") as Indicator) : indicators[0];
  const provinces = [...new Set(d.rows.map((r) => provinceOf(ctx, r.district)?.id).filter(Boolean))] as string[];
  const prov = provinces.includes(params.get("prov") ?? "") ? params.get("prov")! : "";
  const min = MIN_REGISTERED.includes(Number(params.get("min"))) ? Number(params.get("min")) : 0;
  const num = (k: string, dflt: number) => {
    const v = Number(params.get(k));
    return params.has(k) && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : dflt;
  };
  const [lo, hi] = [num("lo", 0), num("hi", 100)].sort((a, b) => a - b);
  const ranged = !!xi && (lo > 0 || hi < 100);
  const keep = (district: string, registered: number, c?: CensusFile["districts"][number]) =>
    (!prov || provinceOf(ctx, district)?.id === prov) && registered >= min && (!ranged || (c?.[xi] !== undefined && c[xi]! >= lo && c[xi]! <= hi));
  const joined = joinCensus(d, census).filter((j) => keep(j.row.district, j.row.registered, j.census));
  const earlier = files.filter((f) => f.election < file.election).pop();
  const byDist = new Map(census?.districts.map((c) => [c.district, c]));
  const sh = earlier ? shift(byDistrict(earlier), d, measure) : undefined;
  const shRows = sh?.rows.filter((r) => keep(r.district, r.registered, byDist.get(r.district))) ?? [];
  const filtered = !!prov || min > 0 || ranged;
  return { houses, h, files, file, d, parties, measure, census, indicators, xi, provinces, prov, min, lo, hi, ranged, joined, earlier, sh, shRows, filtered };
}

type Sel = ReturnType<typeof selection>;

/** The district table as CSV, with the same filters as the page. */
export function districtCsv(ctx: Ctx, data: ElectionData, params: URLSearchParams): string {
  const s = selection(ctx, data, params);
  const header = ["district_id", "district", "province", "constituencies", "registered", "polled", "valid", "rejected", "turnout_pct", "most_votes", "most_votes_pct"];
  if (s.measure !== "turnout") header.push(`${partyLabel(ctx, s.measure.party)}_pct`);
  if (s.xi) header.push(s.xi);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return toCsv(
    header,
    s.joined.map(({ row, census: c }) => [
      row.district,
      districtName(ctx, row.district),
      provinceOf(ctx, row.district)?.name ?? "",
      row.constituencies.join(" "),
      row.registered,
      row.polled,
      row.valid,
      row.rejected,
      r1(row.turnoutPct),
      partyLabel(ctx, row.leader),
      r1(row.leaderPct),
      ...(s.measure !== "turnout" ? [r1(measureOf(row, s.measure))] : []),
      ...(s.xi ? [c?.[s.xi] ?? ""] : []),
    ]),
  );
}

/** The detail card for one district or province, shown on hover, focus or tap (their "magnifier"). */
function card(ctx: Ctx, id: string, name: string, t: Tally & { turnoutPct: number }, extra: Raw | string = ""): Raw {
  return html`<template data-card="${id}"><div class="eyebrow">${name}</div>
    <dl class="facts compact"><dt>Registered</dt><dd class="num">${n0(t.registered)}</dd><dt>Turnout</dt><dd class="num">${p1(t.turnoutPct)}</dd></dl>
    <ol class="card-parties">${topParties(t).map((p) => html`<li><span>${partyLabel(ctx, p.party)}</span> <span class="num">${p1(p.pct)}</span></li>`)}</ol>${extra}</template>`;
}

/** Province map: each unit shaded by the measure in five even steps, its value written on it. */
function provinceMap(ctx: Ctx, s: Sel): Raw {
  const units = byUnit(s.file, (c) => ctx.ix.placeTrail(c)[1]?.id);
  if (!units.size) return raw("");
  const W = 520;
  const H = 500;
  const base = pakistanBaseMap(W, H);
  const shapes = (pkUnits.features as unknown as { properties: { id: string }; geometry: { coordinates: MultiPolygon } }[]).filter((f) => f.properties.id !== "pk");
  const values = [...units.values()].map((t) => measureOf(t, s.measure));
  const [vmin, vmax] = [Math.min(...values), Math.max(...values)];
  const step = (v: number) => (vmax - vmin < 1e-9 ? 2 : Math.min(4, Math.floor(((v - vmin) / (vmax - vmin)) * 5)));
  const name = (id: string) => ctx.ix.place.get(id)?.name ?? id;
  // safe: ids come from the fixed shapes file, names and numbers pass through esc(), paths are numeric
  const paths = shapes
    .map((f) => {
      const id = f.properties.id;
      const t = units.get(id);
      const cls = t ? `unit q${step(measureOf(t, s.measure))}${s.prov === id ? " on" : ""}` : "unit none";
      const label = t ? `${name(id)}: ${p1(measureOf(t, s.measure))}` : `${name(id)}: no seats in this house`;
      return t
        ? `<path class="${cls}" d="${base.draw(f.geometry.coordinates)}" data-unit="${esc(id)}" data-card-id="${esc(id)}" tabindex="0" role="button" aria-pressed="${s.prov === id}" aria-label="${esc(label)}. Select to show its districts."><title>${esc(label)}</title></path>`
        : `<path class="${cls}" d="${base.draw(f.geometry.coordinates)}"><title>${esc(label)}</title></path>`;
    })
    .join("");
  const labels = shapes
    .filter((f) => units.has(f.properties.id))
    .map((f) => {
      const [x, y] = base.centroid(f.geometry.coordinates);
      const id = f.properties.id;
      return `<text class="unit-value" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" aria-hidden="true">${esc(p1(measureOf(units.get(id)!, s.measure)))}</text>`;
    })
    .join("");
  const legend = Array.from({ length: 5 }, (_, i) => vmin + ((vmax - vmin) * i) / 5);
  return html`<figure class="chart el-map">
    <figcaption><span class="chart-title">${measureLabel(ctx, s.measure)} by province and territory, ${yearOf(s.file.election)}</span></figcaption>
    <div class="mapbox">${raw(`<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Map of ${esc(measureLabel(ctx, s.measure))} by province. Select a province to show only its districts. The table below lists the same figures.">${base.svgDefs}${base.shapes}<g class="units">${paths}</g>${labels}</svg>`)}</div>
    <div class="legend" aria-hidden="true">${legend.map((v, i) => html`<span><i class="sw q${i}"></i>${p1(v)}+</span>`)}<span><i class="sw none"></i>No seats in this house</span></div>
    <div class="tablewrap" tabindex="0" role="region" aria-label="Results by province and territory"><table class="num-table compact">
      <thead><tr><th>Province or territory</th><th>Registered</th><th>Turnout</th><th>Most votes</th>${s.measure === "turnout" ? "" : html`<th>${measureLabel(ctx, s.measure)}</th>`}</tr></thead>
      <tbody>${[...units].sort((a, b) => b[1].registered - a[1].registered).map(
        ([id, t]) => html`<tr><td><a href="#/elections?${withParam(s, "prov", id)}">${name(id)}</a></td><td class="num">${n0(t.registered)}</td><td class="num">${p1(t.turnoutPct)}</td><td>${partyLabel(ctx, t.leader)} <span class="hint num">${p1(t.leaderPct)}</span></td>${s.measure === "turnout" ? "" : html`<td class="num">${p1(measureOf(t, s.measure))}</td>`}</tr>`,
      )}</tbody>
    </table></div>
    <p class="chart-basis">Every constituency lies in one province or territory, so these add up to the national figures. Shading is in five even steps between the lowest and highest value shown; the value is written on each unit.</p>
    ${[...units].map(([id, t]) => card(ctx, id, name(id), t))}
  </figure>`;
}

/** The current address with one filter changed (the province links). */
function withParam(s: Sel, key: string, value: string): string {
  const p = new URLSearchParams({ h: s.h, e: s.file.election });
  if (s.measure !== "turnout") p.set("m", s.measure.party);
  if (s.xi) p.set("x", s.xi);
  if (s.min) p.set("min", String(s.min));
  if (s.ranged) {
    p.set("lo", String(s.lo));
    p.set("hi", String(s.hi));
  }
  p.set(key, value);
  return p.toString();
}

/** One arrow per district from the earlier value to the later one, width by registered voters. */
function arrow(before: number, after: number, registered: number, maxReg: number, [a, b]: [number, number]): Raw {
  const W = 160;
  const x = (v: number) => 6 + ((v - a) / Math.max(1e-9, b - a)) * (W - 12);
  const w = (1.2 + 3.8 * Math.sqrt(registered / maxReg)).toFixed(1);
  const [x0, x1] = [x(before), x(after)];
  const dir = after > before ? 1 : -1;
  // safe: numbers only
  return raw(
    Math.abs(x1 - x0) < 1
      ? `<svg class="arrow" viewBox="0 0 ${W} 14" aria-hidden="true"><circle cx="${x1.toFixed(1)}" cy="7" r="3"/></svg>`
      : `<svg class="arrow" viewBox="0 0 ${W} 14" aria-hidden="true"><line x1="${x0.toFixed(1)}" y1="7" x2="${(x1 - dir * 5).toFixed(1)}" y2="7" stroke-width="${w}"/><path d="M${x1.toFixed(1)} 7 l${(-dir * 7).toFixed(1)} -5 v10 z"/></svg>`,
  );
}

/** The page body for loaded data; pure, so it can be tested without a browser. */
export function electionsBody(ctx: Ctx, data: ElectionData, params: URLSearchParams): Raw {
  const s = selection(ctx, data, params);
  const { d, file, measure, census, xi, earlier, sh } = s;
  const yLabel = measureLabel(ctx, measure);
  const points = xi ? s.joined.filter((j) => j.census?.[xi] !== undefined).map((j) => ({ id: j.row.district, x: j.census![xi]!, y: measureOf(j.row, measure), w: j.row.registered })) : [];
  const relative = params.get("cmp") === "relative";
  const spanVotes = d.spanning.reduce((n, r) => n + r.polled, 0);
  const shown = sumRows(s.joined.map((j) => j.row));
  const [lead, leadN] = leaderOf(shown.votes);
  const option = (v: string, label: string, on: boolean) => html`<option value="${v}" ${on ? raw("selected") : ""}>${label}</option>`;
  const span = s.shRows.flatMap((r) => [r.before, r.after]);
  const scale: [number, number] = span.length ? [Math.floor(Math.min(...span) / 10) * 10, Math.ceil(Math.max(...span) / 10) * 10] : [0, 100];
  const maxReg = Math.max(1, ...s.shRows.map((r) => r.registered));
  const flows = sh ? leaderFlows(s.shRows) : [];
  const fromKeys = [...new Set(flows.map((f) => f.from))];
  const toKeys = [...new Set(flows.map((f) => f.to))];
  const cell = (a: string, b: string) => flows.find((f) => f.from === a && f.to === b);

  return html`<div class="stack">
    <div class="toolbar filters" data-el-controls>
      <label>House <select id="el-h">${s.houses.map((x) => option(x, HOUSE[x], x === s.h))}</select></label>
      <label>Election <select id="el-e">${s.files.map((f) => option(f.election, yearOf(f.election), f === file))}</select></label>
      <label>Measure <select id="el-m">${option("turnout", "Turnout", measure === "turnout")}${s.parties.map((k) => option(k, `${partyLabel(ctx, k)} share`, measure !== "turnout" && measure.party === k))}</select></label>
      ${s.indicators.length ? html`<label>Census figure <select id="el-x">${s.indicators.map((k) => option(k, INDICATOR[k], k === xi))}</select></label>` : ""}
    </div>

    <dl class="facts el-national">
      <dt>Registered voters</dt><dd class="num">${n0(d.national.registered)}</dd>
      <dt>Votes polled</dt><dd class="num">${n0(d.national.polled)} (turnout ${p1(d.national.turnoutPct)})</dd>
      <dt>Valid votes</dt><dd class="num">${n0(d.national.valid)}; rejected ${n0(d.national.rejected)}</dd>
      <dt>Constituencies counted</dt><dd class="num">${d.national.constituencies}${d.notHeld.length ? `, plus ${d.notHeld.length} where the poll was not held or not completed` : ""}</dd>
      <dt>Source</dt><dd><a href="${safeHref(file.results[0].source.url)}" target="_blank" rel="noopener noreferrer">Election Commission of Pakistan</a>${file.totals ? html`; totals checked against the <a href="${safeHref(file.totals.source.url)}" target="_blank" rel="noopener noreferrer">ECP's published totals</a>` : ""}. Checked ${file.checked}.</dd>
    </dl>

    <details class="panel how-to-read">
      <summary>How to read these figures</summary>
      <ul>
        <li><b>Turnout</b> is votes polled ÷ registered voters, as the ECP publishes it. <b>Party shares</b> are out of valid votes.</li>
        <li><b>National and provincial figures</b> count every constituency in the ECP results. <b>District figures</b> add up the constituencies that lie wholly in one district. ${d.spanning.length ? `${d.spanning.length} constituencies cover more than one district (${n0(spanVotes)} votes polled); they are in the national and provincial figures but not split between districts by guesswork, so district totals add up to less.` : "Every constituency here lies in one district."}</li>
        <li><b>Filters</b> (province, minimum registered voters, census range) narrow the districts shown in the chart, the tables, the summary and the CSV. The national figures above always count everything.</li>
        <li><b>Independents</b> are shown as the ECP lists them. Any party a candidate is reported to be backed by is not part of ECP results and is not inferred here.</li>
        <li><b>Census figures</b> are PBS's${census ? ` ${census.census} census` : ""} district figures${census?.definitions.literacy_pct ? `. Literacy: ${census.definitions.literacy_pct}` : ""}${census?.definitions.urban_pct ? `. Urban: ${census.definitions.urban_pct}` : ""}.</li>
        <li>This is a way to explore official figures, not a substitute for the ECP's results.</li>
      </ul>
    </details>

    ${provinceMap(ctx, s)}

    <div class="toolbar filters" data-el-filters>
      <span class="hint">Show districts:</span>
      <label>Province <select id="el-prov"><option value="">All</option>${s.provinces.map((p) => option(p, ctx.ix.place.get(p)?.name ?? p, p === s.prov))}</select></label>
      <label>At least <select id="el-min">${MIN_REGISTERED.map((n) => option(String(n), n ? `${n0(n)} registered` : "any size", n === s.min))}</select></label>
      ${
        xi
          ? html`<fieldset class="dual-range"><legend>${INDICATOR[xi]} between</legend>
              <label><span class="visually-hidden">${INDICATOR[xi]} from</span><input type="range" id="el-lo" min="0" max="100" step="5" value="${s.lo}" /></label>
              <label><span class="visually-hidden">${INDICATOR[xi]} to</span><input type="range" id="el-hi" min="0" max="100" step="5" value="${s.hi}" /></label>
              <output class="num" for="el-lo el-hi">${s.lo}–${s.hi}%</output></fieldset>`
          : ""
      }
      ${s.filtered ? html`<a class="chip-btn" href="#/elections?${new URLSearchParams({ h: s.h, e: file.election, ...(measure !== "turnout" ? { m: measure.party } : {}), ...(xi ? { x: xi } : {}) })}">Show all districts</a>` : ""}
    </div>
    <p class="hint num el-shown">${
      s.filtered
        ? `Shown: ${s.joined.length} of ${d.rows.length} districts, ${n0(shown.registered)} registered voters, turnout ${p1(shown.turnoutPct)}, most votes ${lead ? `${partyLabel(ctx, lead)} (${p1((100 * leadN) / Math.max(1, shown.valid))})` : "none"}. Districts shown only; the national figures above count every constituency.`
        : `${d.rows.length} districts.`
    }</p>

    ${points.length >= 3 ? scatter(ctx, points, INDICATOR[xi], yLabel) : census ? html`<p class="hint">Fewer than three districts shown have census figures, so there is no chart.</p>` : html`<p class="hint">Census figures are not loaded yet, so there is no comparison with literacy or urbanisation.</p>`}

    <section>
      <h2>By district</h2>
      <div class="toolbar filters">
        <input type="search" data-filter="el" placeholder="Filter by district or party" aria-label="Filter districts" />
        <span class="hint num" data-count="el">${s.joined.length} districts</span>
        <button type="button" class="btn ghost" id="el-csv">Download CSV</button>
      </div>
      <div class="tablewrap" tabindex="0" role="region" aria-label="Results by district"><table data-rows="el" class="num-table">
        <thead><tr><th>District</th><th>Province</th><th>Registered</th><th>Turnout</th><th>Most votes</th>${measure === "turnout" ? "" : html`<th>${yLabel}</th>`}${xi ? html`<th>${INDICATOR[xi]}</th>` : ""}</tr></thead>
        <tbody>${s.joined.map(
          ({ row, census: c }) => html`<tr>
            <td><a href="#/place/${row.district}">${districtName(ctx, row.district)}</a><div class="hint">${row.constituencies.length} constituenc${row.constituencies.length === 1 ? "y" : "ies"}</div></td>
            <td>${provinceOf(ctx, row.district)?.name ?? ""}</td>
            <td class="num">${n0(row.registered)}</td>
            <td class="num">${p1(row.turnoutPct)}</td>
            <td>${partyLabel(ctx, row.leader)} <span class="hint num">${p1(row.leaderPct)}</span></td>
            ${measure === "turnout" ? "" : html`<td class="num">${p1(measureOf(row, measure))}</td>`}
            ${xi ? html`<td class="num">${c?.[xi] !== undefined ? p1(c[xi]!) : html`<span class="hint">not in census file</span>`}</td>` : ""}
          </tr>`,
        )}</tbody>
      </table></div>
      ${d.spanning.length ? html`<p class="hint">Not in any district row (they cover more than one district): ${d.spanning.map((r) => ctx.ix.place.get(r.constituency)?.name ?? r.constituency).join(", ")}.</p>` : ""}
      ${d.notHeld.length ? html`<p class="hint">Not counted: ${d.notHeld.map((r) => `${ctx.ix.place.get(r.constituency)?.name ?? r.constituency} (${r.not_held})`).join("; ")}.</p>` : ""}
      ${s.joined.map(({ row, census: c }) => card(ctx, row.district, districtName(ctx, row.district), row, xi && c?.[xi] !== undefined ? html`<p class="hint">${INDICATOR[xi]}: ${p1(c[xi]!)} (census ${census!.census})</p>` : ""))}
    </section>

    ${
      sh && earlier
        ? html`<section>
            <h2>Change since ${yearOf(earlier.election)}</h2>
            <p class="lede small">${yLabel}: ${p1(sh.nationalBefore)} in ${yearOf(earlier.election)}, ${p1(sh.nationalAfter)} in ${yearOf(file.election)} (${pp(sh.nationalAfter - sh.nationalBefore)} nationally).
              Constituencies were redrawn after the 2023 census, so the two elections are compared through the districts they share.</p>
            <div class="toolbar filters">
              <label>Show change <select id="el-cmp">${option("raw", "as measured", !relative)}${option("relative", "relative to the national change", relative)}</select></label>
              <label>Most votes <select data-filter="sh" data-facet="flip" id="sh-flip"><option value="">Any</option><option value="changed">Changed party</option><option value="same">Same party</option></select></label>
              <span class="hint num" data-count="sh">${s.shRows.length} districts</span>
            </div>
            <p class="hint">${relative ? "Change column: the district's change minus the national change, so a district that moved with the country shows about zero. Arrows always run from the earlier value to the later one." : "Change column: the district's own change, in percentage points."} Each arrow runs from ${yearOf(earlier.election)} to ${yearOf(file.election)} on a scale of ${scale[0]}–${scale[1]}%; thicker arrows are districts with more registered voters. ▲ up, ▼ down.</p>
            <div class="tablewrap" tabindex="0" role="region" aria-label="Change by district"><table data-rows="sh" class="num-table shift-table">
              <thead><tr><th>District</th><th>${yearOf(earlier.election)}</th><th>${yearOf(file.election)}</th><th><span class="visually-hidden">Arrow from ${yearOf(earlier.election)} to ${yearOf(file.election)}</span></th><th>Change</th><th>Most votes</th></tr></thead>
              <tbody>${[...s.shRows].sort((a, b) => (relative ? b.relative - a.relative : b.raw - a.raw)).map(
                (r) => html`<tr data-flip="${r.leaderBefore === r.leaderAfter ? "same" : "changed"}">
                  <td><a href="#/place/${r.district}">${districtName(ctx, r.district)}</a></td>
                  <td class="num">${p1(r.before)}</td><td class="num">${p1(r.after)}</td>
                  <td class="arrow-cell">${arrow(r.before, r.after, r.registered, maxReg, scale)}</td>
                  <td class="num">${pp(relative ? r.relative : r.raw)}</td>
                  <td>${r.leaderBefore === r.leaderAfter ? partyLabel(ctx, r.leaderAfter) : `${partyLabel(ctx, r.leaderBefore)} → ${partyLabel(ctx, r.leaderAfter)}`}</td>
                </tr>`,
              )}</tbody>
            </table></div>
            ${sh.unmatched.length ? html`<p class="hint">Not compared (a district row in only one of the two elections: a new or merged district, or only constituencies that cross district lines): ${sh.unmatched.map((id) => districtName(ctx, id)).join(", ")}.</p>` : ""}
            ${earlier.election < "ge-2024" && file.election >= "ge-2024" ? html`<p class="hint">In 2024 many candidates stood as independents, as the ECP lists them; a party's change between the two elections partly reflects who stood under its name, not only how voters moved.</p>` : ""}
            ${
              flows.length
                ? html`<h3>Where the lead changed</h3>
                  <div class="tablewrap" tabindex="0" role="region" aria-label="Where the lead changed"><table class="num-table compact flow-table">
                    <caption class="hint">Districts by the party with the most votes in ${yearOf(earlier.election)} (rows) and ${yearOf(file.election)} (columns). It shows where the lead changed, not how any voter moved.</caption>
                    <thead><tr><th>${yearOf(earlier.election)} ↓ / ${yearOf(file.election)} →</th>${toKeys.map((k) => html`<th scope="col">${partyLabel(ctx, k)}</th>`)}</tr></thead>
                    <tbody>${fromKeys.map(
                      (a) => html`<tr><th scope="row">${partyLabel(ctx, a)}</th>${toKeys.map((b) => {
                        const f = cell(a, b);
                        return html`<td class="num${a === b ? " same" : ""}">${f ? html`${f.districts}<div class="hint">${n0(f.registered)} reg.</div>` : html`<span class="hint">–</span>`}</td>`;
                      })}</tr>`,
                    )}</tbody>
                  </table></div>`
                : ""
            }
          </section>`
        : ""
    }
    <div class="el-card panel" role="status" hidden></div>
  </div>`;
}

export function electionsView(ctx: Ctx, params: URLSearchParams): View | undefined {
  if (!hasElectionData) return undefined;
  const body = html`
    <header class="pagehead">
      <div class="eyebrow">Elections and census</div>
      <h1>Election results by district</h1>
      <p class="lede">The Election Commission's constituency results, added up by district and set beside the Pakistan Bureau of Statistics census. Every figure is from those two sources; how each is computed is under "How to read these figures".</p>
    </header>
    <div id="elections" aria-live="polite"><p class="hint">Loading results…</p></div>`;
  const mount = (root: HTMLElement) => {
    const box = root.querySelector<HTMLElement>("#elections");
    if (!box) return;
    let gone = false;
    loadElectionData().then(
      (data) => {
        if (gone) return;
        box.innerHTML = electionsBody(ctx, data, params).html;
        box.removeAttribute("aria-live");
        wireFilters(box);
        const go = (changes: Record<string, string>) => {
          const next = new URLSearchParams(params);
          for (const [k, v] of Object.entries(changes)) v ? next.set(k, v) : next.delete(k);
          if ("h" in changes) next.delete("e");
          ctx.go(`/elections?${next}`);
        };
        for (const [id, key] of [["el-h", "h"], ["el-e", "e"], ["el-m", "m"], ["el-x", "x"], ["el-cmp", "cmp"], ["el-prov", "prov"], ["el-min", "min"]] as const)
          box.querySelector<HTMLSelectElement>(`#${id}`)?.addEventListener("change", (e) => go({ [key]: (e.target as HTMLSelectElement).value }));
        // the two-handled range: the output follows while dragging; the page redraws on release
        const lo = box.querySelector<HTMLInputElement>("#el-lo");
        const hi = box.querySelector<HTMLInputElement>("#el-hi");
        const out = box.querySelector<HTMLOutputElement>(".dual-range output");
        const pair = () => [Number(lo!.value), Number(hi!.value)].sort((a, b) => a - b);
        for (const r of [lo, hi]) {
          r?.addEventListener("input", () => out && (out.textContent = `${pair()[0]}–${pair()[1]}%`));
          r?.addEventListener("change", () => {
            const [a, b] = pair();
            go(a === 0 && b === 100 ? { lo: "", hi: "" } : { lo: String(a), hi: String(b) });
          });
        }
        // map: a province filters the districts; selecting it again shows all
        const pick = (el: Element | null) => {
          const id = (el as HTMLElement | null)?.dataset.unit;
          if (id) go({ prov: params.get("prov") === id ? "" : id });
        };
        box.querySelector(".el-map svg")?.addEventListener("click", (e) => pick((e.target as Element).closest("[data-unit]")));
        box.querySelector(".el-map svg")?.addEventListener("keydown", (e) => {
          const ev = e as KeyboardEvent;
          if (ev.key !== "Enter" && ev.key !== " ") return;
          ev.preventDefault();
          pick((ev.target as Element).closest("[data-unit]"));
        });
        box.querySelector("#el-csv")?.addEventListener("click", () => {
          const url = URL.createObjectURL(new Blob(["\uFEFF", districtCsv(ctx, data, params)], { type: "text/csv;charset=utf-8" }));
          const a = document.createElement("a");
          a.href = url;
          a.download = `pakistan-${params.get("e") ?? "latest"}-${params.get("h") ?? "na"}-by-district.csv`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        // detail card on hover, focus or tap (their "magnifier"), filled from the page's own templates
        const panel = box.querySelector<HTMLElement>(".el-card")!;
        const show = (el: Element | null, at?: { x: number; y: number }) => {
          const id = (el as HTMLElement | null)?.dataset.cardId;
          const tpl = id ? box.querySelector<HTMLTemplateElement>(`template[data-card="${CSS.escape(id)}"]`) : null;
          if (!tpl) return hide();
          panel.replaceChildren(tpl.content.cloneNode(true));
          panel.hidden = false;
          const r = (at ? null : (el as Element).getBoundingClientRect()) ?? null;
          const x = at?.x ?? r!.right;
          const y = at?.y ?? r!.top;
          panel.style.left = `${Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, x + 14))}px`;
          panel.style.top = `${Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, y + 14))}px`;
        };
        const hide = () => {
          panel.hidden = true;
        };
        box.addEventListener("pointermove", (e) => {
          const el = (e.target as Element).closest("[data-card-id]");
          el ? show(el, { x: e.clientX, y: e.clientY }) : hide();
        });
        box.addEventListener("pointerleave", hide);
        box.addEventListener("focusin", (e) => show((e.target as Element).closest("[data-card-id]")));
        box.addEventListener("focusout", hide);
        box.addEventListener("keydown", (e) => (e as KeyboardEvent).key === "Escape" && hide());
      },
      () => {
        if (!gone) box.innerHTML = html`<p class="hint">The results could not be loaded. Reload the page to try again.</p>`.html;
      },
    );
    return () => {
      gone = true;
    };
  };
  return { title: "Elections and census", body, mount };
}

/** Results on a place page: a constituency's full result, or a district's constituencies (the drill-down). */
export function placeResults(ctx: Ctx, data: ElectionData, id: string): Raw {
  const place = ctx.ix.place.get(id);
  if (!place) return raw("");
  const byElection = [...data.results].sort((a, b) => b.election.localeCompare(a.election) || a.house.localeCompare(b.house));
  if (place.kind === "constituency") {
    const rows = byElection.flatMap((f) => f.results.filter((r) => r.constituency === id).map((r) => ({ f, r })));
    if (!rows.length) return raw("");
    return html`<section class="panel place-results"><h2>Election results</h2>${rows.map(({ f, r }) => {
      const t = { ...r, votes: new Map(r.votes.map((v) => [partyKey(v), v.votes])) };
      const earlier = f.election < rows[0].f.election;
      return html`<h3 class="${earlier ? "spaced" : ""}">${yearOf(f.election)}, ${HOUSE[f.house]}</h3>
        ${earlier ? html`<p class="hint">Constituencies were redrawn after the 2023 census, so ${place.name} in ${yearOf(f.election)} may have covered a different area. This is that seat's own result, not a comparison with today's.</p>` : ""}
        ${r.not_held ? html`<p class="hint">Not counted: ${r.not_held}.</p>` : ""}
        <dl class="facts compact"><dt>Registered</dt><dd class="num">${n0(r.registered)}</dd><dt>Polled</dt><dd class="num">${n0(r.polled)} (turnout ${p1((100 * r.polled) / Math.max(1, r.registered))})</dd><dt>Valid / rejected</dt><dd class="num">${n0(r.valid)} / ${n0(r.rejected)}</dd>
          <dt>Districts</dt><dd>${r.districts.map((d, i) => html`${i ? ", " : ""}<a href="#/place/${d}">${districtName(ctx, d)}</a>`)}</dd></dl>
        <div class="tablewrap" tabindex="0" role="region" aria-label="Result by candidate, ${yearOf(f.election)}, ${HOUSE[f.house]}"><table class="num-table compact"><thead><tr><th>Candidate</th><th>Party, as the ECP lists it</th><th>Votes</th><th>Share</th></tr></thead>
          <tbody>${[...r.votes].sort((a, b) => b.votes - a.votes).map((v) => html`<tr><td>${v.candidate ?? html`<span class="hint">not recorded</span>`}</td><td>${partyLabel(ctx, partyKey(v))}</td><td class="num">${n0(v.votes)}</td><td class="num">${p1((100 * v.votes) / Math.max(1, t.valid))}</td></tr>`)}</tbody></table></div>
        <p class="hint">Source: <a href="${safeHref(r.source.url)}" target="_blank" rel="noopener noreferrer">${r.source.title}</a>.</p>`;
    })}</section>`;
  }
  if (place.kind === "district") {
    const rows = byElection.flatMap((f) => f.results.filter((r) => r.districts.includes(id)).map((r) => ({ f, r })));
    if (!rows.length) return raw("");
    return html`<section class="panel place-results"><h2>Election results</h2>
      <div class="tablewrap" tabindex="0" role="region" aria-label="Constituency results in this district"><table class="num-table compact"><thead><tr><th>Election</th><th>Constituency</th><th>Registered</th><th>Turnout</th><th>Most votes</th></tr></thead>
        <tbody>${rows.map(({ f, r }) => {
          const [lead, n] = leaderOf(new Map(r.votes.map((v) => [partyKey(v), v.votes])));
          const others = r.districts.filter((d) => d !== id);
          return html`<tr><td>${yearOf(f.election)} ${f.house.toUpperCase()}</td><td><a href="#/place/${r.constituency}">${ctx.ix.place.get(r.constituency)?.name ?? r.constituency}</a>${others.length ? html`<div class="hint">also covers ${others.map((d) => districtName(ctx, d)).join(", ")}</div>` : ""}${f.election < rows[0].f.election ? html`<div class="hint">as drawn before the 2023 delimitation</div>` : ""}</td>
            <td class="num">${n0(r.registered)}</td><td class="num">${r.not_held ? html`<span class="hint">${r.not_held}</span>` : p1((100 * r.polled) / Math.max(1, r.registered))}</td><td>${r.not_held ? "" : html`${partyLabel(ctx, lead)} <span class="hint num">${p1((100 * n) / Math.max(1, r.valid))}</span>`}</td></tr>`;
        })}</tbody></table></div>
      <p class="hint"><a href="#/elections?prov=${ctx.ix.placeTrail(id)[1]?.id ?? ""}">All districts in ${ctx.ix.placeTrail(id)[1]?.name ?? "this province"} →</a></p></section>`;
  }
  return raw("");
}

/** Adds the results section to a district or constituency page, loading the data on first visit. */
export function withPlaceResults(ctx: Ctx, id: string, view: View): View {
  const kind = ctx.ix.place.get(id)?.kind;
  if (!hasElectionData || (kind !== "district" && kind !== "constituency")) return view;
  return {
    ...view,
    body: html`${view.body}<div data-place-results></div>`,
    mount: (root) => {
      const done = view.mount?.(root);
      let gone = false;
      loadElectionData().then(
        (data) => {
          const box = root.querySelector<HTMLElement>("[data-place-results]");
          if (!gone && box) box.innerHTML = placeResults(ctx, data, id).html;
        },
        () => undefined,
      );
      return () => {
        gone = true;
        if (typeof done === "function") done();
      };
    },
  };
}
