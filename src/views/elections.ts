/**
 * Elections and census (#/elections): ECP results added up by district, beside PBS census figures,
 * and the change between two elections. The method is in src/lib/vote-explorer.ts and is spelled
 * out on the page, so every number can be traced. The page exists only once data/results/ holds
 * results; the data loads on first visit, as separate same-origin files.
 */
import { byDistrict, joinCensus, measureOf, shift, weightedFit, type ByDistrict, type Indicator, type Measure, type PartyKey } from "../lib/vote-explorer.ts";
import type { CensusFile, ResultsFile } from "../schema.ts";
import { safeHref } from "../lib/safe-url.ts";
import { html, raw, type Raw } from "../ui/dom.ts";
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
          (p) => html`<a href="#/place/${p.id}"><circle class="dot" cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="${(3 + 11 * Math.sqrt(p.w / wMax)).toFixed(1)}"><title>${`${districtName(ctx, p.id)}: ${xLabel} ${p1(p.x)}, ${yLabel} ${p1(p.y)}, ${n0(p.w)} registered voters`}</title></circle></a>`,
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

/** The page body for loaded data; pure, so it can be tested without a browser. */
export function electionsBody(ctx: Ctx, data: ElectionData, params: URLSearchParams): Raw {
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
  const joined = joinCensus(d, census);
  const yLabel = measureLabel(ctx, measure);
  const points = xi ? joined.filter((j) => j.census?.[xi] !== undefined).map((j) => ({ id: j.row.district, x: j.census![xi]!, y: measureOf(j.row, measure), w: j.row.registered })) : [];
  const earlier = files.filter((f) => f.election < file.election).pop();
  const relative = params.get("cmp") === "relative";
  const sh = earlier ? shift(byDistrict(earlier), d, measure) : undefined;
  const spanVotes = d.spanning.reduce((s, r) => s + r.polled, 0);
  const provinces = [...new Set(d.rows.map((r) => provinceOf(ctx, r.district)?.id).filter(Boolean))] as string[];
  const option = (v: string, label: string, on: boolean) => html`<option value="${v}" ${on ? raw("selected") : ""}>${label}</option>`;

  return html`<div class="stack">
    <div class="toolbar filters" data-el-controls>
      <label>House <select id="el-h">${houses.map((x) => option(x, HOUSE[x], x === h))}</select></label>
      <label>Election <select id="el-e">${files.map((f) => option(f.election, yearOf(f.election), f === file))}</select></label>
      <label>Measure <select id="el-m">${option("turnout", "Turnout", measure === "turnout")}${parties.map((k) => option(k, `${partyLabel(ctx, k)} share`, measure !== "turnout" && measure.party === k))}</select></label>
      ${indicators.length ? html`<label>Census figure <select id="el-x">${indicators.map((k) => option(k, INDICATOR[k], k === xi))}</select></label>` : ""}
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
        <li><b>National figures</b> count every constituency in the ECP results. <b>District figures</b> add up the constituencies that lie wholly in one district. ${d.spanning.length ? `${d.spanning.length} constituencies cover more than one district (${n0(spanVotes)} votes polled); they are in the national figures but not split between districts by guesswork, so district totals add up to less than the national total.` : "Every constituency here lies in one district."}</li>
        <li><b>Independents</b> are shown as the ECP lists them. Any party a candidate is reported to be backed by is not part of ECP results and is not inferred here.</li>
        <li><b>Census figures</b> are PBS's${census ? ` ${census.census} census` : ""} district figures${census?.definitions.literacy_pct ? `. Literacy: ${census.definitions.literacy_pct}` : ""}${census?.definitions.urban_pct ? `. Urban: ${census.definitions.urban_pct}` : ""}.</li>
        <li>This is a way to explore official figures, not a substitute for the ECP's results.</li>
      </ul>
    </details>

    ${points.length >= 3 ? scatter(ctx, points, INDICATOR[xi], yLabel) : census ? "" : html`<p class="hint">Census figures are not loaded yet, so there is no comparison with literacy or urbanisation.</p>`}

    <section>
      <h2>By district</h2>
      <div class="toolbar filters">
        <input type="search" data-filter="el" placeholder="Filter by district or party" aria-label="Filter districts" />
        <label>Province <select data-filter="el" data-facet="prov" id="el-prov"><option value="">All</option>${provinces.map((p) => html`<option value="${p}">${ctx.ix.place.get(p)?.name ?? p}</option>`)}</select></label>
        <span class="hint num" data-count="el">${d.rows.length} districts</span>
      </div>
      <div class="tablewrap"><table data-rows="el" class="num-table">
        <thead><tr><th>District</th><th>Province</th><th>Registered</th><th>Turnout</th><th>Most votes</th>${measure === "turnout" ? "" : html`<th>${yLabel}</th>`}${xi ? html`<th>${INDICATOR[xi]}</th>` : ""}</tr></thead>
        <tbody>${joined.map(
          ({ row, census: c }) => html`<tr data-prov="${provinceOf(ctx, row.district)?.id ?? ""}">
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
              <span class="hint num" data-count="sh">${sh.rows.length} districts</span>
            </div>
            <p class="hint">${relative ? "Relative: the district's change minus the national change, so a district that moved with the country shows about zero." : "As measured: the district's own change, in percentage points."} ▲ up, ▼ down.</p>
            <div class="tablewrap"><table data-rows="sh" class="num-table">
              <thead><tr><th>District</th><th>${yearOf(earlier.election)}</th><th>${yearOf(file.election)}</th><th>Change</th><th>Most votes</th></tr></thead>
              <tbody>${sh.rows.map(
                (r) => html`<tr data-flip="${r.leaderBefore === r.leaderAfter ? "same" : "changed"}">
                  <td><a href="#/place/${r.district}">${districtName(ctx, r.district)}</a></td>
                  <td class="num">${p1(r.before)}</td><td class="num">${p1(r.after)}</td>
                  <td class="num">${pp(relative ? r.relative : r.raw)}</td>
                  <td>${r.leaderBefore === r.leaderAfter ? partyLabel(ctx, r.leaderAfter) : `${partyLabel(ctx, r.leaderBefore)} → ${partyLabel(ctx, r.leaderAfter)}`}</td>
                </tr>`,
              )}</tbody>
            </table></div>
            ${sh.unmatched.length ? html`<p class="hint">Not compared (a district row in only one of the two elections: a new or merged district, or only constituencies that cross district lines): ${sh.unmatched.map((id) => districtName(ctx, id)).join(", ")}.</p>` : ""}
            ${earlier.election < "ge-2024" && file.election >= "ge-2024" ? html`<p class="hint">In 2024 many candidates stood as independents, as the ECP lists them; a party's change between the two elections partly reflects who stood under its name, not only how voters moved.</p>` : ""}
          </section>`
        : ""
    }</div>`;
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
        for (const [id, key] of [["el-h", "h"], ["el-e", "e"], ["el-m", "m"], ["el-x", "x"], ["el-cmp", "cmp"]] as const)
          box.querySelector<HTMLSelectElement>(`#${id}`)?.addEventListener("change", (e) => {
            const next = new URLSearchParams(params);
            next.set(key, (e.target as HTMLSelectElement).value);
            if (key === "h") next.delete("e");
            ctx.go(`/elections?${next}`);
          });
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
