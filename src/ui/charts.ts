/**
 * Small, dependency-free charts for the facts-and-figures pages.
 *
 * Bar charts are real <table>s: the label, the bar and the value sit in one row, so the chart is
 * its own data table for screen readers, print and copy-paste. Bars are a single hue (the
 * highlighted bar, if any, in the accent and the rest in a muted gray) and every value is written
 * at the end of its bar, so nothing depends on colour. Every row links to the records behind it.
 */
import type { Bar, BarFigure, Readiness, Term, Tile } from "../lib/analytics.ts";
import { html, type Raw } from "./dom.ts";

const fmt = (n: number) => n.toLocaleString("en-US");
const pct = (n: number) => `${(Math.round(n * 1000) / 10).toFixed(1)}%`;

export function statTiles(tiles: Tile[]): Raw {
  return html`<div class="kpis">${tiles.map(
    (t) => html`<a class="kpi" href="${t.href}"><span class="kpi-label">${t.label}</span><b>${fmt(t.value)}</b><span class="kpi-detail">${t.detail}</span></a>`,
  )}</div>`;
}

export function barChart(fig: BarFigure, href: (bar: Bar) => string, opts: { compact?: boolean; more?: string } = {}): Raw {
  const max = Math.max(1, ...fig.bars.map((b) => b.value));
  const emphasised = fig.bars.some((b) => b.emphasis);
  return html`<figure class="chart${opts.compact ? " compact" : ""}" id="fig-${fig.id}">
    <figcaption><span class="chart-title">${fig.title}</span></figcaption>
    ${
      fig.bars.length
        ? html`<table class="bars">
            <thead class="visually-hidden"><tr><th scope="col">${fig.title}</th><th scope="col">Number of ${fig.unit}</th></tr></thead>
            <tbody>${fig.bars.map(
              (b) => html`<tr class="${b.key === "_others" ? "others" : emphasised && !b.emphasis ? "muted" : ""}">
                <th scope="row"><a href="${href(b)}">${b.label}</a></th>
                <td><span class="bar-track"><span class="bar" style="width:${pct(b.value / max)}" title="${b.label}: ${fmt(b.value)} ${fig.unit}"></span><span class="v">${fmt(b.value)}</span></span></td>
              </tr>`,
            )}</tbody>
          </table>`
        : html`<p class="hint empty">No ${fig.unit} recorded for this selection.</p>`
    }
    <p class="chart-basis">${fig.basis}${opts.more ? html` <a href="${opts.more}">All facts and figures →</a>` : ""}</p>
  </figure>`;
}

/** Prime Ministers on one time axis; periods the data doesn't cover are hatched and labelled. */
export function termTimeline(t: { terms: Term[]; start?: string; end: string; gaps: { from: string; to: string }[] }, personHref: (id: string) => string): Raw {
  if (!t.start) return html`<p class="hint">No terms recorded.</p>`;
  const t0 = Date.parse(t.start);
  const t1 = Date.parse(t.end.length === 7 ? `${t.end}-28` : t.end);
  const x = (d: string) => Math.min(100, Math.max(0, ((Date.parse(d) - t0) / (t1 - t0)) * 100));
  const year = (d: string) => d.slice(0, 4);
  const people = [...new Map(t.terms.map((term) => [term.person, term.name])).entries()];
  const current = t.terms.find((term) => !term.until)?.person;
  const firstYear = Number(year(t.start));
  const ticks: number[] = [];
  for (let y = Math.ceil(firstYear / 5) * 5; y <= Number(year(t.end)); y += 5) ticks.push(y);
  const span = (from: string, to: string | undefined) => `left:${x(from).toFixed(2)}%;width:${Math.max(0.6, x(to ?? t.end) - x(from)).toFixed(2)}%`;
  return html`<figure class="chart timeline">
    <figcaption><span class="chart-title">Prime Ministers, ${year(t.start)} to today</span></figcaption>
    <table class="tl">
      <thead><tr><th scope="col"><span class="visually-hidden">Prime Minister</span></th><th scope="col"><span class="tl-axis">${ticks.map((y) => html`<span class="${y % 10 ? "minor" : ""}" style="left:${x(`${y}-01-01`).toFixed(2)}%">${y}</span>`)}</span></th></tr></thead>
      <tbody>${people.map(([id, name]) => {
        const mine = t.terms.filter((term) => term.person === id);
        return html`<tr class="${id === current ? "" : "muted"}">
          <th scope="row"><a href="${personHref(id)}">${name}</a><span class="hint num">${mine.map((m) => `${year(m.since)}–${m.until ? year(m.until) : "now"}`).join(", ")}</span></th>
          <td><span class="tl-track">${mine.map(
            (m) => html`<span class="tl-term" style="${span(m.since, m.until)}" title="${name}: ${m.since} to ${m.until ?? "today"}"></span>`,
          )}</span></td>
        </tr>`;
      })}${
        t.gaps.length
          ? html`<tr class="tl-missing"><th scope="row"><span class="hint">Not yet in the data</span></th><td><span class="tl-track">${t.gaps.map(
              (g) => html`<span class="tl-gap" style="${span(g.from, g.to)}" title="${g.from} to ${g.to}: Prime Ministers not yet recorded"></span>`,
            )}</span></td></tr>`
          : ""
      }</tbody>
    </table>
    <p class="chart-basis">${t.terms.length} terms recorded, ${t.start} to today. ${
      t.gaps.length
        ? html`Not yet in the data: ${t.gaps.map((g, i) => html`${i ? ", " : ""}${year(g.from)}–${year(g.to)}`)}. Caretaker Prime Ministers are included where recorded.`
        : ""
    }</p>
  </figure>`;
}

export function readinessCard(r: Readiness): Raw {
  const p = r.progress;
  return html`<section class="ready-card" aria-labelledby="ready-${r.id}">
    <div class="ready-head"><h3 id="ready-${r.id}">${r.title}</h3><span class="tag ${r.ready ? "ok" : "warn"}">${r.ready ? "✓ Ready" : "◔ Not enough data yet"}</span></div>
    <p class="ready-figs">${r.figures.join(" · ")}</p>
    ${
      p
        ? html`<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${p.of}" aria-valuenow="${p.have}" aria-label="${p.label}"><span style="width:${pct(p.of ? p.have / p.of : 0)}"></span></div>
          <p class="hint num">${fmt(p.have)} of ${fmt(p.of)} ${p.label}</p>`
        : ""
    }
    <dl><dt>In the data now</dt><dd>${r.have}</dd><dt>Needed before anything is ranked</dt><dd>${r.need}</dd></dl>
  </section>`;
}
