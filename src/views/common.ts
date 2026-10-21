import type { GraphIndex, Post, Edge } from "../lib/graph-index.ts";
import type { LegalRef, Source } from "../schema.ts";
import { html, raw, type Raw } from "../ui/dom.ts";
import {
  BRANCH_LABEL,
  CONFIDENCE_NOTE,
  KIND_LABEL,
  METHOD_LABEL,
  ORIGIN_HELP,
  ORIGIN_LABEL,
  REL_PHRASE,
  SELECTION_HELP,
  SELECTION_LABEL,
  STATUS_LABEL,
  tenureLabel,
} from "../ui/labels.ts";
import type { Holding, Human, Org } from "../lib/graph-index.ts";
import type { LayoutName, Lens, VEdge, VNode } from "../ui/graph-view.ts";
import type { Core } from "cytoscape";
import { safeHref } from "../lib/safe-url.ts";
import { ALLEGATION_STATUSES } from "../lib/policy.ts";

export interface View {
  title: string;
  body: Raw;
  mount?: (root: HTMLElement) => void | (() => void);
}

export interface Ctx {
  ix: GraphIndex;
  repo: string;
  go: (route: string) => void;
}

const ROUTE_PREFIX = { organization: "org", position: "post", person: "person", jurisdiction: "place", law: "law" } as const;

export function hrefFor(ix: GraphIndex, id: string) {
  const k = ix.kindOf(id);
  return k ? `#/${ROUTE_PREFIX[k]}/${id}` : "#/";
}

export function link(ix: GraphIndex, id: string | undefined, text?: string): Raw {
  if (!id) return raw("");
  if (!ix.kindOf(id)) return html`<span class="mono">${id}</span>`;
  return html`<a href="${hrefFor(ix, id)}">${text ?? ix.label(id)}</a>`;
}

/** Newest constitutional/statutory change recorded for a post or body, for the "established by" tag. */
function latestChange(ix: GraphIndex, history: { year: number; law: string }[] | undefined) {
  if (!history?.length) return undefined;
  const h = [...history].sort((a, b) => b.year - a.year)[0];
  const law = ix.law.get(h.law);
  return { ...h, label: `${law?.short ?? law?.title ?? h.law}` };
}

export function selectionTag(p: Post): Raw {
  return html`<span class="tag sel-${p._selection}" title="${SELECTION_HELP[p._selection]}">${SELECTION_LABEL[p._selection]}</span>`;
}

export function originTag(origin: Post["_origin"]): Raw {
  return html`<span class="tag org-${origin}" title="${ORIGIN_HELP[origin]}">${ORIGIN_LABEL[origin]}</span>`;
}

/** Colour-coded tags for a post: what creates it, how it is filled, its tenure, and the latest law that changed it. */
export function postTags(ix: GraphIndex, p: Post): Raw {
  const t = p._tenure;
  const lc = latestChange(ix, p.history);
  return html`<span class="tags">${originTag(p._origin)}${selectionTag(p)}${t ? html`<span class="tag tenure" title="${t.notes ?? ""}">${tenureLabel(t)}</span>` : ""}${
    lc ? html`<a class="tag law" href="#/law/${lc.law}" title="Latest change: ${lc.year}">${lc.label} · ${lc.year}</a>` : ""
  }</span>`;
}

export function orgTags(ix: GraphIndex, o: Org): Raw {
  const lc = latestChange(ix, o.history);
  const first = o.legal_basis?.[0];
  const law = first ? ix.law.get(first.law) : undefined;
  return html`<span class="tags">${originTag(o._origin)}${
    law ? html`<a class="tag law" href="#/law/${law.id}">${law.short ?? law.title}${first?.provision ? " " + first.provision : ""}${law.year && law.kind !== "constitution" ? " · " + law.year : ""}</a>` : ""
  }${lc && lc.law !== first?.law ? html`<a class="tag law" href="#/law/${lc.law}">${lc.label} · ${lc.year}</a>` : ""}</span>`;
}

/** Flags on a holding: holding over, acting, extensions, repeat terms, retired or serving officers in civilian posts. */
export function holdingFlags(ix: GraphIndex, h: Holding & { term_ended?: string; term_number?: number; extensions?: unknown[]; ends?: string }, postId?: string): Raw {
  const flags: Raw[] = [];
  if (h.status === "holding_over") flags.push(html`<span class="tag flag-bad" title="Term expired; continuing until a successor is appointed">Holding over${h.term_ended ? ` since ${h.term_ended}` : ""}</span>`);
  else if (h.status !== "confirmed") flags.push(html`<span class="tag flag">${h.status.replace(/_/g, " ")}</span>`);
  if (h.extensions?.length) flags.push(html`<span class="tag flag" title="Term extended or renewed">Extended ×${h.extensions.length}</span>`);
  if (h.term_number && h.term_number > 1) flags.push(html`<span class="tag flag-info">${ordinal(h.term_number)} term</span>`);
  if (h.ends) flags.push(html`<span class="tag flag-info">Term to ${h.ends}</span>`);
  const post = postId ? ix.post.get(postId) : undefined;
  for (const b of h.person.background ?? []) {
    if (b.service === "military" && post && post._selection !== "military")
      flags.push(html`<span class="tag ${b.retired ? "flag-info" : "flag"}" title="${b.notes ?? ""}">${b.retired ? "Retired" : "Serving"} ${b.rank ?? "officer"}</span>`);
    else if (b.service === "judiciary" && b.retired && post && post._selection !== "judicial") flags.push(html`<span class="tag flag-info">Retired judge</span>`);
    else if (b.service === "civil_service" && b.retired && post && post._selection !== "civil_service") flags.push(html`<span class="tag flag-info">Retired civil servant</span>`);
  }
  return html`<span class="tags">${flags}</span>`;
}

function ordinal(n: number) {
  return n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

/** The role object on the person's record for a given post (carries extensions, holdover etc.). */
export function roleOf(person: Human, postId: string) {
  return person.roles.find((r) => r.position === postId && !r.until);
}

export function partyLink(ix: GraphIndex, partyId: string | undefined): Raw {
  if (!partyId) return raw("");
  const p = ix.org.get(partyId);
  return p ? html`<a href="#/org/${p.id}">${p.short_name ?? p.name}</a>` : html`${partyId}`;
}

export function branchChip(branch: string) {
  return html`<span class="chip branch-${branch}"><i></i>${BRANCH_LABEL[branch as keyof typeof BRANCH_LABEL] ?? branch}</span>`;
}

export function confidenceChip(c: "high" | "medium" | "low") {
  if (c === "high") return raw("");
  return html`<span class="chip conf-${c}" title="${CONFIDENCE_NOTE[c]}">${c === "medium" ? "Verify" : "Provisional"}</span>`;
}

export function statusChip(ix: GraphIndex, postId: string) {
  const s = ix.seatStatus(postId);
  if (s === "multi") return raw("");
  return html`<span class="chip st-${s}"><i></i>${STATUS_LABEL[s]}</span>`;
}

export function legalRef(ix: GraphIndex, lb: LegalRef): Raw {
  const law = ix.law.get(lb.law);
  return html`${link(ix, lb.law, law?.short ?? law?.title)}${lb.provision ? html` <span class="cite">${lb.provision}</span>` : ""}`;
}

export function legalList(ix: GraphIndex, refs: LegalRef[] | undefined): Raw {
  if (!refs?.length) return html`<p class="hint">No legal instrument recorded yet.</p>`;
  return html`<ul class="lawlist">${refs.map((r) => html`<li>${legalRef(ix, r)}</li>`)}</ul>`;
}

export function sourcesList(sources: Source[] | undefined): Raw {
  if (!sources?.length) return html`<p class="hint">Structure from the cited legal instruments.</p>`;
  return html`<ul class="plain">${sources.map((s) => html`<li>${s.url ? html`<a href="${safeHref(s.url)}" target="_blank" rel="noopener noreferrer">${s.title}</a>` : s.title}</li>`)}</ul>`;
}

export function editLink(ctx: Ctx, file: string) {
  return html`<a href="${ctx.repo}/blob/main/${file}" target="_blank" rel="noopener noreferrer" class="mono">${file}</a>`;
}

/** "Appointed by the President on the advice of the Prime Minister; nominated by …" */
export function appointmentSentence(ix: GraphIndex, p: Post): Raw {
  const a = p.appointment;
  if (!a) return html`<span class="hint">Appointment method not recorded.</span>`;
  if (a.method === "ex_officio")
    return p.ex_officio_of ? html`<b>Ex officio</b> — held by the ${link(ix, p.ex_officio_of)}` : html`<b>Ex officio</b>`;
  const verb = a.method.includes("election") ? "Elected by" : a.method === "posting" ? "Posted by" : "Appointed by";
  const parts: Raw[] = [];
  if (a.by) parts.push(html`<b>${verb}</b> ${link(ix, a.by)}`);
  else parts.push(html`<b>${METHOD_LABEL[a.method]}</b>`);
  if (a.on_advice_of) parts.push(html`on the advice of ${link(ix, a.on_advice_of)}`);
  if (a.nominated_by) parts.push(html`nominated by ${link(ix, a.nominated_by)}`);
  if (a.consultation?.length) parts.push(html`after consulting ${a.consultation.map((c, i) => html`${i ? ", " : ""}${link(ix, c)}`)}`);
  if (a.confirmation) parts.push(html`confirmed by ${link(ix, a.confirmation)}`);
  return html`${parts.map((p, i) => html`${i ? "; " : ""}${p}`)}`;
}

export function chain(ix: GraphIndex, postId: string): Raw {
  const steps = ix.appointmentChain(postId);
  if (!steps.length) return raw("");
  return html`<div class="chain" aria-label="Chain of authority">
    <a class="node" href="${hrefFor(ix, postId)}">${ix.shortLabel(postId)}</a>
    ${steps.map((s) => html`<span class="via">← ${s.via}</span><a class="node" href="${hrefFor(ix, s.id)}">${ix.shortLabel(s.id)}</a>`)}
  </div>`;
}

export function postRow(ix: GraphIndex, p: Post, opts: { showOrg?: boolean } = {}): Raw {
  const holders = ix.effectiveHolders(p.id);
  const direct = ix.currentHolders(p.id).length > 0;
  return html`<div class="post">
    <div>
      <div class="title"><a href="${hrefFor(ix, p.id)}">${p.title}</a></div>
      <div class="meta">
        ${p.seats ? html`<span class="chip num">${p.seats} seats</span>` : statusChip(ix, p.id)}
        ${p.grade ? html`<span class="cite">${p.grade}</span>` : ""}
        ${opts.showOrg ? link(ix, p.org) : ""}
        ${confidenceChip(p.confidence)}
      </div>
      <div style="margin-top:6px">${postTags(ix, p)}</div>
      <div class="appoint" style="margin-top:6px">${appointmentSentence(ix, p)}</div>
    </div>
    <div class="holder">
      ${
        holders.length
          ? holders.map(
              (h) => html`<div class="name">${link(ix, h.person.id)}</div>
                ${direct ? holdingFlags(ix, { ...h, ...roleOf(h.person, p.id) }, p.id) : ""}
                <div class="hint">${h.status !== "confirmed" ? html`<span class="chip st-acting">${h.status.replace(/_/g, " ")}</span> ` : ""}${
                  h.since ? html`since <span class="num">${h.since}</span>` : ""
                }${!direct ? " (ex officio)" : ""}${h.person.party ? html` · ${partyLink(ix, h.person.party)}` : ""}</div>`,
            )
          : p.seats
            ? html`<div class="none">Multi-member body — members are not listed individually yet.</div>`
            : html`<div class="none">Holder not yet recorded in the dataset.</div>`
      }
    </div>
  </div>`;
}

export function relationRows(ix: GraphIndex, edges: Edge[], dir: "out" | "in"): Raw {
  return html`${edges.map((e) => {
    const other = dir === "out" ? e.to : e.from;
    const phrase = REL_PHRASE[e.type][dir === "out" ? 0 : 1];
    return html`<div class="rel">
      <div class="verb">${phrase}</div>
      <div>${link(ix, other)} ${confidenceChip(e.confidence)}
        ${e.legal_basis?.length ? html` ${e.legal_basis.map((lb) => html`<span class="cite">${ix.law.get(lb.law)?.short ?? lb.law}${lb.provision ? " " + lb.provision : ""}</span> `)}` : ""}</div>
      ${e.description ? html`<div class="desc">${e.description}</div>` : ""}
    </div>`;
  })}`;
}

export function kindLabel(kind: string) {
  return KIND_LABEL[kind as keyof typeof KIND_LABEL] ?? kind;
}

export interface GraphTab {
  key: string;
  label: string;
  data: () => { nodes: VNode[]; edges: VEdge[] };
  layout: LayoutName;
}

/**
 * Loads a module on demand (the graph code), marking `el` as loading meanwhile. If the load fails
 * (a redeploy renamed the file, or the connection dropped) `el` says so instead of loading forever;
 * a failed module stays failed until the page is reloaded, so the message asks for that.
 */
export async function loadOnDemand<T>(el: HTMLElement, load: () => Promise<T>): Promise<T | undefined> {
  el.removeAttribute("data-failed");
  el.setAttribute("data-loading", "");
  try {
    return await load();
  } catch {
    el.setAttribute("data-failed", "");
    return undefined;
  } finally {
    el.removeAttribute("data-loading");
  }
}

let closeOpenDrawer: (() => void) | undefined;

/** Closes the detail drawer, if one is open (also when its page is torn down). */
export function closeDrawer() {
  closeOpenDrawer?.();
}

/**
 * Slide-over detail drawer: summary of any node without leaving the graph.
 * `returnTo` gets focus back when the drawer closes (a graph canvas: the node that opened it can't
 * hold focus itself).
 */
export function openDrawer(ctx: Ctx, id: string, returnTo?: HTMLElement) {
  const { ix } = ctx;
  closeDrawer();
  const kind = ix.kindOf(id);
  if (!kind) return;
  let inner: Raw;
  if (kind === "organization") {
    const o = ix.org.get(id)!;
    const heads = ix.leadership(id).filter((p) => !p.area && !p.seat_type).slice(0, 4);
    inner = html`<div class="eyebrow">${kindLabel(o.kind)} ${branchChip(o.branch)}</div><h2>${o.name}</h2>${orgTags(ix, o)}
      ${o.description ? html`<p class="hint">${o.description.slice(0, 320)}${o.description.length > 320 ? "…" : ""}</p>` : ""}
      ${heads.length ? html`<div class="posts">${heads.map((p) => postRow(ix, p))}</div>` : ""}
      ${o.parent ? html`<p class="hint">Part of ${link(ix, o.parent)}</p>` : ""}`;
  } else if (kind === "position") {
    const p = ix.post.get(id)!;
    inner = html`<div class="eyebrow">Post</div><h2>${p.title}</h2><div class="posts">${postRow(ix, p, { showOrg: true })}</div>`;
  } else if (kind === "person") {
    const person = ix.person.get(id)!;
    inner = html`<div class="eyebrow">Person</div><h2>${person.name}</h2>${person.party ? html`<p>${partyLink(ix, person.party)}</p>` : ""}
      <div class="posts">${person.roles.filter((r) => !r.until).map((r) => postRow(ix, ix.post.get(r.position)!, { showOrg: true }))}</div>`;
  } else {
    inner = html`<div class="eyebrow">${kind}</div><h2>${ix.label(id)}</h2>`;
  }
  const el = document.createElement("aside");
  el.className = "drawer";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", ix.label(id));
  el.innerHTML = html`<button class="close" type="button">Close ✕</button>${inner}<a class="btn" href="${hrefFor(ix, id)}">Open full page →</a>`.html;
  const close = () => {
    el.remove();
    document.removeEventListener("keydown", onKey);
    if (closeOpenDrawer === close) closeOpenDrawer = undefined;
    if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
  };
  closeOpenDrawer = close;
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
  el.querySelector(".close")!.addEventListener("click", close);
  el.addEventListener("click", (e) => (e.target as Element).closest("a") && close());
  document.addEventListener("keydown", onKey);
  document.body.appendChild(el);
  (el.querySelector(".close") as HTMLElement).focus();
}

/** A graph panel with tab buttons; returns markup plus a mount function. */
export function graphPanel(ctx: Ctx, id: string, tabs: GraphTab[], opts: { tall?: boolean; note?: string } = {}) {
  const body = html`<div class="graphpanel" id="${id}">
    <div class="graphbar">
      <div class="seg" role="group" aria-label="Graph view">
        ${tabs.map((t, i) => html`<button type="button" data-tab="${t.key}" aria-pressed="${i === 0 ? "true" : "false"}">${t.label}</button>`)}
      </div>
      <label class="hint">Colour by <select data-lens id="${id}-lens"><option value="branch">Branch</option><option value="class">How filled / what created it</option></select></label>
      <span class="hint">${opts.note ?? "Hover to highlight · click a node for details · scroll to zoom"}</span>
    </div>
    <div class="canvas${opts.tall ? " tall" : ""}" role="img" aria-label="Relationship graph"></div>
    <div class="legend" data-legend="branch">
      <span><i style="background:var(--b-executive)"></i>Executive</span>
      <span><i style="background:var(--b-legislative)"></i>Legislative</span>
      <span><i style="background:var(--b-judicial)"></i>Judicial</span>
      <span><i style="background:var(--b-constitutional)"></i>Independent</span>
      <span><i style="background:var(--b-military)"></i>Armed forces</span>
      <span><i style="background:var(--b-local)"></i>Local</span>
      <span><i style="background:var(--b-political)"></i>Party</span>
      <span><i style="background:var(--power);border-radius:50%"></i>Post</span>
      <span><i style="background:var(--ink);transform:rotate(45deg) scale(.8)"></i>Person</span>
      <span><i class="line" style="background:var(--power)"></i>Appoints / elects</span>
      <span><i class="dash"></i>Other relation</span>
      <span><i class="line" style="background:var(--line-strong)"></i>Part of</span>
    </div>
    <div class="legend" data-legend="class" hidden>
      <span><i style="background:var(--k-green);border-radius:50%"></i>Elected</span>
      <span><i style="background:var(--k-purple);border-radius:50%"></i>Political appointee</span>
      <span><i style="background:var(--k-navy);border-radius:50%"></i>Constitutional appointee / constitutional body</span>
      <span><i style="background:var(--k-burgundy);border-radius:50%"></i>Judiciary</span>
      <span><i style="background:var(--k-olive);border-radius:50%"></i>Military</span>
      <span><i style="background:var(--k-slate);border-radius:50%"></i>Civil service / executive-order body</span>
      <span><i style="background:var(--k-gold-fill);border-radius:50%"></i>Regulatory</span>
      <span><i style="background:var(--k-teal);border-radius:50%"></i>Statutory</span>
    </div>
  </div>`;
  const classify = (nid: string) => {
    const p = ctx.ix.post.get(nid);
    if (p) return { sel: p._selection };
    const o = ctx.ix.org.get(nid);
    return o ? { origin: o._origin } : {};
  };
  const mount = (root: HTMLElement) => {
    const panel = root.querySelector<HTMLElement>(`#${id}`);
    if (!panel) return;
    const canvas = panel.querySelector<HTMLElement>(".canvas")!;
    const lensSel = panel.querySelector<HTMLSelectElement>("[data-lens]")!;
    let cy: Core | undefined;
    let gone = false;
    let current = tabs[0].key;
    // the drawer hands focus back to the canvas when it closes
    canvas.tabIndex = -1;
    const show = async (key: string) => {
      // drawn now (by a tab or lens control, or by scrolling into view): the observer's job is done
      near.disconnect();
      current = key;
      const tab = tabs.find((t) => t.key === key) ?? tabs[0];
      const lens = lensSel.value as Lens;
      panel.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === tab.key)));
      panel.querySelectorAll<HTMLElement>("[data-legend]").forEach((l) => (l.hidden = l.dataset.legend !== lens));
      // Cytoscape and the layout are the heaviest part of a page, so they load only when the graph is needed
      const m = await loadOnDemand(canvas, () => import("../ui/graph-canvas.ts"));
      if (!m || gone || current !== tab.key) return;
      cy?.destroy();
      cy = m.mountGraph(canvas, tab.data(), { layout: tab.layout, lens, classify, onOpen: (nid) => openDrawer(ctx, nid, canvas) });
    };
    // draw when the graph scrolls near the screen, not on page load
    const near = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void show(current), { rootMargin: "300px" });
    panel.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.addEventListener("click", () => void show(b.dataset.tab!)));
    lensSel.addEventListener("change", () => void show(current));
    canvas.setAttribute("data-loading", "");
    near.observe(canvas);
    return () => {
      gone = true;
      near.disconnect();
      cy?.destroy();
      closeDrawer();
    };
  };
  return { body, mount };
}

/**
 * What the labels mean, shown on the page. The labels also carry the same text as a tooltip
 * (title), but tooltips reach neither touch screens nor keyboards.
 */
export function labelKey(): Raw {
  const origins = Object.keys(ORIGIN_HELP) as (keyof typeof ORIGIN_HELP)[];
  const selections = Object.keys(SELECTION_HELP) as (keyof typeof SELECTION_HELP)[];
  return html`<details class="labelkey"><summary>What the labels mean</summary>
    <div class="labelkey-grid">
      <div><p class="labelkey-h">What created the body or post</p><dl>${origins.map((k) => html`<dt><span class="tag org-${k}">${ORIGIN_LABEL[k]}</span></dt><dd>${ORIGIN_HELP[k]}</dd>`)}</dl></div>
      <div><p class="labelkey-h">How the post is filled</p><dl>${selections.map((k) => html`<dt><span class="tag sel-${k}">${SELECTION_LABEL[k]}</span></dt><dd>${SELECTION_HELP[k]}</dd>`)}</dl></div>
      <div><p class="labelkey-h">How sure the record is</p><dl>
        <dt><span class="hint">No label</span></dt><dd>${CONFIDENCE_NOTE.high}</dd>
        <dt><span class="chip conf-medium">Verify</span></dt><dd>${CONFIDENCE_NOTE.medium}</dd>
        <dt><span class="chip conf-low">Provisional</span></dt><dd>${CONFIDENCE_NOTE.low}</dd>
      </dl><p class="hint">A post's tenure, such as "Coterminous" or "Until age 65", is explained on the post's own page.</p></div>
    </div>
  </details>`;
}

/** Who headed the federal government on a date (YYYY or YYYY-MM or YYYY-MM-DD). */
export function governmentAt(ix: GraphIndex, date: string) {
  const d = date.length === 4 ? `${date}-07` : date;
  return ix.g.pm_terms.find((t) => t.since <= d && (!t.until || d < t.until));
}

const CASE_STATUS: Record<string, [string, string]> = {
  pending: ["Pending", "flag"],
  convicted: ["Convicted", "flag-bad"],
  convicted_on_appeal: ["Conviction upheld", "flag-bad"],
  acquitted: ["Acquitted", "sel-elected"],
  quashed: ["Quashed", "sel-elected"],
  withdrawn: ["Withdrawn", "flag-info"],
  stayed: ["Stayed", "flag"],
  pardoned: ["Pardoned", "flag-info"],
};

const SOURCE_KIND: Record<string, string> = { court_record: "Court record", official: "Official", news: "News report" };

/** The case's dated history as a compact list, oldest first, each event with its own labelled source. */
function caseTimeline(timeline: NonNullable<Human["legal_cases"]>[number]["timeline"]): Raw | string {
  if (!timeline?.length) return "";
  return html`<ol class="case-timeline" aria-label="Case timeline">${timeline.map(
    (e) => html`<li><span class="num">${e.date}</span>${e.court ? html` · <span class="hint">${e.court}</span>` : ""}<div>${e.description}${
      e.source_url
        ? html` <a class="case-src" href="${safeHref(e.source_url)}" title="${e.source_title ?? ""}" target="_blank" rel="noopener noreferrer">${SOURCE_KIND[e.source_type ?? "news"]}</a>`
        : ""
    }</div></li>`,
  )}</ol>`;
}

export function casesTable(ix: GraphIndex, rows: { person: Human; c: NonNullable<Human["legal_cases"]>[number] }[], showPerson: boolean): Raw {
  const ext = (s: { title: string; url?: string }) => html`<a href="${safeHref(s.url)}" target="_blank" rel="noopener noreferrer">${s.title}</a>`;
  return html`<div class="tablewrap"><table class="cases"><thead><tr>${showPerson ? html`<th>Person</th>` : ""}<th>Case and charge</th><th>Outcome</th><th>Filed</th><th>Sentence, fine, custody</th><th>Sources</th></tr></thead><tbody>${rows.map(({ person, c }) => {
    const gov = governmentAt(ix, c.filed);
    const [label, cls] = CASE_STATUS[c.status];
    return html`<tr>
      ${showPerson ? html`<td>${link(ix, person.id)}${person.party ? html`<div class="hint">${partyLink(ix, person.party)}</div>` : ""}</td>` : ""}
      <td><b>${c.title}</b>${c.charges ? html`<div class="case-charge"><span class="hint">Charge:</span> ${c.charges}</div>` : ""}${c.court ? html`<div class="hint">${c.court}</div>` : ""}${
        ALLEGATION_STATUSES.includes(c.status) ? html`<div class="hint case-allegation">Allegations are not findings of guilt.</div>` : ""
      }${caseTimeline(c.timeline)}</td>
      <td class="case-outcome"><span class="tag ${cls}">${label}</span>${c.status_as_of ? html`<div class="hint num">as of ${c.status_as_of}</div>` : ""}${c.outcome ? html`<div class="hint">${c.outcome}</div>` : ""}${
        c.status_source ? html`<div class="hint">Outcome source: ${ext(c.status_source)}</div>` : ""
      }</td>
      <td class="num">${c.filed}${c.filed_by ? html`<div class="hint">by ${ix.org.has(c.filed_by) ? link(ix, c.filed_by, ix.shortLabel(c.filed_by)) : c.filed_by}</div>` : ""}${
        gov ? html`<div class="hint">under PM ${link(ix, gov.person, ix.label(gov.person))}${gov.status === "caretaker" ? " (caretaker)" : ""}</div>` : ""
      }</td>
      <td>${c.sentence ? html`<div>${c.sentence}</div>` : ""}${c.fine ? html`<div>Fine: ${c.fine}</div>` : ""}${c.custody ? html`<div class="hint">Custody: ${c.custody}</div>` : ""}</td>
      <td>${c.sources.map((s, i) => html`${i ? html`<br />` : ""}${ext(s)}`)}</td>
    </tr>`;
  })}</tbody></table></div>`;
}

export const CASES_NOTE =
  "Each case is published only with a cited source, and its outcome is shown beside the charge with the date that outcome is stated as of. Charges are allegations: a case filed is not a conviction, and allegations are not findings of guilt. Acquittals and stays are shown with the same prominence as convictions. The government in power is worked out from the filing date. To report an error, open an issue with a source.";
