/**
 * Parliament seating chart: seats laid out on concentric arcs, parties in
 * contiguous blocks, opposition to the chair's left and the treasury benches
 * to the chair's right (as seen from the chair, which faces the House). Named
 * members are placed on the front rows of their party's block and ringed.
 */
import type { GraphIndex, Human } from "../lib/graph-index.ts";
import { esc, html, raw, type Raw } from "./dom.ts";

interface Seat {
  x: number;
  y: number;
  angle: number;
  row: number;
}

function layout(total: number): { seats: Seat[]; r: number } {
  const rows = total > 300 ? 12 : total > 150 ? 9 : total > 60 ? 6 : 4;
  const inner = 0.38;
  const radii = Array.from({ length: rows }, (_, i) => inner + ((1 - inner) * i) / (rows - 1));
  const sum = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.floor((total * r) / sum));
  let left = total - counts.reduce((a, b) => a + b, 0);
  for (let i = rows - 1; left > 0; i = (i - 1 + rows) % rows, left--) counts[i]++;
  const seats: Seat[] = [];
  radii.forEach((r, row) => {
    const n = counts[row];
    for (let j = 0; j < n; j++) {
      const angle = n === 1 ? Math.PI / 2 : Math.PI * (1 - j / (n - 1));
      seats.push({ x: r * Math.cos(angle), y: r * Math.sin(angle), angle, row });
    }
  });
  seats.sort((a, b) => b.angle - a.angle || a.row - b.row);
  return { seats, r: ((1 - inner) / rows) * 0.36 };
}

export interface Occupant {
  person: Human;
  offices: string[];
  seat?: string;
}

export function hemicycle(ix: GraphIndex, chamberId: string): Raw {
  const o = ix.org.get(chamberId);
  const comp = o?.composition;
  if (!o || !comp) return raw("");
  const { seats, r } = layout(comp.total);
  const side = { opposition: 0, other: 1, treasury: 2 } as const;
  const blocks = [...comp.parties].sort((a, b) => side[a.side] - side[b.side] || (a.side === "treasury" ? a.seats - b.seats : b.seats - a.seats));

  // members recorded in the dataset, grouped by party (with aliases for how parties sit in this House)
  const inComp = new Set(comp.parties.map((p) => p.party));
  const alias = (party: string | undefined, sideOf?: string) => {
    if (party && inComp.has(party)) return party;
    if (party === "party-pti" && inComp.has("party-sic")) return "party-sic";
    if (party === "party-pppp" && inComp.has("party-ppp")) return "party-ppp";
    return sideOf ?? "independent";
  };
  const occupants = new Map<string, Occupant>();
  let presidingId: string | undefined;
  for (const post of ix.postsByOrg.get(chamberId) ?? []) {
    for (const h of ix.currentHolders(post.id)) {
      const occ = occupants.get(h.person.id) ?? { person: h.person, offices: [] };
      if (post.area || post.seat_type) occ.seat = post.area ? ix.place.get(post.area)?.name : post.title;
      else if (post.role !== "member") {
        occ.offices.push(post.title.replace(/ (of|in) the (National Assembly|Senate)$/, "").replace(/,? (National Assembly|Senate)( of Pakistan)?$/, ""));
        if (post.role === "presiding_officer" && !presidingId) presidingId = h.person.id;
      }
      occupants.set(h.person.id, occ);
    }
  }
  // executive offices held by members of this House (ministers, PM)
  for (const occ of occupants.values())
    for (const role of occ.person.roles.filter((x) => !x.until)) {
      const post = ix.post.get(role.position);
      if (!post || post.org === chamberId || post.seats || post.area) continue;
      if (["fed-cabinet", "fed-pm-office", "fed-president-office"].includes(post.org) || post.org.startsWith("fed-min-") || post.org.startsWith("party-"))
        occ.offices.push(post.title.replace(/^Federal Minister for /, "Minister: "));
    }
  const govtRole = (occ: Occupant) => occ.offices.some((t) => /^Minister|Prime Minister|Leader of the House|Deputy Prime Minister/.test(t));
  const blockKey = (party: string, side: string) => (party === "independent" ? `independent:${side}` : party);
  const byParty = new Map<string, Occupant[]>();
  for (const occ of occupants.values()) {
    const p = alias(occ.person.party);
    const key = p === "independent" ? `independent:${govtRole(occ) ? "treasury" : "opposition"}` : p;
    byParty.set(key, [...(byParty.get(key) ?? []), occ]);
  }
  for (const list of byParty.values()) list.sort((a, b) => b.offices.length - a.offices.length);

  const color = (party: string) => ix.org.get(party)?.color ?? (party === "independent" ? "var(--unknown)" : "var(--line-strong)");
  const label = (party: string) => (party === "independent" ? "Independents" : party === "other" ? "Other / vacant" : ix.shortLabel(party));

  // assign seats block by block; named members take the front rows of their block
  const W = 1000;
  const H = 540;
  const cx = W / 2;
  const cy = H - 40;
  const R = 440;
  let cursor = 0;
  const circles: string[] = [];
  const named: { occ: Occupant; party: string; x: number; y: number }[] = [];
  for (const b of blocks) {
    const mine = seats.slice(cursor, cursor + b.seats);
    cursor += b.seats;
    const front = [...mine].sort((a, c) => a.row - c.row);
    const key = blockKey(b.party, b.side);
    const people = b.side === "other" ? [] : [...(byParty.get(key) ?? [])];
    // independents appear in both treasury and opposition blocks; split by known side
    const taken = new Set<Seat>();
    const assign = people.slice(0, b.seats);
    assign.forEach((occ, i) => {
      const s = front[i];
      taken.add(s);
      named.push({ occ, party: b.party, x: cx + s.x * R, y: cy - s.y * R });
    });
    if (people.length) byParty.set(key, people.slice(assign.length));
    for (const s of mine) {
      if (taken.has(s)) continue;
      const href = b.party.startsWith("party-") ? `#/org/${b.party}` : `#/org/${chamberId}`;
      circles.push(
        `<a href="${esc(href)}"><circle class="hemi-seat" cx="${(cx + s.x * R).toFixed(1)}" cy="${(cy - s.y * R).toFixed(1)}" r="${(r * R).toFixed(1)}" fill="${esc(color(b.party))}"><title>${esc(label(b.party))} (${b.side}) — member not yet recorded; click for the party</title></circle></a>`,
      );
    }
  }
  const namedSvg = named.map(({ occ, party, x, y }) => {
    const tip = [occ.person.name, label(party), occ.seat, ...occ.offices].filter(Boolean).join(" · ");
    return `<a href="#/person/${esc(occ.person.id)}"><circle class="hemi-seat" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * R * 1.15).toFixed(1)}" fill="${esc(color(party))}" stroke="var(--ink)" stroke-width="2.4"><title>${esc(tip)}</title></circle></a>`;
  });
  const presiding = presidingId ? occupants.get(presidingId) : undefined;
  const totals = (s: "treasury" | "opposition" | "other") => comp.parties.filter((p) => p.side === s).reduce((n, p) => n + p.seats, 0);
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Seating chart of the ${esc(o.name)}">
    <text x="60" y="${cy + 30}" font-size="15" fill="var(--muted)" font-family="IBM Plex Sans, sans-serif">◀ Opposition · ${totals("opposition")}</text>
    <text x="${W - 60}" y="${cy + 30}" font-size="15" fill="var(--muted)" text-anchor="end" font-family="IBM Plex Sans, sans-serif">Treasury benches · ${totals("treasury")} ▶</text>
    ${circles.join("")}${namedSvg.join("")}
    <rect x="${cx - 16}" y="${cy - 14}" width="32" height="20" rx="4" fill="var(--k-navy)"><title>${esc(presiding ? `Chair: ${presiding.person.name}` : "Chair")}</title></rect>
    <text x="${cx}" y="${cy + 30}" font-size="13" fill="var(--ink-2)" text-anchor="middle" font-family="IBM Plex Sans, sans-serif">${esc(presiding ? presiding.person.name : "Chair")}</text>
  </svg>`;

  const legendRow = (p: (typeof comp.parties)[number]) =>
    html`<li><i style="background:${color(p.party)}"></i>${p.party.startsWith("party-") ? html`<a href="#/org/${p.party}">${label(p.party)}</a>` : label(p.party)} <span class="hint num">${p.seats}</span></li>`;
  const officeHolders = named.filter((n) => n.occ.offices.length);
  return html`<div class="hemi-wrap">
    ${raw(svg)}
    <div class="hemi-legend">
      <div><h4>Treasury benches · ${totals("treasury")}</h4><ul>${comp.parties.filter((p) => p.side === "treasury").map(legendRow)}</ul></div>
      <div><h4>Opposition · ${totals("opposition")}</h4><ul>${comp.parties.filter((p) => p.side === "opposition").map(legendRow)}</ul></div>
      ${totals("other") ? html`<div><h4>Other or vacant · ${totals("other")}</h4><ul>${comp.parties.filter((p) => p.side === "other").map(legendRow)}</ul></div>` : ""}
      <div><h4>Office-holders in this House (ringed)</h4><ul>${officeHolders.map(
        (n) => html`<li><i style="background:${color(n.party)}"></i><a href="#/person/${n.occ.person.id}">${n.occ.person.name}</a> <span class="hint">${label(n.party)}${n.occ.seat ? ` · ${n.occ.seat}` : ""} · ${n.occ.offices.join("; ")}</span></li>`,
      )}</ul></div>
    </div>
    <p class="hint" style="margin-top:10px">Party positions as of ${comp.as_of} (${comp.confidence} confidence). ${comp.notes ?? ""} Ringed seats are members recorded by name. Other seats show party strength only, not individual members.</p>
  </div>`;
}
