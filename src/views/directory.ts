/** Type-based directories (departments, regulators, courts…), the elected-officials view and the officials register. */
import type { Org, Post } from "../lib/graph-index.ts";
import type { OrgKind } from "../schema.ts";
import { html, type Raw } from "../ui/dom.ts";
import { METHOD_LABEL } from "../ui/labels.ts";
import { confidenceChip, hrefFor, kindLabel, link, partyLink, statusChip, type Ctx, type View } from "./common.ts";
import { roster, wireFilters } from "./entities.ts";

export const DIRECTORIES: { key: string; label: string; kinds: OrgKind[]; blurb: string }[] = [
  { key: "departments", label: "Ministries and departments", kinds: ["ministry", "division", "department"], blurb: "Federal Ministries and their Divisions (Rules of Business 1973, Schedule I) and every provincial and territorial department." },
  { key: "regulators", label: "Regulators", kinds: ["regulator", "statutory_council", "professional_body"], blurb: "Statutory regulators at federal and provincial level, and the self-regulating professions established by law." },
  { key: "agencies", label: "Agencies and enterprises", kinds: ["attached_department", "autonomous_body", "corporation", "programme", "research_institute", "university", "hospital"], blurb: "Attached departments, autonomous bodies, state-owned enterprises, national programmes and public institutions." },
  { key: "courts", label: "Courts and tribunals", kinds: ["court", "tribunal", "judicial_council"], blurb: "The superior courts, special courts, service and appellate tribunals, and the councils that appoint and discipline judges." },
  { key: "legislatures", label: "Legislatures and committees", kinds: ["legislature", "chamber", "committee", "secretariat"], blurb: "Parliament, the provincial and territorial assemblies, and the committees that oversee the executive." },
  { key: "independent", label: "Independent bodies", kinds: ["constitutional_body", "commission", "ombudsman", "intergovernmental_forum"], blurb: "Constitutional bodies, commissions, ombudsmen and the federal–provincial forums." },
  { key: "security", label: "Security and armed forces", kinds: ["law_enforcement", "intelligence", "armed_service", "military_hq"], blurb: "Police, civil armed forces, federal law-enforcement agencies, intelligence services and the armed forces." },
  { key: "local", label: "Local government", kinds: ["local_government"], blurb: "Elected local governments under Art. 140A and cantonment boards. Field administration (Commissioners and Deputy Commissioners) is under each province's page." },
  { key: "parties", label: "Political parties", kinds: ["political_party"], blurb: "Parties registered with the Election Commission, with their leaders and members recorded as holding office." },
];

const TIER_ORDER = ["pk", "pk-ict", "pk-pb", "pk-sd", "pk-kp", "pk-ba", "pk-gb", "pk-ajk"];

function headOf(ctx: Ctx, o: Org): Post | undefined {
  return ctx.ix.leadership(o.id).find((p) => ["head", "chief_justice", "chief"].includes(p.role)) ?? ctx.ix.leadership(o.id).find((p) => p.role === "administrative_head");
}

function holderCell(ctx: Ctx, p: Post | undefined): Raw {
  if (!p) return html`<span class="hint">—</span>`;
  const hs = ctx.ix.effectiveHolders(p.id);
  if (!hs.length) return html`<a href="${hrefFor(ctx.ix, p.id)}" class="hint">${p.title}</a> ${statusChip(ctx.ix, p.id)}`;
  return html`${hs.map((h, i) => html`${i ? ", " : ""}${link(ctx.ix, h.person.id)}${h.status !== "confirmed" ? html` <span class="chip st-acting">${h.status.replace(/_/g, " ")}</span>` : ""}`)}<div class="hint">${p.title}</div>`;
}

export function directoryView(ctx: Ctx, key: string | undefined): View {
  const { ix } = ctx;
  const dir = DIRECTORIES.find((d) => d.key === key) ?? DIRECTORIES[0];
  const orgs = ix.g.organizations
    .filter((o) => dir.kinds.includes(o.kind) && !o.abolished)
    .sort(
      (a, b) =>
        TIER_ORDER.indexOf(ix.tierOf(a.jurisdiction)?.id ?? "pk") - TIER_ORDER.indexOf(ix.tierOf(b.jurisdiction)?.id ?? "pk") ||
        ix.orgTrail(a.id).length - ix.orgTrail(b.id).length ||
        a.name.localeCompare(b.name),
    );
  const withHolder = orgs.filter((o) => {
    const h = headOf(ctx, o);
    return h && ix.effectiveHolders(h.id).length;
  }).length;
  const body = html`
    <header class="pagehead"><div class="eyebrow">Directory</div><h1>${dir.label}</h1><p class="lede">${dir.blurb}</p></header>
    <nav class="tabs" aria-label="Directories">${DIRECTORIES.map((d) => html`<a href="#/directory/${d.key}" ${d.key === dir.key ? html`aria-current="page"` : ""}>${d.label}</a>`)}</nav>
    <div class="toolbar">
      <input type="search" data-filter="dir" placeholder="Filter by name, government, head or law" aria-label="Filter the directory" />
      <span class="hint num">${orgs.length} bodies · head recorded for ${withHolder}</span>
    </div>
    <div class="tablewrap"><table data-rows="dir">
      <thead><tr><th>Body</th><th>Government</th><th>Part of</th><th>Head</th><th>Legal basis</th></tr></thead>
      <tbody>${orgs.map((o) => {
        const tier = ix.tierOf(o.jurisdiction);
        return html`<tr>
          <td><a href="#/org/${o.id}">${o.name}</a>${o.short_name && o.short_name !== o.name ? html` <span class="hint">${o.short_name}</span>` : ""} ${confidenceChip(o.confidence)}<div class="hint">${kindLabel(o.kind)}</div></td>
          <td>${tier?.id === "pk" ? "Federal" : tier?.name ?? ""}</td>
          <td>${o.parent ? link(ix, o.parent, ix.shortLabel(o.parent)) : ""}</td>
          <td>${holderCell(ctx, headOf(ctx, o))}</td>
          <td>${(o.legal_basis ?? []).slice(0, 2).map((lb, i) => html`${i ? html`<br />` : ""}${link(ix, lb.law, ix.law.get(lb.law)?.short ?? ix.law.get(lb.law)?.title)}${lb.provision ? html` <span class="cite">${lb.provision}</span>` : ""}`)}</td>
        </tr>`;
      })}</tbody>
    </table></div>`;
  return { title: dir.label, body, mount: (root) => wireFilters(root) };
}

const ELECTED = new Set(["direct_election", "indirect_election"]);

/** Stable colour per party so the same party reads the same in every chamber. */
const PARTY_COLOR: Record<string, string> = {
  "party-pmln": "--b-executive",
  "party-ppp": "--bad",
  "party-pppp": "--bad",
  "party-pti": "--b-legislative",
  "party-mqmp": "--b-constitutional",
  "party-juif": "--b-military",
  "party-pmlq": "--b-local",
  "party-ipp": "--b-political",
  "party-mwm": "--b-judicial",
  "party-pkmap": "--power",
};
function partyColor(id: string) {
  return `var(${PARTY_COLOR[id] ?? "--unknown"})`;
}

export function electedView(ctx: Ctx): View {
  const { ix } = ctx;
  const chambers = ["fed-national-assembly", "fed-senate", "pb-assembly", "sd-assembly", "kp-assembly", "ba-assembly", "gb-assembly", "ajk-assembly"].filter((id) => ix.org.has(id));
  const seatPosts = (id: string) => (ix.postsByOrg.get(id) ?? []).filter((p) => p.area || p.seat_type);
  const NOT_STATE = new Set(["political_party", "professional_body", "committee", "statutory_council"]);
  const execs = ix.g.positions.filter((p) => !p.seats && !p.area && p.appointment && ELECTED.has(p.appointment.method) && !NOT_STATE.has(ix.org.get(p.org)?.kind ?? ""));
  const body = html`
    <header class="pagehead"><div class="eyebrow">Elected officials</div><h1>Who the voters and assemblies chose</h1>
      <p class="lede">Every elected seat in Parliament, the four Provincial Assemblies and the Gilgit-Baltistan and AJK assemblies, the offices those assemblies elect, and the elected heads of local government. The roster follows the 2023 delimitation used in the February 2024 general election.</p></header>
    <section><h2>Legislatures</h2>
      <div class="posts">${chambers.map((id) => {
        const o = ix.org.get(id)!;
        const seats = seatPosts(id);
        const total = seats.reduce((n, p) => n + (p.seats ?? 1), 0) || (ix.postsByOrg.get(id) ?? []).find((p) => p.seats)?.seats || 0;
        const members = seats.flatMap((p) => ix.currentHolders(p.id));
        const agg = (ix.postsByOrg.get(id) ?? []).filter((p) => p.role === "member" && !p.area && !p.seat_type).flatMap((p) => ix.currentHolders(p.id));
        const all = [...members, ...agg];
        const byParty = new Map<string, number>();
        for (const h of all) byParty.set(h.person.party ?? "none", (byParty.get(h.person.party ?? "none") ?? 0) + 1);
        const parties = [...byParty.entries()].sort((a, b) => b[1] - a[1]);
        return html`<div class="chamber">
          <div><div class="title" style="font-weight:600"><a href="#/org/${id}">${o.name}</a></div>
            <div class="hint num">${total} seats · ${all.length} members recorded</div></div>
          <div>
            <div class="meter" role="img" aria-label="Recorded members by party">${parties.map(([pid, n]) => html`<span style="width:${(100 * n) / Math.max(total, 1)}%;background:${partyColor(pid)}" title="${ix.shortLabel(pid)}: ${n}"></span>`)}</div>
            <div class="partykey">${parties.map(([pid, n]) => html`<span><i style="background:${partyColor(pid)}"></i>${pid === "none" ? "No party recorded" : ix.shortLabel(pid)} ${n}</span>`)}</div>
          </div>
        </div>`;
      })}</div>
    </section>
    <section style="margin-top:30px"><h2>Offices filled by election <span class="count num">${execs.length}</span></h2>
      <div class="toolbar"><input type="search" data-filter="exec" placeholder="Filter offices" aria-label="Filter elected offices" /></div>
      <div class="tablewrap"><table data-rows="exec">
        <thead><tr><th>Office</th><th>Elected by</th><th>Holder</th><th>Party</th></tr></thead>
        <tbody>${execs.map((p) => {
          const hs = ix.effectiveHolders(p.id);
          return html`<tr><td><a href="#/post/${p.id}">${p.title}</a></td><td>${link(ix, p.appointment!.by, ix.shortLabel(p.appointment!.by ?? ""))}</td>
            <td>${hs.length ? hs.map((h) => link(ix, h.person.id)) : html`<span class="hint">not recorded</span>`}</td><td>${hs.map((h) => partyLink(ix, h.person.party))}</td></tr>`;
        })}</tbody>
      </table></div>
    </section>
    <section style="margin-top:30px"><h2>National Assembly roster</h2>${roster(ctx, seatPosts("fed-national-assembly"))}</section>`;
  return { title: "Elected officials", body, mount: (root) => wireFilters(root) };
}

export function officialsView(ctx: Ctx, kind: string | undefined): View {
  const { ix } = ctx;
  const mode = kind === "elected" ? "elected" : "appointed";
  const rows = ix.g.people
    .flatMap((person) => person.roles.filter((r) => !r.until).map((r) => ({ person, role: r, post: ix.post.get(r.position)! })))
    .filter(({ post }) => (mode === "elected" ? ELECTED.has(post.appointment?.method ?? "") : !ELECTED.has(post.appointment?.method ?? "")))
    .sort((a, b) => TIER_ORDER.indexOf(ix.tierOf(ix.org.get(a.post.org)!.jurisdiction)?.id ?? "pk") - TIER_ORDER.indexOf(ix.tierOf(ix.org.get(b.post.org)!.jurisdiction)?.id ?? "pk"));
  const body = html`
    <header class="pagehead"><div class="eyebrow">Officials</div><h1>${mode === "elected" ? "Elected officeholders" : "Appointed officeholders"}</h1>
      <p class="lede">${
        mode === "elected"
          ? "People holding offices filled by a vote of the electorate or of an elected house."
          : "Ministers, civil servants, judges, regulators and service chiefs: people appointed, nominated or posted rather than elected. Ministers are appointed on the head of government's advice, even though most are also elected legislators."
      }</p></header>
    <nav class="tabs"><a href="#/officials/appointed" ${mode === "appointed" ? html`aria-current="page"` : ""}>Appointed</a><a href="#/officials/elected" ${mode === "elected" ? html`aria-current="page"` : ""}>Elected</a></nav>
    <div class="toolbar"><input type="search" data-filter="off" placeholder="Filter by name, office, body, party" aria-label="Filter officials" /><span class="hint num">${rows.length} holdings</span></div>
    <div class="tablewrap"><table data-rows="off">
      <thead><tr><th>Person</th><th>Office</th><th>Body</th><th>How chosen</th><th>Since</th><th>Record</th></tr></thead>
      <tbody>${rows.map(
        ({ person, role, post }) => html`<tr>
          <td>${link(ix, person.id)}${person.party ? html`<div class="hint">${partyLink(ix, person.party)}</div>` : ""}</td>
          <td><a href="#/post/${post.id}">${post.title}</a>${role.status !== "confirmed" ? html` <span class="chip st-acting">${role.status.replace(/_/g, " ")}</span>` : ""}</td>
          <td>${link(ix, post.org, ix.shortLabel(post.org))}</td>
          <td>${post.appointment ? METHOD_LABEL[post.appointment.method] : ""}${post.appointment?.by ? html`<div class="hint">${ix.shortLabel(post.appointment.on_advice_of ?? post.appointment.by)}</div>` : ""}</td>
          <td class="num">${role.since ?? ""}</td>
          <td class="num">${person.as_of} ${confidenceChip(person.confidence)}</td>
        </tr>`,
      )}</tbody>
    </table></div>`;
  return { title: "Officials", body, mount: (root) => wireFilters(root) };
}
