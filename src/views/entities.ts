import type { Org, Post } from "../lib/graph-index.ts";
import type { OrgKind, RelationType } from "../schema.ts";
import { html, type Raw } from "../ui/dom.ts";
import { hemicycle } from "../ui/hemicycle.ts";
import { SELECTION_HELP, SELECTION_LABEL, tenureLabel } from "../ui/labels.ts";
import { orgNeighbourhood, hierarchy } from "../ui/graph-view.ts";
import { KIND_GROUP, METHOD_LABEL, SECTOR_LABEL, CONFIDENCE_NOTE } from "../ui/labels.ts";
import {
  branchChip,
  chain,
  confidenceChip,
  editLink,
  graphPanel,
  kindLabel,
  legalList,
  legalRef,
  link,
  postRow,
  relationRows,
  sourcesList,
  statusChip,
  partyLink,
  orgTags,
  postTags,
  holdingFlags,
  roleOf,
  originTag,
  selectionTag,
  casesTable,
  CASES_NOTE,
  type Ctx,
  type View,
} from "./common.ts";
import { safeHref } from "../lib/safe-url.ts";
import { careerSummary } from "../lib/analytics.ts";
import type { Human } from "../lib/graph-index.ts";

/** Career records as far as the data goes (§7.14). Each figure says what it is based on. */
function careerFacts(ctx: Ctx, person: Human) {
  const { ix } = ctx;
  const c = careerSummary(ix, person);
  const years = c.electedDays / 365.25;
  return html`<dl class="career" style="margin-bottom:14px">
    <div><dt>Elected to a house, terms recorded</dt><dd>${c.elected.length ? c.elected.map((e, i) => html`${i ? ", " : ""}${ix.shortLabel(e.org)} ${e.terms}`) : "none recorded"}</dd></div>
    <div><dt>Years in elected office, as recorded</dt><dd class="num">${years >= 0.1 ? years.toFixed(1) : "–"}</dd></div>
    <div><dt>Different offices recorded</dt><dd class="num">${c.offices}${c.firstRecorded ? html` <span class="hint">since ${c.firstRecorded.slice(0, 4)}</span>` : ""}</dd></div>
    <div><dt>Party changes</dt><dd><span class="hint">Party history not yet recorded</span></dd></div>
  </dl>
  <p class="hint" style="margin:-6px 0 12px">Counts cover only the terms in this dataset, which for most people starts with their current office. "Years in elected office" includes offices filled by an elected house (Prime Minister, Chief Minister, Speaker), and overlapping offices count once.</p>`;
}

const STRUCTURAL: RelationType[] = ["part_of", "established_by", "head_of", "seat_in"];

function placeTrail(ctx: Ctx, jurId: string) {
  const trail = ctx.ix.placeTrail(jurId);
  return html`${trail.map((p, i) => html`${i ? html`<span aria-hidden="true">›</span>` : ""}<a href="#/place/${p.id}">${p.name}</a>`)}`;
}

function orgCard(ctx: Ctx, o: Org) {
  const { ix } = ctx;
  const head = ix.leadership(o.id).find((p) => p.role !== "member" && p.role !== "judge");
  const holder = head ? ix.effectiveHolders(head.id)[0] : undefined;
  const n = ix.children.get(o.id)?.length ?? 0;
  return html`<a class="card" href="#/org/${o.id}">
    <span class="t">${o.name}</span>
    <span>${originTag(o._origin)}</span>
    <span class="s">${o.short_name && o.short_name !== o.name ? html`<span>${o.short_name}</span>` : ""}<span>${kindLabel(o.kind)}</span>${
      n ? html`<span class="num">${n} sub-bodies</span>` : ""
    }${o.abolished ? html`<span class="chip hist">abolished ${o.abolished.slice(0, 4)}</span>` : ""}${o.confidence !== "high" ? html`<span>· verify</span>` : ""}</span>
    ${holder ? html`<span class="who">${holder.person.name}</span>` : ""}
  </a>`;
}

export function orgGroups(ctx: Ctx, orgs: Org[]) {
  const used = new Set<string>();
  const groups = KIND_GROUP.map(([kinds, label]) => {
    const items = orgs.filter((o) => kinds.includes(o.kind as OrgKind) && !used.has(o.id));
    items.forEach((o) => used.add(o.id));
    return { label, items };
  }).filter((g) => g.items.length);
  return html`<div class="groups">${groups.map(
    (g) => html`<div class="group"><h3>${g.label} <span class="count num">${g.items.length}</span></h3>
      <div class="cards">${g.items.slice(0, 120).map((o) => orgCard(ctx, o))}</div>
      ${g.items.length > 120 ? html`<p class="hint" style="margin-top:8px">Showing 120 of ${g.items.length}. Use search to find the rest.</p>` : ""}</div>`,
  )}</div>`;
}

export function orgView(ctx: Ctx, id: string): View | undefined {
  const { ix } = ctx;
  const o = ix.org.get(id);
  if (!o) return;
  const trail = ix.orgTrail(id);
  const kids = (ix.children.get(id) ?? []).filter((c) => !c.abolished);
  const all = ix.descendants(id);
  const allPosts = ix.leadership(id);
  const seats = allPosts.filter((p) => p.area || p.seat_type);
  const posts = allPosts.filter((p) => !seats.includes(p));
  const top = posts.find((p) => p.role !== "member" && p.role !== "judge");
  const partyMembers = o.kind === "political_party" ? ix.g.people.filter((p) => p.party === id) : [];
  const { outgoing, incoming } = ix.relationsOf(id, [...STRUCTURAL, "appoints", "elects", "nominates", "advises", "confirms", "holds"]);
  const place = ix.place.get(o.jurisdiction);
  const tier = ix.tierOf(o.jurisdiction);

  const graph = graphPanel(ctx, "g-org", [
    { key: "structure", label: "Structure", data: () => orgNeighbourhood(ix, id, "structure"), layout: kids.length > 12 ? "cose" : "dagre-tb" },
    { key: "connections", label: "Connections", data: () => orgNeighbourhood(ix, id, "connections"), layout: "concentric" },
    ...(all.length > kids.length ? [{ key: "tree", label: "Full tree", data: () => hierarchy(ix, id, 4), layout: "dagre-lr" as const }] : []),
  ]);

  // Counterparts in other tiers for the same sectors (the post-devolution view).
  const sectors = o.sectors ?? [];

  const body = html`
    <nav class="trail" aria-label="Breadcrumb">
      ${placeTrail(ctx, o.jurisdiction)}
      ${trail.slice(0, -1).map((t) => html`<span aria-hidden="true">›</span><a href="#/org/${t.id}">${t.short_name ?? t.name}</a>`)}
    </nav>
    <header class="pagehead">
      <div class="eyebrow">${kindLabel(o.kind)} ${branchChip(o.branch)} ${confidenceChip(o.confidence)} ${
        o.abolished ? html`<span class="chip hist">Abolished ${o.abolished}</span>` : ""
      }</div>
      <h1>${o.name}</h1>
      ${o.name_ur ? html`<p class="urdu" lang="ur">${o.name_ur}</p>` : ""}
      <div>${orgTags(ix, o)}</div>
      ${top && ix.effectiveHolders(top.id).length ? html`<p><a href="#/post/${top.id}">${top.title}</a>: ${ix.effectiveHolders(top.id).map((h, i) => html`${i ? ", " : ""}<b>${link(ix, h.person.id)}</b>${h.person.party ? html` (${partyLink(ix, h.person.party)})` : ""}`)}</p>` : ""}
      ${o.description ? html`<p class="lede">${o.description}</p>` : ""}
    </header>
    <div class="layout">
      <div class="stack">
        ${o.composition ? html`<section><h2>Seating and party strength</h2>${hemicycle(ix, id)}</section>` : ""}
        ${
          posts.length
            ? html`<section><h2>Leadership <span class="count num">${posts.length} posts</span></h2>
              <div class="posts">${posts.slice(0, 12).map((p) => postRow(ix, p))}</div>
              ${posts.length > 12 ? html`<p class="hint" style="margin-top:8px">${posts.length - 12} more posts listed on their own pages.</p>` : ""}
              ${top ? html`<div style="margin-top:12px"><div class="hint" style="margin-bottom:6px">Chain of authority for the top post — who puts this office-holder in place, traced back to its democratic or constitutional source:</div>${chain(ix, top.id)}</div>` : ""}
            </section>`
            : ""
        }
        ${seats.length ? html`<section><h2>Seats and members <span class="count num">${seatTotal(seats)} seats</span></h2>${roster(ctx, seats)}</section>` : ""}
        ${
          partyMembers.length
            ? html`<section><h2>Members holding office <span class="count num">${partyMembers.length}</span></h2>
              <div class="posts">${partyMembers.flatMap((m) => m.roles.filter((r) => !r.until).slice(0, 1).map((r) => postRow(ix, ix.post.get(r.position)!, { showOrg: true })))}</div></section>`
            : ""
        }
        ${o.history?.length ? html`<section><h2>Legal history</h2>${historyTimeline(ctx, o.history)}</section>` : ""}
        ${
          o.functions?.length
            ? html`<section><h2>Functions</h2><ul class="prose" style="padding-left:1.2em;margin:0">${o.functions.map((f) => html`<li>${f}</li>`)}</ul></section>`
            : ""
        }
        <section><h2>Graph</h2>${graph.body}</section>
        ${
          kids.length
            ? html`<section><h2>Organization <span class="count num">${kids.length} direct · ${all.length} total bodies</span></h2>${orgGroups(ctx, kids)}</section>`
            : ""
        }
        ${
          outgoing.length + incoming.length
            ? html`<section><h2>Relationships <span class="count num">${outgoing.length + incoming.length}</span></h2>
              <div class="rels">${relationRows(ix, outgoing, "out")}${relationRows(ix, incoming, "in")}</div></section>`
            : ""
        }
        ${
          sectors.length
            ? html`<section><h2>Across every level of government</h2>
              <p class="hint" style="margin-bottom:10px">Since the 18th Amendment most services are provincial. Compare the bodies responsible for the same sector in each government.</p>
              <div class="sectors">${sectors.map((s) => html`<a href="#/sector/${s}">${SECTOR_LABEL[s]} in every government →</a>`)}</div></section>`
            : ""
        }
      </div>
      <aside class="rail">
        <div class="panel"><h3>Key facts</h3>
          <dl class="facts">
            <dt>Type</dt><dd>${kindLabel(o.kind)}</dd>
            <dt>Branch</dt><dd>${branchChip(o.branch)}</dd>
            <dt>Government</dt><dd>${tier ? link(ix, tier.id) : ""}${place && tier && place.id !== tier.id ? html` · ${link(ix, place.id)}` : ""}</dd>
            ${o.parent ? html`<dt>Part of</dt><dd>${link(ix, o.parent)}</dd>` : ""}
            ${o.established ? html`<dt>Established</dt><dd class="num">${o.established}</dd>` : ""}
            ${o.abolished ? html`<dt>Abolished</dt><dd class="num">${o.abolished}</dd>` : ""}
            ${o.website ? html`<dt>Website</dt><dd><a href="${safeHref(o.website)}" target="_blank" rel="noopener noreferrer">${o.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a></dd>` : ""}
            ${o.employees ? html`<dt>Employees</dt><dd class="num">${o.employees.count.toLocaleString()} (${o.employees.as_of})</dd>` : ""}
            ${o.budget?.length ? html`<dt>Budget</dt><dd>${o.budget.map((b) => html`<div class="num">Rs ${(b.amount_pkr / 1e9).toFixed(1)}bn ${b.type}, FY${b.fiscal_year}</div>`)}</dd>` : ""}
            <dt>Sub-bodies</dt><dd class="num">${all.length}</dd>
            ${sectors.length ? html`<dt>Sectors</dt><dd>${sectors.map((s, i) => html`${i ? ", " : ""}<a href="#/sector/${s}">${SECTOR_LABEL[s]}</a>`)}</dd>` : ""}
          </dl>
        </div>
        <div class="panel"><h3>Legal basis</h3>${legalList(ix, o.legal_basis)}</div>
        <div class="panel"><h3>Sources</h3>${sourcesList(o.sources)}</div>
        <div class="panel"><h3>Data record</h3>
          <dl class="facts">
            <dt>Confidence</dt><dd>${o.confidence} — ${CONFIDENCE_NOTE[o.confidence]}</dd>
            <dt>ID</dt><dd class="mono">${o.id}</dd>
            <dt>File</dt><dd>${editLink(ctx, o._file)}</dd>
          </dl>
          ${o.notes ? html`<p class="hint" style="margin-top:8px">${o.notes}</p>` : ""}
        </div>
      </aside>
    </div>`;
  return {
    title: o.name,
    body,
    mount: (root) => {
      wireFilters(root);
      return graph.mount(root);
    },
  };
}

/** Dated legal history of an office or body, each step linked to the law that made it. */
export function historyTimeline(ctx: Ctx, history: { year: number; law: string; provision?: string; change: string }[] | undefined): Raw {
  if (!history?.length) return html``;
  const { ix } = ctx;
  return html`<ol class="timeline">${[...history]
    .sort((a, b) => a.year - b.year)
    .map(
      (h) => html`<li><span class="yr">${h.year}</span>${h.change} <span class="hint">— ${link(ix, h.law, ix.law.get(h.law)?.short ?? ix.law.get(h.law)?.title)}${h.provision ? html` <span class="cite">${h.provision}</span>` : ""}</span></li>`,
    )}</ol>`;
}

function seatTotal(seats: Post[]) {
  return seats.reduce((n, p) => n + (p.seats ?? 1), 0);
}

/** Seat roster for a legislature: one row per constituency or reserved-seat group, with a live filter. */
export function roster(ctx: Ctx, seats: Post[]) {
  const { ix } = ctx;
  const general = seats.filter((p) => !p.seats);
  const filled = general.filter((p) => ix.currentHolders(p.id).length).length;
  const total = seatTotal(seats);
  const named = seats.reduce((n, p) => n + ix.currentHolders(p.id).length, 0);
  return html`<p class="hint" style="margin-bottom:10px"><span class="num">${named}</span> of <span class="num">${total}</span> members recorded (${filled} of ${general.length} constituency seats). Add members from the ECP's notified results to <span class="mono">data/people.yaml</span>.</p>
    <div class="toolbar"><input type="search" data-filter="roster" placeholder="Filter by seat, area, member or party" aria-label="Filter seats" /></div>
    <div class="tablewrap" style="max-height:520px;overflow:auto"><table data-rows="roster">
      <thead><tr><th>Seat</th><th>Area</th><th>Member</th><th>Party</th></tr></thead>
      <tbody>${seats.map((p) => {
        const holders = ix.currentHolders(p.id);
        const area = p.area ? ix.place.get(p.area) : undefined;
        const areaParent = area?.kind === "constituency" && area.parent ? ix.place.get(area.parent) : area;
        const label = area?.kind === "constituency" ? area.name : p.seats ? `${p.seats} ${p.seat_type?.replace("_", "-")} seats` : p.title;
        return html`<tr>
          <td class="mono"><a href="#/post/${p.id}">${label}</a></td>
          <td>${areaParent ? link(ix, areaParent.id, areaParent.name.replace(/ (District|Division)$/, "")) : ""}</td>
          <td>${holders.length ? holders.map((h, i) => html`${i ? ", " : ""}${link(ix, h.person.id)}`) : html`<span class="hint">not recorded</span>`}</td>
          <td>${holders.map((h, i) => html`${i ? ", " : ""}${partyLink(ix, h.person.party)}`)}</td>
        </tr>`;
      })}</tbody>
    </table></div>`;
}

export function postView(ctx: Ctx, id: string): View | undefined {
  const { ix } = ctx;
  const p = ix.post.get(id);
  if (!p) return;
  const org = ix.org.get(p.org)!;
  const a = p.appointment;
  const current = ix.currentHolders(id);
  const past = ix.pastHolders(id);
  const via = ix.effectiveHolders(id);
  const powers = (ix.out.get(id) ?? []).filter((e) => ["appoints", "elects", "nominates", "confirms", "advises"].includes(e.type));
  const exOfficio = (ix.out.get(id) ?? []).filter((e) => e.type === "holds");
  const memberships = (ix.out.get(id) ?? []).filter((e) => e.type === "member_of" || e.type === "chairs");
  const graph = graphPanel(ctx, "g-post", [
    { key: "power", label: "Powers", data: () => postGraph(ctx, id), layout: "dagre-lr" },
  ]);
  const body = html`
    <nav class="trail" aria-label="Breadcrumb">${placeTrail(ctx, org.jurisdiction)}<span aria-hidden="true">›</span>${link(ix, org.id)}</nav>
    <header class="pagehead">
      <div class="eyebrow">Post ${p.seats ? html`<span class="chip num">${p.seats} seats</span>` : statusChip(ix, id)} ${p.grade ? html`<span class="cite">${p.grade}</span>` : ""} ${confidenceChip(p.confidence)} ${
        p.generated ? html`<span class="chip gen" title="Created from the standard structure of this type of body">Standard post</span>` : ""
      }</div>
      <h1>${p.title}</h1>
      <div>${postTags(ix, p)}</div>
      ${p.description ? html`<p class="lede">${p.description}</p>` : ""}
    </header>
    <div class="layout">
      <div class="stack">
        <section><h2>Held by</h2>
          ${
            via.length
              ? html`<div class="posts">${via.map(
                  (h) => html`<div class="post"><div class="holder"><div class="name">${link(ix, h.person.id)}</div>
                    ${current.length ? holdingFlags(ix, { ...h, ...roleOf(h.person, id) }, id) : ""}
                    ${extensionList(ctx, h.person, id)}
                    <div class="hint">${partyLink(ix, h.person.party)}${!current.length ? " · holds this post ex officio" : ""}</div></div>
                    <div class="hint">${h.status !== "confirmed" ? html`<span class="chip st-acting">${h.status.replace(/_/g, " ")}</span> ` : ""}${h.since ? html`Since <span class="num">${h.since}</span>` : ""} · record as of <span class="num">${h.person.as_of}</span> ${confidenceChip(h.person.confidence)}</div></div>`,
                )}</div>`
              : html`<p class="hint">${p.seats ? "Multi-member body. Individual members are not yet recorded." : "No current holder recorded. Help by adding one to data/people.yaml with a source."}</p>`
          }
          ${past.length ? html`<h3 style="margin:16px 0 8px">Previous holders</h3><ul class="plain">${past.map((h) => html`<li>${link(ix, h.person.id)} <span class="hint num">${h.since ?? "?"} – ${h.until}</span></li>`)}</ul>` : ""}
        </section>
        <section><h2>Classification and tenure</h2>
          <div class="panel">
            <dl class="facts">
              <dt>Created by</dt><dd>${originTag(p._origin)} ${p.appointment?.legal_basis?.length ? p.appointment.legal_basis.map((lb, i) => html`${i ? "; " : ""}${legalRef(ix, lb)}`) : html`<span class="hint">see the body's legal basis</span>`}</dd>
              <dt>Filled by</dt><dd><span class="tag sel-${p._selection}">${SELECTION_LABEL[p._selection]}</span> <span class="hint">${SELECTION_HELP[p._selection]}</span></dd>
              ${p._tenure ? html`<dt>Tenure</dt><dd><b>${tenureLabel(p._tenure)}</b>${p._tenure.notes ? html` — ${p._tenure.notes}` : ""}${p._tenure.legal_basis?.length ? html` <span class="hint">(${p._tenure.legal_basis.map((lb, i) => html`${i ? "; " : ""}${legalRef(ix, lb)}`)})</span>` : ""}</dd>` : ""}
              ${p._tenure?.extension_by ? html`<dt>Extension by</dt><dd>${link(ix, p._tenure.extension_by)}</dd>` : ""}
              ${p._tenure?.holdover ? html`<dt>Holdover</dt><dd>Continues after the term ends until a successor takes office</dd>` : ""}
            </dl>
          </div>
        </section>
        ${p.history?.length ? html`<section><h2>Legal history</h2><p class="hint" style="margin-bottom:10px">How the Constitution and statutes have changed this office over time.</p>${historyTimeline(ctx, p.history)}</section>` : ""}
        <section><h2>How the post is filled</h2>
          <div class="panel">
            <dl class="facts">
              ${a ? html`<dt>Method</dt><dd>${METHOD_LABEL[a.method]}</dd>` : ""}
              ${a?.by ? html`<dt>${a.method.includes("election") ? "Elected by" : "Appointed by"}</dt><dd>${link(ix, a.by)}</dd>` : ""}
              ${a?.on_advice_of ? html`<dt>On advice of</dt><dd>${link(ix, a.on_advice_of)}</dd>` : ""}
              ${a?.nominated_by ? html`<dt>Nominated by</dt><dd>${link(ix, a.nominated_by)}</dd>` : ""}
              ${a?.consultation?.length ? html`<dt>Consultation</dt><dd>${a.consultation.map((c, i) => html`${i ? ", " : ""}${link(ix, c)}`)}</dd>` : ""}
              ${a?.confirmation ? html`<dt>Confirmed by</dt><dd>${link(ix, a.confirmation)}</dd>` : ""}
              ${p.ex_officio_of ? html`<dt>Ex officio</dt><dd>${link(ix, p.ex_officio_of)}</dd>` : ""}
              ${a?.term ? html`<dt>Term</dt><dd>${a.term}</dd>` : ""}
              ${a?.removal ? html`<dt>Removal</dt><dd>${a.removal}</dd>` : ""}
              ${a?.legal_basis?.length ? html`<dt>Legal basis</dt><dd>${a.legal_basis.map((lb, i) => html`${i ? "; " : ""}${legalRef(ix, lb)}`)}</dd>` : ""}
            </dl>
            ${a?.notes ? html`<p class="hint" style="margin-top:10px">${a.notes}</p>` : ""}
          </div>
          <div style="margin-top:12px">${chain(ix, id)}</div>
        </section>
        ${
          powers.length || exOfficio.length || memberships.length
            ? html`<section><h2>Powers and roles <span class="count num">${powers.length + exOfficio.length + memberships.length}</span></h2>
              <div class="rels">${relationRows(ix, [...exOfficio, ...memberships, ...powers], "out")}</div></section>`
            : ""
        }
        <section><h2>Graph</h2>${graph.body}</section>
      </div>
      <aside class="rail">
        <div class="panel"><h3>Post</h3>
          <dl class="facts">
            <dt>Body</dt><dd>${link(ix, org.id)}</dd>
            <dt>Role</dt><dd>${p.role.replace(/_/g, " ")}</dd>
            ${p.grade ? html`<dt>Grade</dt><dd>${p.grade}</dd>` : ""}
            ${p.seats ? html`<dt>Seats</dt><dd class="num">${p.seats}</dd>` : ""}
            <dt>Branch</dt><dd>${branchChip(org.branch)}</dd>
          </dl>
        </div>
        <div class="panel"><h3>Data record</h3>
          <dl class="facts">
            <dt>Confidence</dt><dd>${p.confidence}</dd>
            <dt>ID</dt><dd class="mono">${p.id}</dd>
            <dt>File</dt><dd>${editLink(ctx, p._file)}</dd>
          </dl>
          ${p.generated ? html`<p class="hint" style="margin-top:8px">This post follows the standard structure (every Division has a Federal Secretary; every provincial department has a Minister and a Secretary). Author it explicitly in the data to add detail.</p>` : ""}
        </div>
      </aside>
    </div>`;
  return { title: p.title, body, mount: graph.mount };
}

function extensionList(ctx: Ctx, person: { roles: { position: string; until?: string; extensions?: { granted?: string; to?: string; by?: string; law?: string; notes?: string }[] }[] }, postId: string): Raw {
  const role = person.roles.find((r) => r.position === postId && !r.until);
  if (!role?.extensions?.length) return html``;
  const { ix } = ctx;
  return html`<ol class="timeline" style="margin:8px 0">${role.extensions.map(
    (x) => html`<li><span class="yr">${x.granted ?? ""}</span>Extended${x.to ? ` to ${x.to}` : ""}${x.by ? html` by ${link(ix, x.by, ix.shortLabel(x.by))}` : ""}${x.law ? html` under ${link(ix, x.law, ix.law.get(x.law)?.short ?? ix.law.get(x.law)?.title)}` : ""}${x.notes ? html` <span class="hint">— ${x.notes}</span>` : ""}</li>`,
  )}</ol>`;
}

function postGraph(ctx: Ctx, id: string) {
  const { ix } = ctx;
  const nodes = new Map<string, { id: string; label: string; type: "organization" | "position" | "person" | "jurisdiction" | "law"; branch?: string; focus?: boolean }>();
  const edges: { source: string; target: string; type: RelationType }[] = [];
  const add = (nid: string, focus = false) => {
    const k = ix.kindOf(nid);
    if (!k || nodes.has(nid)) return;
    const branch = k === "organization" ? ix.org.get(nid)!.branch : k === "position" ? ix.org.get(ix.post.get(nid)!.org)?.branch : undefined;
    nodes.set(nid, { id: nid, label: ix.shortLabel(nid), type: k, branch, focus });
  };
  add(id, true);
  const p = ix.post.get(id)!;
  add(p.org);
  edges.push({ source: id, target: p.org, type: "head_of" });
  for (const e of ix.in.get(id) ?? []) {
    if (["appoints", "elects", "nominates", "confirms", "advises", "holds"].includes(e.type)) {
      add(e.from);
      edges.push({ source: e.from, target: id, type: e.type });
    }
  }
  for (const e of (ix.out.get(id) ?? []).slice(0, 60)) {
    if (["appoints", "elects", "nominates", "confirms", "advises", "holds", "member_of", "chairs"].includes(e.type)) {
      add(e.to);
      edges.push({ source: id, target: e.to, type: e.type });
    }
  }
  return { nodes: [...nodes.values()], edges };
}

export function personView(ctx: Ctx, id: string): View | undefined {
  const { ix } = ctx;
  const person = ix.person.get(id);
  if (!person) return;
  const current = person.roles.filter((r) => !r.until);
  const past = person.roles.filter((r) => r.until);
  const body = html`
    <nav class="trail"><a href="#/">Pakistan</a><span aria-hidden="true">›</span><a href="#/accountability">Officeholders</a></nav>
    <header class="pagehead">
      <div class="eyebrow">Person ${confidenceChip(person.confidence)}</div>
      <h1>${person.name}</h1>
      ${person.name_ur ? html`<p class="urdu" lang="ur">${person.name_ur}</p>` : ""}
      ${person.party ? html`<p class="lede">${partyLink(ix, person.party)}</p>` : ""}
      <div class="tags">${current.map((r) => {
        const p = ix.post.get(r.position)!;
        const area = p.area ? ix.place.get(p.area) : undefined;
        return html`<a class="tag sel-${p._selection}" href="#/post/${p.id}">${area?.kind === "constituency" ? area.name : p.title}</a><a class="tag tenure" href="#/org/${p.org}">${ix.shortLabel(p.org)}</a>${area ? html`<a class="tag law" href="#/place/${area.parent ?? area.id}">${ix.place.get(area.parent ?? "")?.name ?? area.name}</a>` : ""}`;
      })}</div>
    </header>
    <div class="layout">
      <div class="stack">
        <section><h2>Current posts</h2>
          ${current.length ? html`<div class="posts">${current.map((r) => postRow(ix, ix.post.get(r.position)!, { showOrg: true }))}</div>` : html`<p class="hint">No current post recorded.</p>`}
        </section>
        ${
          person.roles.length > 1 || past.length
            ? html`<section><h2>Career <span class="count num">${person.roles.length} offices</span></h2>
              <p class="hint" style="margin-bottom:10px">Every office recorded for this person, current and previous: elected, appointed, military, judicial and party posts.</p>
              ${careerFacts(ctx, person)}
              <ol class="timeline">${[...person.roles]
                .sort((a, b) => (b.since ?? "").localeCompare(a.since ?? ""))
                .map((r) => {
                  const p = ix.post.get(r.position)!;
                  return html`<li><span class="yr">${r.since?.slice(0, 7) ?? "?"} – ${r.until ? r.until.slice(0, 7) : "present"}</span><a href="#/post/${p.id}"><b>${p.title}</b></a>
                    <div class="tags" style="margin-top:4px">${selectionTag(p)}<a class="tag tenure" href="#/org/${p.org}">${ix.shortLabel(p.org)}</a>${
                      r.status !== "confirmed" ? html`<span class="tag flag">${r.status.replace(/_/g, " ")}</span>` : ""
                    }${r.term_number && r.term_number > 1 ? html`<span class="tag flag-info">term ${r.term_number}</span>` : ""}</div></li>`;
                })}</ol></section>`
            : ""
        }
        ${
          person.background?.length
            ? html`<section><h2>Background</h2><ul class="plain">${person.background.map(
                (b) => html`<li><span class="tag ${b.service === "military" ? "sel-military" : b.service === "judiciary" ? "sel-judicial" : b.service === "civil_service" ? "sel-civil_service" : "flag-info"}">${b.service.replace(/_/g, " ")}</span> ${b.rank ?? ""}${b.retired ? html` · <b>retired</b>${b.retired !== "yes" ? ` ${b.retired}` : ""}` : b.service === "military" ? html` · <b>serving</b>` : ""}${b.notes ? html` <span class="hint">— ${b.notes}</span>` : ""}</li>`,
              )}</ul></section>`
            : ""
        }
        ${
          person.declared_assets?.length
            ? html`<section><h2>Declared assets</h2>
              <div class="tablewrap"><table><thead><tr><th>Declared</th><th class="n">Assets (PKR)</th><th class="n">Liabilities</th><th class="n">Net worth</th><th>Basis</th><th>Source</th></tr></thead>
              <tbody>${person.declared_assets.map(
                (a) => html`<tr><td class="num">${a.as_of}</td><td class="n">Rs ${formatPkr(a.amount_pkr)}</td><td class="n">${a.liabilities_pkr != null ? `Rs ${formatPkr(a.liabilities_pkr)}` : "—"}</td><td class="n">${a.liabilities_pkr != null ? `Rs ${formatPkr(a.amount_pkr - a.liabilities_pkr)}` : "—"}</td><td>${a.basis}${a.notes ? html`<div class="hint">${a.notes}</div>` : ""}</td><td><a href="${safeHref(a.source.url)}" target="_blank" rel="noopener noreferrer">${a.source.title}</a></td></tr>`,
              )}</tbody></table></div>
              <p class="hint" style="margin-top:8px">Assets as declared to the Election Commission in nomination papers or annual statements. These are self-declared values, often at historical cost, not audited net worth.</p></section>`
            : ""
        }
        ${
          person.legal_cases?.length
            ? html`<section><h2>Criminal and accountability cases <span class="count num">${person.legal_cases.length}</span></h2><p class="hint" style="margin-bottom:10px">${CASES_NOTE}</p>${casesTable(ix, person.legal_cases.map((c) => ({ person, c })), false)}</section>`
            : ""
        }
        ${
          !person.declared_assets?.length && person.roles.some((r) => !r.until && ix.post.get(r.position)?._selection === "elected")
            ? html`<section><h2>Declared assets</h2><p class="hint">As an elected member, this person files an annual statement of assets and liabilities with the Election Commission (Elections Act 2017, s. 137), published on <a href="https://www.ecp.gov.pk" target="_blank" rel="noopener noreferrer">ecp.gov.pk</a>. It has not been imported yet; see data/assets/README.md.</p></section>`
            : ""
        }
        ${person.notes ? html`<section><h2>Notes</h2><p class="prose">${person.notes}</p></section>` : ""}
      </div>
      <aside class="rail">
        <div class="panel"><h3>Data record</h3>
          <dl class="facts">
            <dt>As of</dt><dd class="num">${person.as_of}</dd>
            <dt>Confidence</dt><dd>${person.confidence} — ${CONFIDENCE_NOTE[person.confidence]}</dd>
            <dt>File</dt><dd>${editLink(ctx, person._file)}</dd>
          </dl>
          ${person.roles.some((r) => r.source) ? html`<h3 style="margin-top:14px">Sources</h3>${sourcesList(person.roles.flatMap((r) => (r.source ? [r.source] : [])))}` : ""}
        </div>
      </aside>
    </div>`;
  return { title: person.name, body };
}

export function formatPkr(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} billion`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} million`;
  return n.toLocaleString();
}

export function placeView(ctx: Ctx, id: string): View | undefined {
  const { ix } = ctx;
  const place = ix.place.get(id);
  if (!place) return;
  const trail = ix.placeTrail(id);
  const allKids = ix.placeChildren.get(id) ?? [];
  const constituencies = allKids.filter((k) => k.kind === "constituency");
  const kids = allKids.filter((k) => k.kind !== "constituency");
  const seatFor = (conId: string) => ix.g.positions.find((p) => p.area === conId);
  const orgs = (ix.orgsByPlace.get(id) ?? []).filter((o) => !o.abolished);
  // top-level bodies in this jurisdiction: those whose parent is outside it (or none)
  const top = orgs.filter((o) => !o.parent || ix.org.get(o.parent)?.jurisdiction !== id);
  const govt = orgs.find((o) => o.kind === "state");
  const keyPosts = govt
    ? ix.g.positions.filter(
        (p) => ix.org.get(p.org)?.jurisdiction === id && !p.generated && ["head", "chief_justice", "presiding_officer", "administrative_head", "chief"].includes(p.role) && !p.seats,
      )
    : place.kind === "constituency"
      ? ix.g.positions.filter((p) => p.area === id)
      : ix.g.positions.filter((p) => ix.org.get(p.org)?.jurisdiction === id);
  const tree =
    govt && (ix.children.get(govt.id)?.length ?? 0) > 0
      ? graphPanel(ctx, "g-place", [
          { key: "tree", label: "Government structure", data: () => hierarchy(ix, govt.id, 2), layout: "dagre-lr" },
          { key: "full", label: "With field administration", data: () => hierarchy(ix, govt.id, 4, true), layout: "dagre-lr" },
        ])
      : undefined;
  const lgLaw = place.local_government_law;
  const body = html`
    <nav class="trail" aria-label="Breadcrumb">${trail.slice(0, -1).map((p, i) => html`${i ? html`<span aria-hidden="true">›</span>` : ""}<a href="#/place/${p.id}">${p.name}</a>`)}</nav>
    <header class="pagehead">
      <div class="eyebrow">${place.kind.replace(/_/g, " ")} ${confidenceChip(place.confidence)}</div>
      <h1>${place.name}</h1>
      ${place.name_ur ? html`<p class="urdu" lang="ur">${place.name_ur}</p>` : ""}
      ${place.notes ? html`<p class="lede">${place.notes}</p>` : ""}
    </header>
    <div class="layout">
      <div class="stack">
        ${
          keyPosts.length
            ? html`<section><h2>Key offices <span class="count num">${keyPosts.length}</span></h2><div class="posts">${keyPosts.slice(0, 16).map((p) => postRow(ix, p, { showOrg: true }))}</div></section>`
            : ""
        }
        ${tree ? html`<section><h2>Structure</h2>${tree.body}</section>` : ""}
        ${
          kids.length
            ? html`<section><h2>${kids[0].kind === "district" ? "Districts" : kids[0].kind === "division" ? "Divisions" : "Governments"} <span class="count num">${kids.length}</span></h2>
              <div class="cards">${kids.map((k) => {
                const n = ix.placeChildren.get(k.id)?.length ?? 0;
                const dc = ix.g.positions.find((p) => ix.org.get(p.org)?.jurisdiction === k.id && p.role === "head");
                return html`<a class="card" href="#/place/${k.id}"><span class="t">${k.name}</span>
                  <span class="s">${k.headquarters ? html`<span>HQ ${k.headquarters}</span>` : ""}${n ? html`<span class="num">${n} districts</span>` : ""}${k.confidence !== "high" ? html`<span>· verify</span>` : ""}</span>
                  ${dc ? html`<span class="who">${dc.title}</span>` : ""}</a>`;
              })}</div></section>`
            : ""
        }
        ${
          constituencies.length
            ? html`<section><h2>Constituencies <span class="count num">${constituencies.length}</span></h2>
              <p class="hint" style="margin-bottom:8px">Highlighted seats have a recorded member.</p>
              <div class="constituencies">${constituencies.map((c) => {
                const seat = seatFor(c.id);
                const has = seat && ix.currentHolders(seat.id).length;
                return html`<a href="${seat ? `#/post/${seat.id}` : `#/place/${c.id}`}" class="${has ? "has" : ""}" title="${seat ? ix.currentHolders(seat.id)[0]?.person.name ?? "" : ""}">${c.name}</a>`;
              })}</div></section>`
            : ""
        }
        ${top.length ? html`<section><h2>Bodies <span class="count num">${orgs.length}</span></h2>${orgGroups(ctx, top)}</section>` : ""}
      </div>
      <aside class="rail">
        <div class="panel"><h3>Facts</h3>
          <dl class="facts">
            <dt>Type</dt><dd>${place.kind.replace(/_/g, " ")}</dd>
            ${place.parent ? html`<dt>Within</dt><dd>${link(ix, place.parent)}</dd>` : ""}
            ${place.capital ? html`<dt>Capital</dt><dd>${place.capital}</dd>` : ""}
            ${place.headquarters ? html`<dt>Headquarters</dt><dd>${place.headquarters}</dd>` : ""}
            ${lgLaw ? html`<dt>Local government law</dt><dd>${link(ix, lgLaw)}</dd>` : ""}
            ${kids.length ? html`<dt>Sub-units</dt><dd class="num">${kids.length}</dd>` : ""}
          </dl>
        </div>
        ${
          place.kind === "district"
            ? html`<div class="panel"><h3>How a district is run</h3><p class="hint">The Deputy Commissioner (a provincial or federal civil servant) heads district administration and revenue. Elected local councils under the provincial local-government law run municipal services; the District Police Officer, District Health Officer and other line-department heads report to their provincial departments.</p></div>`
            : ""
        }
      </aside>
    </div>`;
  return { title: place.name, body, mount: tree?.mount };
}

export function lawView(ctx: Ctx, id: string): View | undefined {
  const { ix } = ctx;
  const law = ix.law.get(id);
  if (!law) return;
  const bodies = ix.enactedBodies(id);
  const posts = ix.lawCitations(id);
  const rels = ix.g.edges.filter((e) => !e.derived && e.legal_basis?.some((lb) => lb.law === id));
  const changed = [
    ...ix.g.positions.filter((p) => p.history?.some((h) => h.law === id)).map((p) => ({ id: p.id, h: p.history!.filter((h) => h.law === id) })),
    ...ix.g.organizations.filter((o) => o.history?.some((h) => h.law === id)).map((o) => ({ id: o.id, h: o.history!.filter((h) => h.law === id) })),
  ];
  const body = html`
    <nav class="trail"><a href="#/">Pakistan</a><span aria-hidden="true">›</span><a href="#/laws">Laws</a></nav>
    <header class="pagehead">
      <div class="eyebrow">${law.kind} ${law.year ? html`<span class="num">${law.year}</span>` : ""} ${confidenceChip(law.confidence)}</div>
      <h1>${law.title}</h1>
      ${law.summary ? html`<p class="lede">${law.summary}</p>` : ""}
    </header>
    <div class="layout">
      <div class="stack">
        ${
          changed.length
            ? html`<section><h2>Offices and bodies this law created or changed <span class="count num">${changed.length}</span></h2>
              <div class="rels">${changed.map((c) => html`<div class="rel"><div>${link(ix, c.id)}</div><div>${c.h.map((h, i) => html`${i ? html`<br />` : ""}<span class="cite">${h.year}</span> ${h.change}`)}</div></div>`)}</div></section>`
            : ""
        }
        ${bodies.length ? html`<section><h2>Bodies established or empowered <span class="count num">${bodies.length}</span></h2>${orgGroups(ctx, bodies)}</section>` : ""}
        ${
          posts.length
            ? html`<section><h2>Posts it governs <span class="count num">${posts.length}</span></h2><div class="posts">${posts.slice(0, 40).map((p) => postRow(ix, p, { showOrg: true }))}</div></section>`
            : ""
        }
        ${rels.length ? html`<section><h2>Relationships it creates <span class="count num">${rels.length}</span></h2><div class="rels">${rels.map((e) => html`<div class="rel"><div>${link(ix, e.from)}</div><div>${e.type.replace(/_/g, " ")} ${link(ix, e.to)}</div></div>`)}</div></section>` : ""}
        ${!bodies.length && !posts.length && !rels.length ? html`<p class="hint">No bodies in the dataset cite this instrument yet.</p>` : ""}
      </div>
      <aside class="rail">
        <div class="panel"><h3>Instrument</h3>
          <dl class="facts">
            <dt>Type</dt><dd>${law.kind}</dd>
            ${law.year ? html`<dt>Year</dt><dd class="num">${law.year}</dd>` : ""}
            <dt>Jurisdiction</dt><dd>${link(ix, law.jurisdiction)}</dd>
            ${law.url ? html`<dt>Text</dt><dd><a href="${safeHref(law.url)}" target="_blank" rel="noopener noreferrer">Official text</a></dd>` : html`<dt>Text</dt><dd><a href="https://pakistancode.gov.pk" target="_blank" rel="noopener noreferrer">Search Pakistan Code</a></dd>`}
            <dt>File</dt><dd>${editLink(ctx, law._file)}</dd>
          </dl>
        </div>
      </aside>
    </div>`;
  return { title: law.title, body };
}

/**
 * Connects every <input data-filter="x"> (free text) and <select data-filter="x" data-facet="f">
 * (exact facet match against the row's data-f attribute, space-separated values) to the rows of
 * <table data-rows="x">.
 */
export function wireFilters(root: HTMLElement) {
  const groups = new Set([...root.querySelectorAll<HTMLElement>("[data-filter]")].map((el) => el.dataset.filter!));
  for (const g of groups) {
    const rows = [...root.querySelectorAll<HTMLTableRowElement>(`table[data-rows="${g}"] tbody tr`)];
    const text = rows.map((r) => r.textContent!.toLowerCase());
    const input = root.querySelector<HTMLInputElement>(`input[data-filter="${g}"]`);
    const selects = [...root.querySelectorAll<HTMLSelectElement>(`select[data-filter="${g}"]`)];
    const count = root.querySelector<HTMLElement>(`[data-count="${g}"]`);
    const apply = () => {
      const terms = (input?.value ?? "").toLowerCase().trim().split(/\s+/).filter(Boolean);
      let shown = 0;
      rows.forEach((r, i) => {
        const ok =
          terms.every((t) => text[i].includes(t)) &&
          selects.every((sel) => !sel.value || (r.dataset[sel.dataset.facet!] ?? "").split(" ").includes(sel.value));
        r.hidden = !ok;
        if (ok) shown++;
      });
      if (count) count.textContent = `${shown} shown`;
    };
    input?.addEventListener("input", apply);
    selects.forEach((sel) => sel.addEventListener("change", apply));
  }
}
