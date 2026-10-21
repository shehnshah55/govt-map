import type { Sector } from "../schema.ts";
import { html } from "../ui/dom.ts";
import { hierarchy, powerMap } from "../ui/graph-view.ts";
import { SECTOR_LABEL, STATUS_LABEL } from "../ui/labels.ts";
import { DIRECTORIES } from "./directory.ts";
import { casesTable, CASES_NOTE, confidenceChip, graphPanel, holdingFlags, hrefFor, kindLabel, link, partyLink, postRow, selectionTag, statusChip, type Ctx, type View } from "./common.ts";
import { formatPkr } from "./entities.ts";
import { starterMap } from "./starter-map.ts";
import { TIERS, TIER_GOVT, TIER_HEADS, TIER_LABEL } from "./tiers.ts";
import { barFigure, headlineTiles } from "../lib/analytics.ts";
import { barChart, statTiles } from "../ui/charts.ts";
import { evidenceHref } from "./figures.ts";
import { safeHref } from "../lib/safe-url.ts";


function holderName(ctx: Ctx, postId: string) {
  const h = ctx.ix.effectiveHolders(postId)[0];
  return h ? link(ctx.ix, h.person.id) : html`<span class="hint">not recorded</span>`;
}

export function homeView(ctx: Ctx): View {
  const { ix } = ctx;
  const seatCount = ix.g.positions.filter((p) => p.area || p.seat_type).reduce((n, p) => n + (p.seats ?? 1), 0);
  const featured = ix.org.get("fed-pm-office")!;
  const pm = ix.effectiveHolders("fed-prime-minister")[0];
  const pmoBodies = (ix.children.get("fed-pm-office") ?? []).filter((o) => !o.abolished);
  const starter = starterMap(ctx);
  const sectorsInUse = (Object.keys(SECTOR_LABEL) as Sector[]).filter((s) => ix.bySector(s).length >= 4);
  const power = graphPanel(
    ctx,
    "g-home",
    [
      { key: "power", label: "Who appoints whom (federal)", data: () => powerMap(ix, (j) => j === "pk"), layout: "cose" },
      { key: "tree", label: "Federal structure", data: () => hierarchy(ix, "fed-federation", 1), layout: "concentric" },
    ],
    { tall: true },
  );
  const body = html`
    <section class="hero">
      <div class="eyebrow">Government of Pakistan · every level · open data</div>
      <h1>Who governs Pakistan, and who put them there.</h1>
      <p class="lede">A connected map of Pakistan's federal, provincial, territorial, divisional and district government. It covers every body, the posts that lead it, the people in those posts, and the constitutional article or statute behind each link.</p>
      <div class="btnrow">
        <a class="btn" href="#/org/fed-pm-office">Start with the Prime Minister's Office</a>
        <a class="btn ghost" href="#/explore">Explore the whole graph</a>
        <a class="btn ghost" href="#/ask">Ask a question</a>
      </div>
    </section>
    ${statTiles(headlineTiles(ix))}
    <section class="stack" style="margin-bottom:22px">
      <h2>Start here <span class="count">The Federation and its units. Select one to see what it is, who leads it and where to go next.</span></h2>
      ${starter.body}
    </section>
    <div class="stack">
      <section class="feature">
        <div style="display:grid;gap:10px">
          <div class="eyebrow">The top of the federal executive</div>
          <h2><a href="#/org/fed-pm-office" style="color:inherit;text-decoration:none">${featured.name}</a></h2>
          ${featured.description ? html`<p>${featured.description}</p>` : ""}
          <p><span class="hint">Prime Minister:</span> ${pm ? link(ix, pm.person.id) : html`<span class="hint">not recorded</span>`}</p>
          <div class="btnrow"><a class="btn" href="#/org/fed-pm-office">Open the PM's Office</a><a class="btn ghost" href="#/post/fed-prime-minister">How the PM is chosen</a><a class="btn ghost" href="#/org/fed-min-nhsrc">Ministry of Health in depth</a></div>
        </div>
        <div>
          <div class="hint" style="margin-bottom:6px">Bodies that report to the PM's Office</div>
          <ul class="plain">
            ${pmoBodies.map((o) => html`<li>${link(ix, o.id, ix.shortLabel(o.id))} <span class="hint">· ${kindLabel(o.kind)}</span></li>`)}
          </ul>
        </div>
      </section>
      <section>
        <h2>Facts and figures <span class="count">Counted from the records, as of ${ix.g.meta.data_as_of}. Select a bar to see the records behind it.</span></h2>
        <div class="charts">${["posts-by-selection", "appointers"].map((id) => barChart(barFigure(ix, id)!, (b) => evidenceHref(id, b.key), { compact: true }))}</div>
        <p style="margin-top:12px"><a class="btn ghost" href="#/figures">All facts and figures</a></p>
      </section>
      <section>
        <h2>Governments <span class="count">Federation, four provinces, the capital and two territories</span></h2>
        <div class="tiers">
          ${TIERS.map((t) => {
            const place = ix.place.get(t)!;
            const divs = (ix.placeChildren.get(t) ?? []).filter((j) => j.kind === "division").length;
            const dist = ix.g.jurisdictions.filter((j) => j.kind === "district" && ix.placeTrail(j.id)[1]?.id === t).length;
            const n = t === "pk" ? ix.g.organizations.filter((o) => o.jurisdiction === "pk").length : ix.g.organizations.filter((o) => ix.tierOf(o.jurisdiction)?.id === t).length;
            return html`<div class="tier">
              <h3><a href="${t === "pk" ? "#/org/fed-federation" : `#/place/${t}`}">${t === "pk" ? "Federal Government" : place.name}</a></h3>
              ${place.name_ur ? html`<div class="urdu" lang="ur">${place.name_ur}</div>` : ""}
              <dl>${(TIER_HEADS[t] ?? []).map(([label, pid]) => html`<dt>${label}</dt><dd>${holderName(ctx, pid)}</dd>`)}</dl>
              <div class="hint num">${n} bodies${divs ? ` · ${divs} divisions · ${dist} districts` : ""}</div>
            </div>`;
          })}
        </div>
      </section>
      <section><h2>Explore by question</h2>
        <div class="cards">
          <a class="card" href="#/parliament"><span class="t">Parliament in session</span><span class="s">Seating charts of the National Assembly and Senate: treasury vs opposition, parties and office-holders</span></a>
          <a class="card" href="#/appointments"><span class="t">Who appoints whom?</span><span class="s">Army chief, judges, regulators, the CEC and more: appointer, advice, confirmation, tenure, extensions</span></a>
          <a class="card" href="#/accountability"><span class="t">Holdovers and extensions</span><span class="s">Officials past their term, extended terms, retired generals and bureaucrats in civilian posts, declared assets</span></a>
          <a class="card" href="#/tree"><span class="t">The state as a tree</span><span class="s">Drill from each government to every body, post and holder</span></a>
          <a class="card" href="#/map"><span class="t">Where the state sits</span><span class="s">Headquarters by city</span></a>
          <a class="card" href="#/verification"><span class="t">Verification log</span><span class="s">What was checked, corrected or disputed, with sources</span></a>
        </div>
      </section>
      <section><h2>Colour key</h2>
        <p class="hint" style="margin-bottom:10px">Every post is tagged by what created it, how it is filled and its tenure. Every body is tagged by what created it.</p>
        <div class="tags">
          <span class="tag org-constitutional">Constitutional</span><span class="tag org-statutory">Statutory</span><span class="tag org-executive">Executive order</span><span class="tag org-conventional">Convention</span>
          <span class="tag sel-elected">Elected</span><span class="tag sel-political">Political appointee</span><span class="tag sel-constitutional">Constitutional appointee</span><span class="tag sel-judicial">Judiciary</span><span class="tag sel-military">Military</span><span class="tag sel-civil_service">Civil service</span><span class="tag sel-regulatory">Regulatory appointee</span><span class="tag sel-statutory">Statutory appointee</span>
          <span class="tag tenure">5-year term</span><span class="tag tenure">At pleasure (discretionary)</span><span class="tag law">26th Amendment · 2024</span>
          <span class="tag flag-bad">Holding over</span><span class="tag flag">Extended ×2</span><span class="tag flag-info">Retired Lieutenant-General</span>
        </div>
      </section>
      <section><h2>Directory <span class="count">Every body by type, with its head and legal basis</span></h2>
        <div class="cards">${DIRECTORIES.map((d) => {
          const n = ix.g.organizations.filter((o) => d.kinds.includes(o.kind) && !o.abolished).length;
          return html`<a class="card" href="#/directory/${d.key}"><span class="t">${d.label}</span><span class="s num">${n} bodies</span></a>`;
        })}
          <a class="card" href="#/elected"><span class="t">Elected officials</span><span class="s num">${seatCount.toLocaleString()} seats in 8 legislatures</span></a>
          <a class="card" href="#/officials"><span class="t">Appointed officials</span><span class="s">Ministers, secretaries, judges, regulators, service chiefs</span></a>
        </div>
      </section>
      <section><h2>The power map</h2>
        <p class="hint" style="margin-bottom:10px">Amber lines show who appoints, elects or nominates each federal office. Follow them back and they end at the voters, the National Assembly, or the President acting on the Prime Minister's advice.</p>
        ${power.body}
      </section>
      <section><h2>By sector</h2>
        <div class="sectors">${sectorsInUse.map((s) => html`<a href="#/sector/${s}">${SECTOR_LABEL[s]} <span class="num hint">${ix.bySector(s).length}</span></a>`)}</div>
      </section>
      <p class="notice">Officeholder records are dated (latest ${ix.g.meta.data_as_of}) and flagged <b>Verify</b> where they come from secondary reporting. Structural records cite the Constitution, Rules of Business or statute. See <a href="#/about">method and sources</a>.</p>
    </div>`;
  return {
    title: "Pakistan Government Graph",
    body,
    mount: (root) => {
      starter.mount(root);
      return power.mount(root);
    },
  };
}

export function exploreView(ctx: Ctx, params: URLSearchParams): View {
  const { ix } = ctx;
  const tier = TIERS.includes(params.get("tier") ?? "") ? params.get("tier")! : "pk";
  const mode = params.get("mode") === "power" ? "power" : "structure";
  const inTier = (j: string) => (tier === "pk" ? j === "pk" : ix.tierOf(j)?.id === tier);
  const panel = graphPanel(
    ctx,
    "g-explore",
    mode === "power"
      ? [
          { key: "force", label: "Network", data: () => powerMap(ix, inTier), layout: "cose" },
          { key: "lr", label: "Ranked", data: () => powerMap(ix, inTier), layout: "dagre-tb" },
        ]
      : [
          { key: "tree", label: "Tree", data: () => hierarchy(ix, TIER_GOVT[tier], 3), layout: "dagre-lr" },
          { key: "net", label: "Network", data: () => hierarchy(ix, TIER_GOVT[tier], 3), layout: "cose" },
          { key: "field", label: "With districts", data: () => hierarchy(ix, TIER_GOVT[tier], 6, true), layout: "dagre-lr" },
        ],
    { tall: true },
  );
  const q = (k: string, v: string) => {
    const p = new URLSearchParams({ tier, mode });
    p.set(k, v);
    return `#/explore?${p}`;
  };
  const body = html`
    <header class="pagehead">
      <div class="eyebrow">Explore</div>
      <h1>The whole graph</h1>
      <p class="lede">Browse any government's structure, or switch to the power map to see which office appoints, elects or nominates which.</p>
    </header>
    <div class="filters" style="margin-bottom:14px">
      <div class="seg" role="group" aria-label="View">
        <button type="button" aria-pressed="${String(mode === "structure")}" data-href="${q("mode", "structure")}">Structure</button>
        <button type="button" aria-pressed="${String(mode === "power")}" data-href="${q("mode", "power")}">Power map</button>
      </div>
      <label for="tier-select">Government
        <select id="tier-select">${TIERS.map((t) => html`<option value="${t}" ${t === tier ? "selected" : ""}>${TIER_LABEL[t]}</option>`)}</select>
      </label>
    </div>
    ${panel.body}`;
  return {
    title: "Explore",
    body,
    mount: (root) => {
      root.querySelectorAll<HTMLButtonElement>("[data-href]").forEach((b) => b.addEventListener("click", () => ctx.go(b.dataset.href!.slice(1))));
      root.querySelector<HTMLSelectElement>("#tier-select")?.addEventListener("change", (e) => ctx.go(q("tier", (e.target as HTMLSelectElement).value).slice(1)));
      return panel.mount(root);
    },
  };
}

export function sectorsView(ctx: Ctx): View {
  const { ix } = ctx;
  const sectors = (Object.keys(SECTOR_LABEL) as Sector[]).filter((s) => ix.bySector(s).length);
  const count = (s: Sector, t: string) => ix.bySector(s).filter((o) => !o.abolished && (t === "pk" ? o.jurisdiction === "pk" : ix.tierOf(o.jurisdiction)?.id === t)).length;
  const max = Math.max(...sectors.flatMap((s) => TIERS.map((t) => count(s, t))));
  const body = html`
    <header class="pagehead">
      <div class="eyebrow">Sectors and devolution</div>
      <h1>Who is responsible for what</h1>
      <p class="lede">The 18th Amendment (2010) abolished the Concurrent Legislative List and moved health, school education, agriculture, local government, labour, population welfare and social welfare to the provinces. The table counts the bodies each government runs in every sector. Open a sector to compare them side by side.</p>
    </header>
    <div class="tablewrap">
      <table class="heat">
        <thead><tr><th>Sector</th>${TIERS.map((t) => html`<th class="n">${TIER_LABEL[t]}</th>`)}</tr></thead>
        <tbody>${sectors.map(
          (s) => html`<tr><td><a href="#/sector/${s}">${SECTOR_LABEL[s]}</a></td>${TIERS.map((t) => {
            const n = count(s, t);
            const a = n ? 0.1 + (0.75 * n) / max : 0;
            return html`<td class="n">${n ? html`<a href="#/sector/${s}" style="background:color-mix(in srgb, var(--accent) ${Math.round(a * 100)}%, transparent)">${n}</a>` : html`<span class="hint">·</span>`}</td>`;
          })}</tr>`,
        )}</tbody>
      </table>
    </div>
    <section class="prose" style="margin-top:28px">
      <h2>How federal and provincial powers fit together</h2>
      <ul>
        <li><b>Federal Legislative List, Part I</b> (Fourth Schedule): defence, foreign affairs, currency, citizenship and other exclusively federal subjects. The Federal Government acts alone.</li>
        <li><b>Federal Legislative List, Part II</b>: railways, electricity, oil and gas, census and inter-provincial matters. Policy is set by the ${link(ix, "fed-cci")}, chaired by the Prime Minister with all four Chief Ministers.</li>
        <li><b>Residual subjects</b>: everything not listed, including health, school education and local government, belongs to the provinces (Art. 142(c)).</li>
        <li><b>Money</b>: the ${link(ix, "fed-nfc")} divides federal taxes between the Federation and provinces. Each province's Provincial Finance Commission passes funds on to local governments.</li>
        <li><b>Local government</b>: Art. 140A obliges each province to devolve political, administrative and financial authority to elected local governments, with elections held by the ${link(ix, "fed-ecp")}.</li>
      </ul>
    </section>`;
  return { title: "Sectors", body };
}

export function sectorView(ctx: Ctx, sector: Sector): View | undefined {
  const { ix } = ctx;
  if (!SECTOR_LABEL[sector]) return;
  const orgs = ix.bySector(sector).filter((o) => !o.abolished);
  const cols = TIERS.map((t) => ({
    t,
    items: orgs
      .filter((o) => (t === "pk" ? o.jurisdiction === "pk" : ix.tierOf(o.jurisdiction)?.id === t))
      .sort((a, b) => depth(ix, a.id) - depth(ix, b.id) || a.name.localeCompare(b.name)),
  })).filter((c) => c.items.length);
  const body = html`
    <nav class="trail"><a href="#/">Pakistan</a><span aria-hidden="true">›</span><a href="#/sectors">Sectors</a></nav>
    <header class="pagehead">
      <div class="eyebrow">Sector</div>
      <h1>${SECTOR_LABEL[sector]} in every government</h1>
      <p class="lede">${orgs.length} bodies across ${cols.length} governments, with the minister or head of each where known.</p>
    </header>
    <div class="columns">
      ${cols.map(
        (c) => html`<div class="column"><h3>${TIER_LABEL[c.t]} <span class="hint num">${c.items.length}</span></h3>
          <ul>${c.items.map((o) => {
            const head = ix.leadership(o.id).find((p) => p.role === "head" || p.role === "chief_justice");
            const holder = head ? ix.effectiveHolders(head.id)[0] : undefined;
            return html`<li><a href="#/org/${o.id}">${o.short_name ?? o.name}</a> ${confidenceChip(o.confidence)}
              <small>${kindLabel(o.kind)}${holder ? html` · ${holder.person.name}` : ""}</small></li>`;
          })}</ul></div>`,
      )}
    </div>`;
  return { title: SECTOR_LABEL[sector], body };
}

function depth(ix: Ctx["ix"], id: string) {
  return ix.orgTrail(id).length;
}

export function accountabilityView(ctx: Ctx): View {
  const { ix } = ctx;
  const authored = ix.g.positions.filter((p) => !p.generated && !p.seats && p.role !== "judge" && p.role !== "member");
  const acting = ix.g.positions.filter((p) => ix.seatStatus(p.id) === "acting");
  const vacant = ix.g.positions.filter((p) => ix.seatStatus(p.id) === "vacant");
  const unknown = authored.filter((p) => ix.seatStatus(p.id) === "unknown");
  const lowPeople = ix.g.people.filter((p) => p.confidence !== "high").sort((a, b) => a.as_of.localeCompare(b.as_of));
  const lowOrgs = ix.g.organizations.filter((o) => o.confidence === "low" || (o.confidence === "medium" && o.kind !== "field_administration"));
  const filled = authored.length - unknown.length;
  const body = html`
    <header class="pagehead">
      <div class="eyebrow">Accountability</div>
      <h1>Holdovers, extensions, retired officers and data gaps</h1>
      <p class="lede">This page lists officials continuing after their term ended, terms extended by decision or by changing the law, repeat terms, and retired or serving military officers, judges and bureaucrats in other posts. It also shows people holding several offices, declared assets, acting and vacant posts, and records still to verify.</p>
    </header>
    <div class="stats">
      <div class="stat"><b>${filled}/${authored.length}</b><span>Key posts with a recorded holder</span></div>
      <div class="stat"><b>${acting.length}</b><span>${STATUS_LABEL.acting}</span></div>
      <div class="stat"><b>${vacant.length}</b><span>Recorded vacant</span></div>
      <div class="stat"><b>${lowPeople.length}</b><span>Officeholder records to verify</span></div>
    </div>
    <div class="stack">
      ${holdingSection(ctx, "Holding over after their term ended", "Constitutional or statutory term has expired; the holder continues until a successor is appointed.", (r) => r.status === "holding_over")}
      ${holdingSection(ctx, "Extensions, renewals and reappointments", "Terms extended by government decision or by changing the law.", (r) => !!r.extensions?.length)}
      ${holdingSection(ctx, "Second and later terms in the same office", "Re-elected or re-appointed to an office they held before.", (r) => (r.term_number ?? 1) > 1)}
      ${backgroundSection(ctx, "Retired military officers in civilian posts", (b) => b.service === "military" && !!b.retired)}
      ${backgroundSection(ctx, "Serving military officers in civilian posts", (b) => b.service === "military" && !b.retired)}
      ${backgroundSection(ctx, "Retired judges and civil servants in other posts", (b) => (b.service === "judiciary" || b.service === "civil_service") && !!b.retired)}
      ${dualRoles(ctx)}
      ${assetsSection(ctx)}
      ${(() => {
        const rows = ix.g.people.flatMap((person) => (person.legal_cases ?? []).map((c) => ({ person, c }))).sort((a, b) => b.c.filed.localeCompare(a.c.filed));
        return rows.length ? html`<section><h2>Criminal and accountability cases <span class="count num">${rows.length}</span></h2><p class="hint" style="margin-bottom:10px">${CASES_NOTE}</p>${casesTable(ix, rows, true)}</section>` : "";
      })()}
      ${acting.length ? html`<section><h2>Acting and additional charge</h2><div class="posts">${acting.map((p) => postRow(ix, p, { showOrg: true }))}</div></section>` : ""}
      ${vacant.length ? html`<section><h2>Vacant</h2><div class="posts">${vacant.map((p) => postRow(ix, p, { showOrg: true }))}</div></section>` : ""}
      <section><h2>Officeholder records to verify <span class="count num">${lowPeople.length}</span></h2>
        <div class="tablewrap"><table>
          <thead><tr><th>Person</th><th>Current post</th><th>As of</th><th>Confidence</th></tr></thead>
          <tbody>${lowPeople.map(
            (p) => html`<tr><td>${link(ix, p.id)}</td><td>${p.roles.filter((r) => !r.until).map((r, i) => html`${i ? html`<br />` : ""}${link(ix, r.position)}`)}</td><td class="num">${p.as_of}</td><td>${confidenceChip(p.confidence)}</td></tr>`,
          )}</tbody>
        </table></div>
      </section>
      <section><h2>Key posts without a recorded holder <span class="count num">${unknown.length}</span></h2>
        <div class="tablewrap"><table>
          <thead><tr><th>Post</th><th>Body</th><th>Status</th></tr></thead>
          <tbody>${unknown.map((p) => html`<tr><td><a href="${hrefFor(ix, p.id)}">${p.title}</a></td><td>${link(ix, p.org, ix.shortLabel(p.org))}</td><td>${statusChip(ix, p.id)}</td></tr>`)}</tbody>
        </table></div>
      </section>
      <section><h2>Structural records to verify <span class="count num">${lowOrgs.length}</span></h2>
        <div class="cards">${lowOrgs.map((o) => html`<a class="card" href="#/org/${o.id}"><span class="t">${o.name}</span><span class="s">${kindLabel(o.kind)} ${confidenceChip(o.confidence)}</span></a>`)}</div>
      </section>
    </div>`;
  return { title: "Accountability", body };
}

type Role = Ctx["ix"]["g"]["people"][number]["roles"][number];
type Bg = NonNullable<Ctx["ix"]["g"]["people"][number]["background"]>[number];

function holdingRow(ctx: Ctx, person: Ctx["ix"]["g"]["people"][number], r: Role) {
  const { ix } = ctx;
  const post = ix.post.get(r.position)!;
  return html`<tr><td>${link(ix, person.id)}${person.party ? html`<div class="hint">${partyLink(ix, person.party)}</div>` : ""}</td>
    <td><a href="${hrefFor(ix, post.id)}">${post.title}</a><div>${selectionTag(post)}</div></td>
    <td>${holdingFlags(ix, { person, ...r }, post.id)}</td>
    <td class="num">${r.since ?? ""}</td><td class="num">${person.as_of} ${confidenceChip(person.confidence)}</td></tr>`;
}

function table(rows: ReturnType<typeof holdingRow>[]) {
  return html`<div class="tablewrap"><table><thead><tr><th>Person</th><th>Office</th><th>Flags</th><th>Since</th><th>Record</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function holdingSection(ctx: Ctx, title: string, blurb: string, pred: (r: Role) => boolean) {
  const rows = ctx.ix.g.people.flatMap((p) => p.roles.filter((r) => !r.until && pred(r)).map((r) => holdingRow(ctx, p, r)));
  if (!rows.length) return html``;
  return html`<section><h2>${title} <span class="count num">${rows.length}</span></h2><p class="hint" style="margin-bottom:10px">${blurb}</p>${table(rows)}</section>`;
}

function backgroundSection(ctx: Ctx, title: string, pred: (b: Bg) => boolean) {
  const { ix } = ctx;
  const rows = ix.g.people.flatMap((p) =>
    (p.background ?? []).some(pred)
      ? p.roles
          .filter((r) => !r.until)
          .filter((r) => {
            const sel = ix.post.get(r.position)?._selection;
            const b = (p.background ?? []).find(pred)!;
            return !(b.service === "military" && sel === "military") && !(b.service === "judiciary" && sel === "judicial") && !(b.service === "civil_service" && sel === "civil_service");
          })
          .map((r) => holdingRow(ctx, p, r))
      : [],
  );
  if (!rows.length) return html``;
  return html`<section><h2>${title} <span class="count num">${rows.length}</span></h2>${table(rows)}</section>`;
}

function dualRoles(ctx: Ctx) {
  const { ix } = ctx;
  const people = ix.g.people
    .map((p) => ({ p, posts: p.roles.filter((r) => !r.until).map((r) => ix.post.get(r.position)!).filter((x) => !x.org.startsWith("party-")) }))
    .filter(({ posts }) => new Set(posts.map((x) => x.org)).size > 1);
  if (!people.length) return html``;
  return html`<section><h2>People holding several offices at once <span class="count num">${people.length}</span></h2>
    <p class="hint" style="margin-bottom:10px">Ministers who are also legislators, officials with additional charge, and other concurrent holdings.</p>
    <div class="tablewrap"><table><thead><tr><th>Person</th><th>Offices held concurrently</th></tr></thead><tbody>${people.map(
      ({ p, posts }) => html`<tr><td>${link(ix, p.id)}${p.party ? html`<div class="hint">${partyLink(ix, p.party)}</div>` : ""}</td><td>${posts.map((x, i) => html`${i ? html`<br />` : ""}${selectionTag(x)} <a href="${hrefFor(ix, x.id)}">${x.title}</a>`)}</td></tr>`,
    )}</tbody></table></div></section>`;
}

function assetsSection(ctx: Ctx) {
  const { ix } = ctx;
  const rows = ix.g.people.flatMap((p) => (p.declared_assets ?? []).map((a) => ({ p, a }))).sort((x, y) => y.a.amount_pkr - x.a.amount_pkr);
  if (!rows.length) return html``;
  return html`<section><h2>Declared assets <span class="count num">${rows.length}</span></h2>
    <p class="hint" style="margin-bottom:10px">Assets declared to the Election Commission in nomination papers or annual statements. These are self-declared, often at historical cost, and are not audited net worth. Only figures with a verifiable published source are shown.</p>
    <div class="tablewrap"><table><thead><tr><th>Person</th><th class="n">Declared assets</th><th>Declared</th><th>Basis</th><th>Source</th></tr></thead><tbody>${rows.map(
      ({ p, a }) => html`<tr><td>${link(ix, p.id)}${p.party ? html`<div class="hint">${partyLink(ix, p.party)}</div>` : ""}</td><td class="n">Rs ${formatPkr(a.amount_pkr)}</td><td class="num">${a.as_of}</td><td>${a.basis}${a.notes ? html`<div class="hint">${a.notes}</div>` : ""}</td><td><a href="${safeHref(a.source.url)}" target="_blank" rel="noopener noreferrer">${a.source.title}</a></td></tr>`,
    )}</tbody></table></div></section>`;
}

export function lawsView(ctx: Ctx): View {
  const { ix } = ctx;
  const rank = (k: string) => (k === "constitution" ? 0 : k === "amendment" ? 1 : 2);
  const laws = [...ix.g.laws].sort((a, b) => rank(a.kind) - rank(b.kind) || (a.year ?? 0) - (b.year ?? 0));
  const body = html`
    <header class="pagehead"><div class="eyebrow">Legal sources</div><h1>Laws behind the graph</h1>
      <p class="lede">Every body and appointment in the graph points to the constitutional article, Rules of Business schedule, statute or order that creates it.</p></header>
    <div class="tablewrap"><table>
      <thead><tr><th>Instrument</th><th>Type</th><th class="n">Year</th><th>Jurisdiction</th><th class="n">Bodies</th><th class="n">Offices changed</th></tr></thead>
      <tbody>${laws.map((l) => html`<tr><td>${link(ix, l.id)} ${confidenceChip(l.confidence)}</td><td>${l.kind}</td><td class="n">${l.year ?? ""}</td><td>${ix.place.get(l.jurisdiction)?.name}</td><td class="n">${ix.enactedBodies(l.id).length}</td><td class="n">${ix.g.positions.filter((p) => p.history?.some((h) => h.law === l.id)).length + ix.g.organizations.filter((o) => o.history?.some((h) => h.law === l.id)).length || ""}</td></tr>`)}</tbody>
    </table></div>`;
  return { title: "Laws", body };
}

export function searchView(ctx: Ctx, q: string): View {
  const { ix } = ctx;
  const results = ix.search(q, 200);
  const body = html`
    <header class="pagehead"><div class="eyebrow">Search</div><h1>Results for “${q}”</h1><p class="hint">${results.length} matches</p></header>
    <div class="rels">${results.map((r) => html`<div class="rel"><div class="verb">${r.kind}</div><div><a href="${hrefFor(ix, r.id)}">${r.label}</a></div>${r.sub ? html`<div class="desc">${r.sub}</div>` : ""}</div>`)}</div>`;
  return { title: `Search: ${q}`, body };
}

export function aboutView(ctx: Ctx, single: boolean): View {
  const { ix } = ctx;
  const files = ["organizations.csv", "positions.csv", "tenures.csv", "jurisdictions.csv", "laws.csv", "edges.csv", "popolo.json"];
  const asOf = ix.g.people.map((p) => p.as_of).sort();
  const dateRange = [asOf[0] ?? "", asOf.at(-1) ?? ""];
  const body = html`
    <header class="pagehead"><div class="eyebrow">About and methodology</div><h1>Method, sources and policy</h1>
      <p class="lede">An open, source-cited model of the Pakistani state, modelled on CivLab's US and San Francisco Government Graphs and on open machinery-of-government registers in other countries.</p></header>
    <div class="layout"><div class="prose">
      <h2>What is in the graph</h2>
      <ul>
        <li><b>Bodies</b>: the Federation, Parliament, the superior courts, independent constitutional bodies, ministries and their Divisions (Rules of Business 1973, Schedule I), attached departments, regulators and state enterprises. Also every province's Governor, Chief Minister, cabinet, Assembly, High Court and departments, plus Gilgit-Baltistan and AJK.</li>
        <li><b>Field administration</b>: every division and district, with its Commissioner and Deputy Commissioner.</li>
        <li><b>Posts</b>: how each post is filled (elected, appointed, appointed on advice, ex officio, civil-service posting), by whom, after whose nomination or consultation, and with whose confirmation, citing the constitutional article or statute.</li>
        <li><b>People</b>: current officeholders with a start date, the date the record was checked, and a confidence level.</li>
        <li><b>Relationships</b>: part of, oversees, accountable to, audits, regulates, funds, appeals to, coordinates with, member of, devolved to and successor of. Every edge is typed and can carry a legal citation.</li>
      </ul>
      <h2>Standard posts</h2>
      <p>Some posts follow a fixed pattern. Every federal Division has a Federal Secretary, every Ministry has a Federal Minister, and every provincial department has a Minister and a Secretary. The build creates these posts automatically and marks them “Standard post”. A post written out explicitly in the data replaces the generated one.</p>
      <h2>Confidence</h2>
      <p>Records are <b>high</b> confidence when checked against the Constitution, a statute or an official website. <b>Verify</b> marks records from reliable public reporting, and <b>Provisional</b> marks records that still need checking. Officeholders change often, so each person record carries an as-of date.</p>
      <h2>Sources</h2>
      <p>Every fact cites a source. Official records come first: the Constitution and statutes, the Gazette, ECP results and notifications, government notifications, and the websites of the assemblies, courts and bodies themselves. Next comes state media reporting an official notification, then reputable newspapers for dates and context. Wikipedia and other encyclopedias are never cited. Who holds a post needs one official source or two independent press reports that agree.</p>
      <h2>What is recorded, and what is not</h2>
      <p>The project records public bodies, public offices and people in their public roles. It does not record private individuals, home addresses, personal phone numbers or emails, or photographs.</p>
      <ul>
        <li><b>Declared assets</b> come only from statements published by the Election Commission. They are declared values, not audited net worth.</li>
        <li><b>Family ties</b> are recorded only between people who both hold or held a public or party office, and only when an official source or two independent outlets state them.</li>
        <li><b>Legal cases</b> are not published at present. They are held back from the site and from every download until a legal review is complete.</li>
      </ul>
      <h2>Corrections</h2>
      <p>Anyone, including the people named, can ask for a correction: <a href="${ctx.repo}/issues/new?template=correction.yml" target="_blank" rel="noopener noreferrer">open a correction request</a> with the page, what is wrong and a source. Requests are acknowledged within 7 days, and accepted corrections are logged publicly in the <a href="#/verification">verification log</a>. The full editorial policy is in the repository's docs/EDITORIAL_POLICY.md.</p>
      <h2>Licence and how to cite</h2>
      <p>The data is released under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">Creative Commons Attribution 4.0 (CC BY 4.0)</a>; the code is under the MIT licence. Please cite it as:</p>
      <p class="mono" style="font-size:var(--s-sm)">Pakistan Government Graph (${ix.g.meta.data_as_of}). Data released under CC BY 4.0. ${ctx.repo}</p>
      <p>Officeholder records were last checked between ${dateRange[0]} and ${dateRange[1]}; each record shows its own date.</p>
      <h2>Inspirations</h2>
      <ul>
        <li>CivLab's US Gov Graph and SF Gov Graph: entities, positions and people linked by legal relationships, with vacancy and acting tracking.</li>
        <li>Popolo / Open Civic Data: Organization, Post, Person and Membership. The Popolo export uses this format.</li>
        <li>GOV.UK organisations register and the Institute for Government's Whitehall Monitor: typed bodies with parent departments and change over time.</li>
        <li>Canada's GC InfoBase, Australia's Directory of Government (AGOR) and Singapore's Government Directory: complete directories with a type and legal basis for each body.</li>
        <li>India's Local Government Directory: stable codes for every district and local body, which suits Pakistan's own layered local government.</li>
        <li>Open States and mySociety's TheyWorkForYou: legislators as roles in constituencies, with a full seat roster.</li>
        <li>FAFEN's Open Parliament Pakistan: seat codes match the ECP's, so attendance and performance data can be joined.</li>
        <li>LittleSis: people and organisations as a power network, including party membership.</li>
        <li>Ask Pakistan (pakistangov.online), an independent search for government services: questions in English, Urdu and Roman Urdu, answers that link official sources, and personal numbers removed in the browser. This site's Ask page follows the same approach without AI, answering only from these records.</li>
      </ul>
      <p class="hint">The repository's docs/RESEARCH.md has the full comparison.</p>
    </div>
    <aside class="rail">
      <div class="panel"><h3>Open data</h3>
        ${
          single
            ? html`<p class="hint">Downloads are available from the repository build (<span class="mono">npm run data</span> writes them to <span class="mono">public/data/export/</span>).</p>`
            : html`<ul class="plain">${files.map((f) => html`<li><a href="data/export/${f}">${f}</a></li>`)}<li><a href="data/graph.json">graph.json</a> (everything)</li></ul>`
        }
        <p class="hint" style="margin-top:10px">Built ${ix.g.meta.generated.slice(0, 10)} · officeholders as of ${ix.g.meta.data_as_of} · data under CC BY 4.0</p>
      </div>
      <div class="panel"><h3>Contribute</h3><p class="hint">Every record lives in a YAML file in <a href="${ctx.repo}/tree/main/data" target="_blank" rel="noopener noreferrer">data/</a>. Each page links to its file. Add a source with every change. <span class="mono">npm run validate</span> checks every reference before merge.</p></div>
    </aside></div>`;
  return { title: "About", body };
}
