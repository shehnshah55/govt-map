/**
 * Political families (§7.15): a list of family groups, a tree for each, and where members hold or
 * held seats. Every tie shows its sources. Only public officeholders and party office-bearers
 * appear; the build rejects anything else (docs/EDITORIAL_POLICY.md § Family ties).
 */
import { families, familyOf, generations, RELATION_PHRASE, seatsOf, tiesOf, type Tie } from "../lib/families.ts";
import type { GraphIndex, Human } from "../lib/graph-index.ts";
import { safeHref } from "../lib/safe-url.ts";
import { html, type Raw } from "../ui/dom.ts";
import { link, loadOnDemand, partyLink, type Ctx, type View } from "./common.ts";

const POLICY = "Ties are recorded only between people who both hold or held a public or party office, and only when an official source or two independent outlets state them. Minors and relatives without a public role are never recorded.";

function sources(t: Tie): Raw {
  return html`${t.sources.map((s, i) => html`${i ? ", " : ""}${s.url ? html`<a href="${safeHref(s.url)}" target="_blank" rel="noopener noreferrer">${s.title}</a>` : s.title}`)}`;
}

/** The person's offices, current first, for the tree's node labels. */
function offices(ix: GraphIndex, p: Human) {
  const cur = p.roles.filter((r) => !r.until).map((r) => ix.shortLabel(r.position));
  const past = p.roles.filter((r) => r.until).map((r) => `former ${ix.shortLabel(r.position)}`);
  return [...cur, ...past];
}

export function familiesView(ctx: Ctx): View {
  const { ix } = ctx;
  const list = families(ix);
  const body = html`
    <header class="pagehead"><div class="eyebrow">Political families</div><h1>Families in public office</h1>
      <p class="lede">Officeholders connected by recorded family ties: who is related to whom, and which offices each holds or held.</p></header>
    <div class="stack">
      <p class="hint">${POLICY}</p>
      ${
        list.length
          ? html`<div class="tablewrap"><table><thead><tr><th>Family</th><th class="n">People</th><th>Members</th></tr></thead><tbody>${list.map(
              (f) => html`<tr><td><a href="#/family/${f.id}">${ix.person.get(f.id)?.name ?? f.id} and family</a></td><td class="n">${f.members.length}</td><td>${f.members.map((m, i) => html`${i ? ", " : ""}${link(ix, m.id)}`)}</td></tr>`,
            )}</tbody></table></div>`
          : html`<div class="panel"><p><b>No family ties are recorded yet.</b></p><p class="hint">Each tie needs an official source or two independent reports, so ties are added only as they are sourced. Families will appear here as they are.</p></div>`
      }
    </div>`;
  return { title: "Political families", body };
}

export function familyView(ctx: Ctx, personId: string): View | undefined {
  const { ix } = ctx;
  const f = familyOf(ix, personId);
  const focus = ix.person.get(personId);
  if (!f || !focus) return undefined;
  const seats = seatsOf(ix, f);
  const body = html`
    <nav class="trail"><a href="#/families">Political families</a><span aria-hidden="true">›</span><span>${focus.name}</span></nav>
    <header class="pagehead"><div class="eyebrow">Political family</div><h1>${focus.name} and family <span class="count num">${f.members.length} people</span></h1>
      <p class="lede">${POLICY}</p></header>
    <div class="stack">
      <section aria-labelledby="tree-h"><h2 id="tree-h">Family tree</h2>
        <div class="graphpanel"><div class="canvas tall" data-family-tree role="img" aria-label="Family tree of ${focus.name}. The same ties are listed below with their sources."></div>
        <p class="hint" data-tie-detail aria-live="polite">Select a person to open their page, or a line to see its sources.</p></div>
      </section>
      <section><h2>Ties and sources</h2>
        <div class="tablewrap"><table><thead><tr><th>Person</th><th>Relation</th><th>Person</th><th>Sources</th></tr></thead><tbody>${f.ties.map(
          (t) => html`<tr><td>${link(ix, t.from)}</td><td>${RELATION_PHRASE[t.relation][0]}</td><td>${link(ix, t.to)}</td><td>${sources(t)}${t.notes ? html`<div class="hint">${t.notes}</div>` : ""}</td></tr>`,
        )}</tbody></table></div>
      </section>
      <section><h2>Members and offices</h2>
        <ul class="plain">${f.members.map((m) => html`<li>${link(ix, m.id)} ${m.party ? html`<span class="hint">· ${partyLink(ix, m.party)}</span>` : ""}<div class="hint">${offices(ix, m).join(" · ")}</div></li>`)}</ul>
      </section>
      <section><h2>Where they hold or held seats</h2>
        ${
          seats.length
            ? html`<div class="tablewrap"><table><thead><tr><th>Member</th><th>Seat</th><th>District</th><th>Province or territory</th><th></th></tr></thead><tbody>${seats.map(
                (s) => html`<tr><td>${link(ix, s.person.id)}</td><td>${link(ix, s.post.id, s.constituency?.name ?? s.post.title)}</td><td>${s.district ? link(ix, s.district.id) : ""}</td><td>${s.province ? link(ix, s.province.id) : ""}</td><td>${s.current ? "now" : "formerly"}</td></tr>`,
              )}</tbody></table></div>`
            : html`<p class="hint">No directly elected seats are recorded for this family.</p>`
        }
        <p class="hint">A map of these seats will follow once constituency boundaries are in the data.</p>
      </section>
    </div>`;
  const mount = (root: HTMLElement) => {
    const el = root.querySelector<HTMLElement>("[data-family-tree]");
    const detail = root.querySelector<HTMLElement>("[data-tie-detail]");
    if (!el || !detail) return;
    const place = new Map(generations(f).map((g) => [g.id, g]));
    const nodes = f.members.map((m) => ({
      id: m.id,
      label: [m.name, ...(m.party ? [ix.shortLabel(m.party)] : []), ...offices(ix, m).slice(0, 2)].join("\n"),
      focus: m.id === personId,
      row: place.get(m.id)?.row ?? 0,
      col: place.get(m.id)?.col ?? 0,
    }));
    let gone = false;
    let cy: { destroy: () => void } | undefined;
    // Cytoscape loads only for this page (see graphPanel() in ./common.ts)
    void loadOnDemand(el, () => import("../ui/family-tree.ts")).then((m) => {
      if (!m || gone) return;
      cy = m.mountFamilyTree(el, nodes, f.ties, {
        openPerson: (id) => ctx.go(`/person/${id}`),
        showTie: (t) => {
          // built with DOM methods: names and titles come from data
          detail.replaceChildren(document.createTextNode(`${ix.label(t.from)} is the ${RELATION_PHRASE[t.relation][0]} ${ix.label(t.to)}. Sources: `));
          t.sources.forEach((s, i) => {
            if (i) detail.append(", ");
            const a = document.createElement("a");
            a.textContent = s.title;
            a.href = safeHref(s.url);
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            detail.append(a);
          });
        },
      });
    });
    return () => {
      gone = true;
      cy?.destroy();
    };
  };
  return { title: `${focus.name} and family`, body, mount };
}

/** The "Family" section on a person's page, when they have recorded ties. */
export function familySection(ix: GraphIndex, personId: string): Raw {
  const ties = tiesOf(ix, personId);
  if (!ties.length) return html``;
  return html`<section><h2>Family <span class="count num">${ties.length}</span></h2>
    <ul class="plain">${ties.map((t) => html`<li>${t.phrase} ${link(ix, t.other)} <span class="hint">· ${sources(t.tie)}</span></li>`)}</ul>
    <p style="margin-top:8px"><a href="#/family/${personId}">Family tree →</a></p>
  </section>`;
}
