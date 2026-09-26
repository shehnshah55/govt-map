/** Parliament seating, "who appoints whom", the collapsible tree, the HQ map and the verification log. */
import { pakistanBaseMap } from "../ui/pakistan-map.ts";
import type { Org, Post } from "../lib/graph-index.ts";
import { esc, html, raw, type Raw } from "../ui/dom.ts";
import { hemicycle } from "../ui/hemicycle.ts";
import { appointmentSentence, holdingFlags, hrefFor, link, originTag, partyLink, postTags, roleOf, selectionTag, type Ctx, type View } from "./common.ts";

export function parliamentView(ctx: Ctx): View {
  const { ix } = ctx;
  const na = ix.org.get("fed-national-assembly")!;
  const sen = ix.org.get("fed-senate")!;
  const body = html`
    <header class="pagehead"><div class="eyebrow">Majlis-e-Shoora</div><h1>Parliament in session</h1>
      <p class="lede">Seating charts of the National Assembly and the Senate by party. The treasury benches sit to the chair's right and the opposition to its left. Members recorded by name are ringed; hover for their constituency and offices, click to open their page.</p></header>
    <div class="stack">
      <section><h2>${na.name} <span class="count num">${na.composition?.total} seats</span></h2>${hemicycle(ix, na.id)}</section>
      <section><h2>${sen.name} <span class="count num">${sen.composition?.total} seats</span></h2>${hemicycle(ix, sen.id)}</section>
      <section><h2>Joint sitting</h2><p class="prose">Both Houses sit together for joint sittings (Art. 54), to pass bills the Houses disagree on (Art. 70), and to impeach or remove the President. Together they hold 432 seats. The President is elected by an electoral college of both Houses and the four Provincial Assemblies (Art. 41(3)).</p></section>
    </div>`;
  return { title: "Parliament", body };
}

const APPOINTMENT_GROUPS: { title: string; ids: string[] }[] = [
  { title: "Armed forces", ids: ["fed-cdf", "fed-coas", "fed-cns", "fed-cas", "fed-cnsc", "fed-dg-isi"] },
  { title: "Judiciary", ids: ["fed-chief-justice", "fed-sc-judge", "fed-fcc-chief-justice", "fed-fsc-chief-justice", "pb-hc-chief-justice", "pb-hc-judge"] },
  { title: "Head of state and executive", ids: ["fed-president", "fed-prime-minister", "fed-federal-minister", "fed-minister-of-state", "fed-adviser-to-pm", "fed-sapm", "pb-governor", "pb-chief-minister", "pb-provincial-minister"] },
  { title: "Independent constitutional bodies", ids: ["fed-cec", "fed-ecp-member", "fed-auditor-general", "fed-fpsc-chairman", "fed-nab-chairman", "fed-wafaqi-mohtasib-head", "fed-attorney-general"] },
  { title: "Regulators", ids: ["fed-sbp-governor", "fed-secp-chairman", "fed-nepra-chairman", "fed-ogra-chairman", "fed-pta-chairman", "fed-pemra-chairman", "fed-ccp-chairman", "fed-drap-ceo", "fed-hec-chairman"] },
  { title: "Civil service and police", ids: ["fed-cabinet-division-secretary", "fed-establishment-division-secretary", "fed-min-nhsrc-secretary", "pb-chief-secretary", "pb-igp", "pk-pb-lahore-deputy-commissioner"] },
];

function question(p: Post) {
  const verb = p._selection === "elected" ? "chooses" : "appoints";
  return `Who ${verb} the ${p.title}?`;
}

export function appointmentsView(ctx: Ctx): View {
  const { ix } = ctx;
  const row = (p: Post) => {
    const hs = ix.effectiveHolders(p.id);
    const chain = ix.appointmentChain(p.id, 4);
    return html`<div class="post">
      <div>
        <div class="title"><a href="${hrefFor(ix, p.id)}">${question(p)}</a></div>
        <div class="appoint" style="margin-top:6px;font-size:var(--s-md)">${appointmentSentence(ix, p)}.</div>
        <div style="margin-top:8px">${postTags(ix, p)}</div>
        ${p._tenure?.notes ? html`<div class="hint" style="margin-top:6px">${p._tenure.notes}</div>` : ""}
        ${chain.length > 1 ? html`<div class="hint" style="margin-top:6px">Chain: ${p.title.split(",")[0]} ${chain.map((s) => html` ← ${s.via} ${link(ix, s.id, ix.shortLabel(s.id))}`)}</div>` : ""}
      </div>
      <div class="holder">${
        hs.length
          ? hs.map((h) => html`<div class="name">${link(ix, h.person.id)}</div>${holdingFlags(ix, { ...h, ...roleOf(h.person, p.id) }, p.id)}<div class="hint">${h.since ? `since ${h.since}` : ""}${h.person.party ? html` · ${partyLink(ix, h.person.party)}` : ""}</div>`)
          : html`<div class="none">${p.seats ? "Multi-member office" : "Holder not recorded"}</div>`
      }</div>
    </div>`;
  };
  const body = html`
    <header class="pagehead"><div class="eyebrow">Appointments</div><h1>Who appoints whom</h1>
      <p class="lede">For each key office: who formally appoints, whose advice binds them, who nominates or must be consulted, and who confirms. Also shown: whether the office is constitutional, statutory or created by executive order, how long the term runs, whether it can be extended, and the latest amendment that changed the rule.</p></header>
    <div class="stack">${APPOINTMENT_GROUPS.map(
      (g) => html`<section><h2>${g.title}</h2><div class="posts">${g.ids
        .map((id) => ix.post.get(id))
        .filter((p): p is Post => !!p)
        .map(row)}</div></section>`,
    )}</div>`;
  return { title: "Who appoints whom", body };
}

const TIER_ROOTS: [string, string][] = [
  ["pk", "Federation"],
  ["pk-ict", "Islamabad Capital Territory"],
  ["pk-pb", "Punjab"],
  ["pk-sd", "Sindh"],
  ["pk-kp", "Khyber Pakhtunkhwa"],
  ["pk-ba", "Balochistan"],
  ["pk-gb", "Gilgit-Baltistan"],
  ["pk-ajk", "Azad Jammu and Kashmir"],
];

export function treeView(ctx: Ctx): View {
  const { ix } = ctx;
  const postLeaf = (p: Post) => {
    const h = ix.effectiveHolders(p.id)[0];
    return html`<div class="leaf">${selectionTag(p)}<a href="#/post/${p.id}">${p.title}</a>${h ? html`<span class="hint">— ${h.person.name}</span>` : ""}</div>`;
  };
  const node = (o: Org, depth: number): Raw => {
    const posts = (ix.postsByOrg.get(o.id) ?? []).filter((p) => !p.area && !p.seat_type && p.role !== "judge" && p.role !== "member");
    const kids = (ix.children.get(o.id) ?? []).filter((c) => !c.abolished);
    if (!posts.length && !kids.length) return html`<div class="leaf">${originTag(o._origin)}<a href="#/org/${o.id}">${o.name}</a></div>`;
    return html`<details ${depth === 0 ? raw("open") : ""}><summary>${originTag(o._origin)}<a href="#/org/${o.id}">${o.name}</a><span class="hint num">${kids.length ? `${kids.length} bodies` : ""}${posts.length ? ` · ${posts.length} posts` : ""}</span></summary>
      ${posts.map(postLeaf)}${kids.map((k) => node(k, depth + 1))}</details>`;
  };
  const rootsFor = (tier: string) =>
    ix.g.organizations.filter(
      (o) => !o.parent && !o.abolished && o.kind !== "political_party" && o.id !== "pk-electorate" && (tier === "pk" ? o.jurisdiction === "pk" : ix.tierOf(o.jurisdiction)?.id === tier && o.jurisdiction !== "pk"),
    );
  const body = html`
    <header class="pagehead"><div class="eyebrow">Hierarchy</div><h1>The state as a tree</h1>
      <p class="lede">Expand any government, then any body, down to its posts and their holders. Each body is tagged by what created it (constitutional, statutory, executive order) and each post by how it is filled.</p></header>
    <div class="toolbar"><button class="btn ghost" type="button" data-tree="open">Expand all</button><button class="btn ghost" type="button" data-tree="close">Collapse all</button></div>
    <div class="tree panel">${TIER_ROOTS.map(([tier, label]) => html`<details ${tier === "pk" ? raw("open") : ""}><summary><b>${label}</b></summary>${rootsFor(tier).map((o) => node(o, 1))}</details>`)}</div>`;
  return {
    title: "Tree",
    body,
    mount: (root) => {
      root.querySelectorAll<HTMLButtonElement>("[data-tree]").forEach((b) =>
        b.addEventListener("click", () => root.querySelectorAll("details").forEach((d) => ((d as HTMLDetailsElement).open = b.dataset.tree === "open"))),
      );
    },
  };
}

const CITIES: Record<string, [number, number]> = {
  Islamabad: [73.0479, 33.6844],
  Rawalpindi: [73.0169, 33.5651],
  Lahore: [74.3587, 31.5204],
  Karachi: [67.0011, 24.8607],
  Peshawar: [71.5249, 34.0151],
  Quetta: [66.975, 30.1798],
  Gilgit: [74.308, 35.9208],
  Muzaffarabad: [73.4711, 34.37],
  Gwadar: [62.3254, 25.1216],
};
/** Label placement for crowded northern cities: [dx, dy, text-anchor]. */
const LABEL_OFFSET: Record<string, [number, number, string]> = {
  Islamabad: [0, 52, "middle"],
  Rawalpindi: [-10, 26, "end"],
  Peshawar: [-26, -8, "end"],
  Muzaffarabad: [10, -18, "start"],
  Gilgit: [12, 4, "start"],
};

const CAPITAL: Record<string, string> = { pk: "Islamabad", "pk-ict": "Islamabad", "pk-pb": "Lahore", "pk-sd": "Karachi", "pk-kp": "Peshawar", "pk-ba": "Quetta", "pk-gb": "Gilgit", "pk-ajk": "Muzaffarabad" };

export function mapView(ctx: Ctx): View {
  const { ix } = ctx;
  const hqOf = (o: Org) => o.hq ?? (["pk", "pk-ict", "pk-pb", "pk-sd", "pk-kp", "pk-ba", "pk-gb", "pk-ajk"].includes(o.jurisdiction) ? CAPITAL[o.jurisdiction] : undefined);
  const byCity = new Map<string, Org[]>();
  for (const o of ix.g.organizations) {
    if (o.abolished || o.kind === "political_party" || o.kind === "field_administration") continue;
    const c = hqOf(o);
    if (c && CITIES[c]) byCity.set(c, [...(byCity.get(c) ?? []), o]);
  }
  const W = 760;
  const H = 700;
  const base = pakistanBaseMap(W, H);
  const proj = base.project;
  const max = Math.max(...[...byCity.values()].map((l) => l.length));
  const dots = [...byCity.entries()].map(([city, list]) => {
    const [x, y] = proj(CITIES[city])!;
    const r = 6 + 26 * Math.sqrt(list.length / max);
    const [dx, dy, anchor] = LABEL_OFFSET[city] ?? [r + 4, 4, "start"];
    return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="var(--k-navy)" fill-opacity="0.75" stroke="var(--surface)" stroke-width="2"><title>${esc(city)}: ${list.length} bodies</title></circle>
      <text x="${(x + (typeof dx === "number" ? dx : r + 4)).toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}" font-size="13" fill="var(--ink)" font-family="IBM Plex Sans, sans-serif" paint-order="stroke" stroke="var(--surface)" stroke-width="3">${esc(city)} · ${list.length}</text></g>`;
  });
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of Pakistan with the headquarters of government bodies by city">
    ${base.svgDefs}${base.layers}
    ${dots.join("")}
  </svg>`;
  const cities = [...byCity.entries()].sort((a, b) => b[1].length - a[1].length);
  const body = html`
    <header class="pagehead"><div class="eyebrow">Geography</div><h1>Where the state sits</h1>
      <p class="lede">Headquarters of federal, provincial and territorial bodies by city. District field offices are left out. Bodies without a recorded headquarters are placed in their government's capital.</p></header>
    <div class="layout">
      <div class="panel mapbox">${raw(svg)}<ul class="plain hint" style="margin-top:10px">${base.notes.map((n) => html`<li>${n}</li>`)}</ul></div>
      <aside class="rail">${cities.map(
        ([city, list]) => html`<div class="panel"><h3>${city} · ${list.length}</h3><ul class="plain">${list
          .filter((o) => !o.parent || ix.org.get(o.parent)?.kind === "state" || ["regulator", "court", "constitutional_body", "armed_service", "military_hq", "legislature", "chamber"].includes(o.kind))
          .slice(0, 12)
          .map((o) => html`<li>${originTag(o._origin)} ${link(ix, o.id, o.short_name ?? o.name)}</li>`)}</ul></div>`,
      )}</aside>
    </div>`;
  return { title: "Map", body };
}

export function verificationView(ctx: Ctx): View {
  const { ix } = ctx;
  const v = ix.g.verification;
  const count = (s: string) => v.filter((x) => x.status === s).length;
  const cls = { verified: "sel-elected", corrected: "flag", conflict: "flag-bad", unverified: "flag-info" } as const;
  const body = html`
    <header class="pagehead"><div class="eyebrow">Verification</div><h1>What was checked, and what changed</h1>
      <p class="lede">Every fact check behind the data: claims from the uploaded government-structure spreadsheet and from our own records, what the check found, and the sources used. Corrections are applied to the data; conflicts stay open until an official source settles them.</p></header>
    <div class="stats">
      <div class="stat"><b>${count("verified")}</b><span>Verified</span></div>
      <div class="stat"><b>${count("corrected")}</b><span>Corrected</span></div>
      <div class="stat"><b>${count("conflict")}</b><span>Sources conflict</span></div>
      <div class="stat"><b>${count("unverified")}</b><span>Unverified</span></div>
    </div>
    <div class="posts">${v.map(
      (x) => html`<div class="post">
        <div><div class="title">${x.claim}</div>
          <div class="meta"><span class="tag ${cls[x.status]}">${x.status}</span>${x.origin ? html`<span class="hint">from ${x.origin}</span>` : ""}<span class="hint">checked ${x.checked}</span></div>
          ${x.finding ? html`<p style="margin-top:6px">${x.finding}</p>` : ""}
          ${x.records?.length ? html`<div class="hint" style="margin-top:6px">Records: ${x.records.map((r, i) => html`${i ? ", " : ""}${link(ix, r)}`)}</div>` : ""}</div>
        <div><ul class="plain">${x.sources.map((s) => html`<li>${s.url ? html`<a href="${s.url}" target="_blank" rel="noopener">${s.title}</a>` : s.title}</li>`)}</ul></div>
      </div>`,
    )}</div>`;
  return { title: "Verification", body };
}
