/**
 * Facts and figures (§7.14): every chart computed from the data, a government filter that
 * scopes every chart below it, and an evidence page behind every bar.
 */
import { barFigure, evidence, FIGURE_IDS, isGov, pmTimeline, readiness, type Gov } from "../lib/analytics.ts";
import { barChart, readinessCard, termTimeline } from "../ui/charts.ts";
import { html, raw } from "../ui/dom.ts";
import { hrefFor, kindLabel, link, selectionTag, type Ctx, type View } from "./common.ts";
import { TIERS, TIER_LABEL } from "./tiers.ts";

const q = (gov: Gov) => (gov === "all" ? "" : `?gov=${gov}`);
export const evidenceHref = (figure: string, key: string, gov: Gov = "all") => `#/figures/${figure}/${encodeURIComponent(key)}${q(gov)}`;

/** The figures page; `focus` (a figure id, from #/figures/<figure>) scrolls to that chart. */
export function figuresView(ctx: Ctx, params: URLSearchParams, focus?: string): View {
  const { ix } = ctx;
  const g = params.get("gov");
  const gov: Gov = isGov(g) ? g : "all";
  const chart = (id: string) => {
    const f = barFigure(ix, id, gov)!;
    return barChart(f, (b) => evidenceHref(id, b.key, f.filterable ? gov : "all"));
  };
  const filterable = FIGURE_IDS.filter((id) => barFigure(ix, id)!.filterable);
  const body = html`
    <header class="pagehead">
      <div class="eyebrow">Facts and figures</div>
      <h1>The state in numbers</h1>
      <p class="lede">Every figure here is counted from the records in this project, as of ${ix.g.meta.data_as_of}. Nothing is typed in by hand. Select a bar to see the records behind it.</p>
    </header>
    <div class="stack">
      <section>
        <h2>Structure</h2>
        ${barChart(barFigure(ix, "bodies-by-government")!, (b) => evidenceHref("bodies-by-government", b.key))}
      </section>
      <section aria-labelledby="by-gov">
        <h2 id="by-gov">By government</h2>
        <nav class="filters" aria-label="Choose a government for the charts below">
          <span class="hint">Show:</span>
          ${["all", ...TIERS].map(
            (t) => html`<a class="chip-btn" href="#/figures${q(t)}" ${t === gov ? raw('aria-current="page"') : ""}>${t === "all" ? "All governments" : TIER_LABEL[t]}</a>`,
          )}
        </nav>
        <div class="charts">${filterable.map(chart)}</div>
      </section>
      <section>
        <h2>Prime Ministers</h2>
        ${termTimeline(pmTimeline(ix), (id) => `#/person/${id}`)}
      </section>
      <section>
        <h2>Careers, party changes and declared assets</h2>
        <p class="hint" style="margin-bottom:12px">These figures rank people, so they are shown only once the records behind them are complete for a stated period. Ranking an incomplete set would mislead. Until then, each card says what is in the data and what is still needed.</p>
        <div class="ready-grid">${readiness(ix).map(readinessCard)}</div>
      </section>
    </div>`;
  const mount = (root: HTMLElement) => {
    const fig = focus ? root.querySelector<HTMLElement>(`#fig-${CSS.escape(focus)}`) : null;
    if (!fig) return;
    fig.tabIndex = -1;
    fig.scrollIntoView({ block: "start" });
    fig.focus({ preventScroll: true });
  };
  return { title: "Facts and figures", body, mount };
}

export function figureEvidenceView(ctx: Ctx, figure: string, key: string, params: URLSearchParams): View | undefined {
  const { ix } = ctx;
  if (!FIGURE_IDS.includes(figure)) return undefined;
  const g = params.get("gov");
  const gov: Gov = isGov(g) ? g : "all";
  const ev = evidence(ix, figure, key, gov);
  if (!ev) return undefined;
  const ids = [...ev.ids].sort((a, b) => ix.label(a).localeCompare(ix.label(b)));
  const row = (id: string) => {
    const o = ix.org.get(id);
    if (o) {
      const tier = ix.tierOf(o.jurisdiction);
      return html`<tr><td>${link(ix, id)}</td><td>${kindLabel(o.kind)}</td><td>${tier ? TIER_LABEL[tier.id] ?? tier.name : ""}</td><td>${o.parent ? link(ix, o.parent, ix.shortLabel(o.parent)) : ""}</td></tr>`;
    }
    const p = ix.post.get(id);
    if (p) {
      const holder = ix.effectiveHolders(p.id)[0];
      return html`<tr><td>${link(ix, id)}</td><td>${selectionTag(p)}</td><td>${link(ix, p.org, ix.shortLabel(p.org))}</td><td>${holder ? link(ix, holder.person.id) : html`<span class="hint">not recorded</span>`}</td></tr>`;
    }
    return html`<tr><td colspan="4"><a href="${hrefFor(ix, id)}">${ix.label(id)}</a></td></tr>`;
  };
  const isPosts = ids.some((id) => ix.post.has(id));
  const body = html`
    <nav class="trail"><a href="#/figures${q(gov)}">Facts and figures</a><span aria-hidden="true">›</span><span>${ev.title}</span></nav>
    <header class="pagehead">
      <div class="eyebrow">${ev.title}${gov === "all" ? "" : ` · ${TIER_LABEL[gov]}`}</div>
      <h1>${ev.label} <span class="count num">${ids.length}</span></h1>
      <p class="lede">The records counted in this bar. Each links to its page, with its legal basis and sources.</p>
    </header>
    <div class="tablewrap"><table>
      <thead><tr>${isPosts ? html`<th>Post</th><th>How it is filled</th><th>Body</th><th>Holder</th>` : html`<th>Body</th><th>Kind</th><th>Government</th><th>Part of</th>`}</tr></thead>
      <tbody>${ids.map(row)}</tbody>
    </table></div>`;
  return { title: `${ev.label} · ${ev.title}`, body };
}
