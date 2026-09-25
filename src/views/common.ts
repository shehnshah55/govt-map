import type { GraphIndex, Post, Edge } from "../lib/graph-index.ts";
import type { LegalRef, Source } from "../schema.ts";
import { html, raw, type Raw } from "../ui/dom.ts";
import { BRANCH_LABEL, CONFIDENCE_NOTE, KIND_LABEL, METHOD_LABEL, REL_PHRASE, STATUS_LABEL } from "../ui/labels.ts";
import { mountGraph, type LayoutName, type VEdge, type VNode } from "../ui/graph-view.ts";

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
  return html`<ul class="plain">${sources.map((s) => html`<li>${s.url ? html`<a href="${s.url}" target="_blank" rel="noopener">${s.title}</a>` : s.title}</li>`)}</ul>`;
}

export function editLink(ctx: Ctx, file: string) {
  return html`<a href="${ctx.repo}/blob/main/${file}" target="_blank" rel="noopener" class="mono">${file}</a>`;
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
      <div class="appoint" style="margin-top:6px">${appointmentSentence(ix, p)}</div>
    </div>
    <div class="holder">
      ${
        holders.length
          ? holders.map(
              (h) => html`<div class="name">${link(ix, h.person.id)}</div>
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

/** A graph panel with tab buttons; returns markup plus a mount function. */
export function graphPanel(ctx: Ctx, id: string, tabs: GraphTab[], opts: { tall?: boolean; note?: string } = {}) {
  const body = html`<div class="graphpanel" id="${id}">
    <div class="graphbar">
      <div class="seg" role="group" aria-label="Graph view">
        ${tabs.map((t, i) => html`<button type="button" data-tab="${t.key}" aria-pressed="${i === 0 ? "true" : "false"}">${t.label}</button>`)}
      </div>
      <span class="hint">${opts.note ?? "Hover to highlight · click a node to open it · scroll to zoom"}</span>
    </div>
    <div class="canvas${opts.tall ? " tall" : ""}" role="img" aria-label="Relationship graph"></div>
    <div class="legend">
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
  </div>`;
  const mount = (root: HTMLElement) => {
    const panel = root.querySelector<HTMLElement>(`#${id}`);
    if (!panel) return;
    const canvas = panel.querySelector<HTMLElement>(".canvas")!;
    let cy: ReturnType<typeof mountGraph> | undefined;
    const show = (key: string) => {
      const tab = tabs.find((t) => t.key === key) ?? tabs[0];
      panel.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === tab.key)));
      cy?.destroy();
      cy = mountGraph(canvas, tab.data(), { layout: tab.layout, onOpen: (nid) => ctx.go(hrefFor(ctx.ix, nid).slice(1)) });
    };
    panel.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab!)));
    show(tabs[0].key);
    return () => cy?.destroy();
  };
  return { body, mount };
}
