/**
 * Facts and figures (docs/LAUNCH_PLAN.md §7.14). Every number here is derived from the compiled
 * graph (public/data/graph.json, written at build time); nothing is typed in by hand.
 *
 * Each bar chart is a grouping of record ids, so the same function gives both the count and the
 * evidence behind it (#/figures/<figure>/<key>). Figures that need data the project doesn't have
 * yet (past election results, party histories, ECP asset statements) report what is missing
 * instead of ranking an incomplete set (§7.14 rule 4).
 */
import type { GraphIndex, Human, Org, Post } from "./graph-index.ts";
import { ORIGIN_LABEL, SECTOR_LABEL, SELECTION_LABEL } from "../ui/labels.ts";
import { TIERS, TIER_LABEL } from "../views/tiers.ts";

/** A government filter: "all", or a tier id ("pk" for the federal government, "pk-pb", …). */
export type Gov = "all" | (typeof TIERS)[number];
export const isGov = (v: string | null | undefined): v is Gov => v === "all" || TIERS.includes(v as string);

export interface Bar {
  key: string;
  label: string;
  value: number;
  /** Highlight this bar; the rest are drawn in the de-emphasis colour. */
  emphasis?: boolean;
}

export interface BarFigure {
  id: string;
  title: string;
  /** What one unit is ("bodies", "posts"). */
  unit: string;
  bars: Bar[];
  /** What the figure covers and how it is counted. Shown under every chart. */
  basis: string;
  /** Whether the government filter applies. */
  filterable: boolean;
}

/** Record ids behind each bar, keyed by bar key. */
type Groups = Map<string, string[]>;

function push(m: Groups, key: string, id: string) {
  const list = m.get(key);
  if (list) list.push(id);
  else m.set(key, [id]);
}

const tierOfOrg = (ix: GraphIndex, o: Org | undefined) => (o ? ix.tierOf(o.jurisdiction)?.id : undefined);
const inGov = (ix: GraphIndex, o: Org | undefined, gov: Gov) => gov === "all" || tierOfOrg(ix, o) === gov;
const govName = (gov: Gov) => (gov === "all" ? "all governments" : gov === "pk" ? "the federal government" : TIER_LABEL[gov]);

/** Bodies that exist today and are part of the state (parties are listed separately). */
const liveBodies = (ix: GraphIndex) => ix.g.organizations.filter((o) => !o.abolished && o.kind !== "political_party");
const livePosts = (ix: GraphIndex) => ix.g.positions.filter((p) => !ix.org.get(p.org)?.abolished && ix.org.get(p.org)?.kind !== "political_party");

// ── Bar figures ──────────────────────────────────────────────────────────────

interface FigureDef {
  title: string;
  unit: string;
  filterable: boolean;
  group: (ix: GraphIndex, gov: Gov) => Groups;
  label: (ix: GraphIndex, key: string) => string;
  basis: (ix: GraphIndex, gov: Gov, groups: Groups) => string;
  /** Keep the bars in this order instead of largest first. */
  order?: readonly string[];
  /** Show at most this many bars; the rest fold into "All others". */
  top?: number;
}

const FIGURES: Record<string, FigureDef> = {
  "bodies-by-government": {
    title: "Government bodies by government",
    unit: "bodies",
    filterable: false,
    order: TIERS,
    group: (ix) => {
      const m: Groups = new Map();
      for (const o of liveBodies(ix)) if (!o.generated) push(m, tierOfOrg(ix, o) ?? "pk", o.id);
      return m;
    },
    label: (_ix, k) => TIER_LABEL[k] ?? k,
    basis: (ix) => {
      const gen = liveBodies(ix).filter((o) => o.generated).length;
      return `Bodies recorded by name. A further ${gen.toLocaleString("en-US")} division and district offices generated from the administrative map are not counted.`;
    },
  },
  "bodies-by-sector": {
    title: "Government bodies by sector",
    unit: "bodies",
    filterable: true,
    top: 12,
    group: (ix, gov) => {
      const m: Groups = new Map();
      for (const o of liveBodies(ix)) if (!o.generated && inGov(ix, o, gov)) for (const s of o.sectors ?? []) push(m, s, o.id);
      return m;
    },
    label: (_ix, k) => SECTOR_LABEL[k as keyof typeof SECTOR_LABEL] ?? k,
    basis: (ix, gov) => {
      const all = liveBodies(ix).filter((o) => !o.generated && inGov(ix, o, gov));
      const none = all.filter((o) => !o.sectors?.length).length;
      return `Bodies recorded by name in ${govName(gov)}. A body that works in more than one sector is counted in each. ${none} of ${all.length} have no sector recorded and are not shown.`;
    },
  },
  "posts-by-selection": {
    title: "How posts are filled",
    unit: "posts",
    filterable: true,
    group: (ix, gov) => {
      const m: Groups = new Map();
      for (const p of livePosts(ix)) if (inGov(ix, ix.org.get(p.org), gov)) push(m, p._selection ?? "unrecorded", p.id);
      return m;
    },
    label: (_ix, k) => SELECTION_LABEL[k as keyof typeof SELECTION_LABEL] ?? "Not recorded",
    basis: (_ix, gov) =>
      `Posts in ${govName(gov)}, by the method that fills them. Each elected seat is one post; a group of reserved seats is one post.`,
  },
  appointers: {
    title: "Who appoints the most posts",
    unit: "posts",
    filterable: true,
    top: 10,
    group: (ix, gov) => {
      const m: Groups = new Map();
      for (const e of ix.g.edges) {
        if (e.type !== "appoints") continue;
        const target = ix.post.get(e.to);
        if (!target || ix.org.get(target.org)?.abolished || !inGov(ix, ix.org.get(target.org), gov)) continue;
        push(m, e.from, target.id);
      }
      return m;
    },
    label: (ix, k) => ix.label(k),
    basis: (_ix, gov) =>
      `Posts in ${govName(gov)}, by the authority that formally makes the appointment. Some appoint on another's advice (the President on the Prime Minister's, a Governor on the Chief Minister's); each post's page names both.`,
  },
  "bodies-by-origin": {
    title: "What created each body",
    unit: "bodies",
    filterable: true,
    order: ["constitutional", "statutory", "executive", "conventional", "unrecorded"],
    group: (ix, gov) => {
      const m: Groups = new Map();
      for (const o of liveBodies(ix)) if (!o.generated && inGov(ix, o, gov)) push(m, o._origin ?? "unrecorded", o.id);
      return m;
    },
    label: (_ix, k) => ORIGIN_LABEL[k as keyof typeof ORIGIN_LABEL] ?? k,
    basis: (_ix, gov) =>
      `Bodies recorded by name in ${govName(gov)}, by the first legal instrument cited for them: the Constitution, an Act or Ordinance, or an executive order.`,
  },
};

export const FIGURE_IDS = Object.keys(FIGURES);

export function barFigure(ix: GraphIndex, id: string, gov: Gov = "all"): BarFigure | undefined {
  const def = FIGURES[id];
  if (!def) return undefined;
  const g = def.filterable ? gov : "all";
  const groups = def.group(ix, g);
  let bars: Bar[] = [...groups].map(([key, ids]) => ({ key, label: def.label(ix, key), value: ids.length }));
  if (def.order) bars.sort((a, b) => def.order!.indexOf(a.key) - def.order!.indexOf(b.key));
  else bars.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  if (def.top && bars.length > def.top) {
    const rest = bars.slice(def.top);
    // a record in several of the folded groups (a body in two minor sectors) counts once
    const ids = new Set(rest.flatMap((b) => groups.get(b.key) ?? []));
    bars = [...bars.slice(0, def.top), { key: "_others", label: `All others (${rest.length})`, value: ids.size }];
  }
  return { id, title: def.title, unit: def.unit, bars, basis: def.basis(ix, g, groups), filterable: def.filterable };
}

/** The records behind one bar, for the evidence page. */
export function evidence(ix: GraphIndex, id: string, key: string, gov: Gov = "all"): { title: string; label: string; ids: string[] } | undefined {
  const def = FIGURES[id];
  if (!def) return undefined;
  const groups = def.group(ix, def.filterable ? gov : "all");
  let ids: string[] | undefined;
  let label: string;
  if (key === "_others" && def.top) {
    const top = new Set(barFigure(ix, id, gov)!.bars.slice(0, def.top).map((b) => b.key));
    ids = [...groups].filter(([k]) => !top.has(k)).flatMap(([, v]) => v);
    label = "All others";
  } else {
    ids = groups.get(key);
    label = def.label(ix, key);
  }
  if (!ids) return undefined;
  return { title: def.title, label, ids: [...new Set(ids)] };
}

// ── Headline tiles ───────────────────────────────────────────────────────────

export interface Tile {
  label: string;
  value: number;
  /** A short qualifier under the value, e.g. "26 with a named member". */
  detail: string;
  href: string;
}

/** Legislative houses and their seats, counted as in docs/COVERAGE.md. */
export function houses(ix: GraphIndex) {
  const byHouse = new Map<string, Post[]>();
  for (const p of ix.g.positions)
    if (!ix.org.get(p.org)?.abolished && p.role === "member" && ["chamber", "legislature"].includes(ix.org.get(p.org)?.kind ?? "")) byHouse.set(p.org, [...(byHouse.get(p.org) ?? []), p]);
  return [...byHouse].map(([org, posts]) => {
    const roster = posts.filter((p) => p.id.startsWith("seat-"));
    const seats = (roster.length ? roster : posts).reduce((s, p) => s + (p.seats ?? 1), 0);
    const members = [...new Set(posts.flatMap((p) => ix.currentHolders(p.id).map((h) => h.person.id)))];
    return { org, seats, members };
  });
}

/** Headline numbers. Post and seat figures use the definitions in docs/COVERAGE.md. */
export function headlineTiles(ix: GraphIndex): Tile[] {
  const bodies = liveBodies(ix);
  const named = bodies.filter((o) => !o.generated).length;
  const live = ix.g.positions.filter((p) => !ix.org.get(p.org)?.abolished);
  const single = live.filter((p) => !((p.seats ?? 1) > 1));
  const held = single.filter((p) => ix.effectiveHolders(p.id).length > 0).length;
  const hs = houses(ix);
  const seats = hs.reduce((n, h) => n + h.seats, 0);
  const members = hs.reduce((n, h) => n + Math.min(h.members.length, h.seats), 0);
  const current = ix.g.people.filter((p) => p.roles.some((r) => !r.until)).length;
  const fmt = (n: number) => n.toLocaleString("en-US");
  return [
    { label: "Government bodies", value: named, detail: `in existence, plus ${fmt(bodies.length - named)} field offices`, href: "#/figures/bodies-by-government" },
    { label: "Posts", value: ix.g.positions.length, detail: `${fmt(held)} of ${fmt(single.length)} single posts with a known holder`, href: "#/figures/posts-by-selection" },
    { label: "Elected seats", value: seats, detail: `${fmt(members)} with a named member`, href: "#/elected" },
    { label: "People recorded", value: ix.g.people.length, detail: `${fmt(current)} in office now`, href: "#/officials" },
    { label: "Laws cited", value: ix.g.laws.length, detail: "Constitution, Acts and orders", href: "#/laws" },
  ];
}

// ── Prime Ministers since the earliest recorded term ─────────────────────────

export interface Term {
  person: string;
  name: string;
  since: string;
  until?: string;
}

export function pmTimeline(ix: GraphIndex) {
  const terms: Term[] = [...ix.g.pm_terms]
    .sort((a, b) => a.since.localeCompare(b.since))
    .map((t) => ({ person: t.person, name: ix.person.get(t.person)?.name ?? t.person, since: t.since, until: t.until }));
  const end = ix.g.meta.data_as_of;
  // gaps of more than 30 days between consecutive recorded terms are periods not yet in the data
  const gaps: { from: string; to: string }[] = [];
  for (let i = 1; i < terms.length; i++) {
    const prev = terms[i - 1].until;
    if (prev && days(prev, terms[i].since) > 30) gaps.push({ from: prev, to: terms[i].since });
  }
  return { terms, start: terms[0]?.since, end, gaps };
}

// ── Figures that wait for data (§7.14 career records and declared assets) ─────

export interface Readiness {
  id: string;
  title: string;
  /** The figures this unlocks once the data is complete. */
  figures: string[];
  /** What is in the data now. */
  have: string;
  /** What is needed before anything is ranked. */
  need: string;
  /** Progress towards the threshold, where it can be measured. */
  progress?: { have: number; of: number; label: string };
  ready: boolean;
}

/** Share of a house's seats that must have a same-year ECP statement before assets are ranked. */
export const ASSET_THRESHOLD = 0.9;

const isEcp = (url: string | undefined) => {
  try {
    const host = new URL(url ?? "").hostname;
    return host === "ecp.gov.pk" || host.endsWith(".ecp.gov.pk");
  } catch {
    return false;
  }
};

/** Statements that may be used in asset figures: ECP publications only (§1.5), annual statements only. */
export function ecpStatements(ix: GraphIndex) {
  return ix.g.people.flatMap((p) =>
    (p.declared_assets ?? []).filter((a) => isEcp(a.source.url) && /annual/i.test(a.basis)).map((a) => ({ person: p, ...a })),
  );
}

export function readiness(ix: GraphIndex): Readiness[] {
  const people = ix.g.people;
  const electedPost = (id: string) => ix.post.get(id)?._selection === "elected";
  const pastElected = people.flatMap((p) => p.roles.filter((r) => r.until && electedPost(r.position)));

  const withParty = people.filter((p) => p.party).length;

  const all = people.flatMap((p) => p.declared_assets ?? []);
  const ecp = ecpStatements(ix);
  const hs = houses(ix).filter((h) => h.seats > 1);
  const totalSeats = hs.reduce((n, h) => n + h.seats, 0);
  // best-covered house and fiscal year
  let best = { have: 0, of: totalSeats, label: "seats in any house with a same-year ECP statement" };
  for (const h of hs) {
    const years = new Map<string, Set<string>>();
    for (const s of ecp) if (h.members.includes(s.person.id)) years.set(s.as_of, (years.get(s.as_of) ?? new Set()).add(s.person.id));
    for (const [fy, set] of years)
      if (set.size / h.seats > best.have / best.of) best = { have: set.size, of: h.seats, label: `${ix.shortLabel(h.org)} seats with a ${fy} ECP statement` };
  }

  return [
    {
      id: "career",
      title: "Career records",
      figures: ["Most-elected legislators", "Longest-serving", "Times elected to each house", "Years in elected office"],
      have: `${pastElected.length} past elected terms recorded, for ${new Set(people.filter((p) => p.roles.some((r) => r.until && electedPost(r.position))).map((p) => p.id)).size} people. Most members' records start with their current term.`,
      need: "Past general-election and Senate results from ECP publications, covering a stated window for each house, so that every member's count is complete.",
      ready: false,
    },
    {
      id: "party",
      title: "Party changes",
      figures: ["Most party changes", "Never changed party"],
      have: `Current party only, for ${withParty} of ${people.length} people. No dated party history is recorded yet.`,
      need: "A sourced, dated party history for each person. \"Never changed party\" is shown only where that history is complete; candidates who could not stand under their own party's symbol are counted separately.",
      ready: false,
    },
    {
      id: "assets",
      title: "Declared assets",
      figures: ["Highest and lowest declared net assets, per house and party", "Median declared net assets", "Change across years"],
      have: `${ecp.length} annual statements from ECP publications. ${all.length - ecp.length} figures from press reports or nomination papers are shown on people's pages but not used here.`,
      need: `ECP annual statements for at least ${Math.round(ASSET_THRESHOLD * 100)}% of a house's seats for the same fiscal year. Rankings compare one fiscal year at a time.`,
      progress: best,
      ready: best.of > 0 && best.have / best.of >= ASSET_THRESHOLD,
    },
  ];
}

// ── One person's record, as far as the data goes ─────────────────────────────

export interface CareerSummary {
  /** Elected terms recorded in each house, keyed by house org id. */
  elected: { org: string; terms: number }[];
  /** Days in elected office across recorded terms, up to the data date. */
  electedDays: number;
  firstRecorded?: string;
  offices: number;
  partyHistory: "incomplete";
}

export function careerSummary(ix: GraphIndex, person: Human): CareerSummary {
  const end = ix.g.meta.data_as_of;
  const elected = new Map<string, number>();
  const spans: [string, string][] = [];
  for (const r of person.roles) {
    const post = ix.post.get(r.position);
    if (!post || post._selection !== "elected") continue;
    if (["chamber", "legislature"].includes(ix.org.get(post.org)?.kind ?? "") && post.role === "member") elected.set(post.org, (elected.get(post.org) ?? 0) + 1);
    if (r.since) spans.push([r.since, r.until ?? end]);
  }
  // overlapping offices (a member who is also Prime Minister) count once
  let electedDays = 0;
  let reach = "";
  for (const [from, to] of spans.sort((a, b) => a[0].localeCompare(b[0]))) {
    const start = reach && from < reach ? reach : from;
    if (to > start) electedDays += Math.max(0, days(start, to));
    if (to > reach) reach = to;
  }
  const starts = person.roles.map((r) => r.since).filter((d): d is string => !!d).sort();
  return {
    elected: [...elected].map(([org, terms]) => ({ org, terms })),
    electedDays,
    firstRecorded: starts[0],
    offices: new Set(person.roles.map((r) => r.position)).size,
    partyHistory: "incomplete",
  };
}

/** Whole days between two ISO dates (YYYY, YYYY-MM or YYYY-MM-DD). */
export function days(from: string, to: string): number {
  const d = (s: string) => Date.parse(s.length === 4 ? `${s}-01-01` : s.length === 7 ? `${s}-01` : s);
  return Math.round((d(to) - d(from)) / 86_400_000);
}
