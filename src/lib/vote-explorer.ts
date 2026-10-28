/**
 * Election results by district, beside census figures (the #/elections page). Pure: no DOM.
 *
 * Rules, so every number can be traced back to an ECP or PBS figure:
 *  - National totals come from every constituency in the file, as the ECP counts them.
 *  - District figures add up only constituencies that lie in one district. A constituency that
 *    covers several districts is never split by guesswork: it is left out of the district figures
 *    and listed, with its votes, so the gap is visible.
 *  - Turnout is votes polled ÷ registered voters, as the ECP publishes it. Party shares are out of
 *    valid votes.
 *  - Rows marked `not_held` (postponed, countermanded or annulled polls) are listed, never counted.
 */
import type { CensusFile, ConstituencyResult, ResultsFile } from "../schema.ts";

/** A party id, `independent`, or `name:<party name as ECP prints it>`. */
export type PartyKey = string;

export const partyKey = (v: { party?: string; party_name?: string }): PartyKey => v.party ?? `name:${v.party_name}`;

export interface Tally {
  registered: number;
  polled: number;
  valid: number;
  rejected: number;
  votes: Map<PartyKey, number>;
}

export interface DistrictRow extends Tally {
  district: string;
  constituencies: string[];
  turnoutPct: number;
  leader: PartyKey;
  leaderPct: number;
}

export interface ByDistrict {
  election: string;
  house: string;
  national: Tally & { turnoutPct: number; constituencies: number };
  rows: DistrictRow[];
  /** Constituencies covering more than one district: in the national totals, not in any district row. */
  spanning: ConstituencyResult[];
  notHeld: ConstituencyResult[];
}

const empty = (): Tally => ({ registered: 0, polled: 0, valid: 0, rejected: 0, votes: new Map() });

function add(t: Tally, r: ConstituencyResult) {
  t.registered += r.registered;
  t.polled += r.polled;
  t.valid += r.valid;
  t.rejected += r.rejected;
  for (const v of r.votes) t.votes.set(partyKey(v), (t.votes.get(partyKey(v)) ?? 0) + v.votes);
}

export const pct = (part: number, whole: number) => (whole > 0 ? (100 * part) / whole : 0);

/** The party with the most votes; ties go to the alphabetically first key, so the result is stable. */
export function leaderOf(votes: Map<PartyKey, number>): [PartyKey, number] {
  let best: [PartyKey, number] = ["", -1];
  for (const [k, n] of votes) if (n > best[1] || (n === best[1] && k < best[0])) best = [k, n];
  return best;
}

export function byDistrict(file: ResultsFile): ByDistrict {
  const national = empty();
  const per = new Map<string, Tally & { constituencies: string[] }>();
  const spanning: ConstituencyResult[] = [];
  const notHeld: ConstituencyResult[] = [];
  let counted = 0;
  for (const r of file.results) {
    if (r.not_held) {
      notHeld.push(r);
      continue;
    }
    add(national, r);
    counted++;
    if (r.districts.length > 1) {
      spanning.push(r);
      continue;
    }
    const d = r.districts[0];
    const t = per.get(d) ?? { ...empty(), constituencies: [] };
    add(t, r);
    t.constituencies.push(r.constituency);
    per.set(d, t);
  }
  const rows = [...per].map(([district, t]) => {
    const [leader, n] = leaderOf(t.votes);
    return { district, ...t, turnoutPct: pct(t.polled, t.registered), leader, leaderPct: pct(n, t.valid) };
  });
  return {
    election: file.election,
    house: file.house,
    national: { ...national, turnoutPct: pct(national.polled, national.registered), constituencies: counted },
    rows: rows.sort((a, b) => a.district.localeCompare(b.district)),
    spanning,
    notHeld,
  };
}

/** What is measured for each district: turnout, or one party's share of valid votes. */
export type Measure = "turnout" | { party: PartyKey };

export function measureOf(t: Tally, m: Measure): number {
  return m === "turnout" ? pct(t.polled, t.registered) : pct(t.votes.get(m.party) ?? 0, t.valid);
}

export interface Fit {
  slope: number;
  intercept: number;
  /** Weighted Pearson correlation, −1 to 1. */
  r: number;
  n: number;
}

/**
 * Least-squares line and correlation with each point weighted (by registered voters on the page),
 * so a district of two million voters counts for more than one of fifty thousand. Undefined for
 * fewer than three points or no spread in x.
 */
export function weightedFit(points: readonly { x: number; y: number; w: number }[]): Fit | undefined {
  const ps = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.w > 0);
  if (ps.length < 3) return undefined;
  const W = ps.reduce((s, p) => s + p.w, 0);
  const mx = ps.reduce((s, p) => s + p.w * p.x, 0) / W;
  const my = ps.reduce((s, p) => s + p.w * p.y, 0) / W;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of ps) {
    sxx += p.w * (p.x - mx) ** 2;
    syy += p.w * (p.y - my) ** 2;
    sxy += p.w * (p.x - mx) * (p.y - my);
  }
  if (sxx <= 1e-12) return undefined;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r: syy > 1e-12 ? sxy / Math.sqrt(sxx * syy) : 0, n: ps.length };
}

export type Indicator = "literacy_pct" | "urban_pct";

export interface Joined {
  row: DistrictRow;
  census?: CensusFile["districts"][number];
}

export function joinCensus(d: ByDistrict, census?: CensusFile): Joined[] {
  const by = new Map(census?.districts.map((c) => [c.district, c]));
  return d.rows.map((row) => ({ row, census: by.get(row.district) }));
}

export interface ShiftRow {
  district: string;
  before: number;
  after: number;
  /** Change in percentage points. */
  raw: number;
  /** The change minus the national change: positive where the district moved more than the country. */
  relative: number;
  leaderBefore: PartyKey;
  leaderAfter: PartyKey;
  /** Registered voters in the later election, to size or sort by. */
  registered: number;
}

export interface Shift {
  nationalBefore: number;
  nationalAfter: number;
  rows: ShiftRow[];
  /** Districts in only one of the two elections (new or merged districts, or spanning constituencies). */
  unmatched: string[];
}

/**
 * Change between two elections of the same house, district by district. Constituencies were redrawn
 * after the 2023 census, so they are compared through districts, which both elections share.
 */
export function shift(before: ByDistrict, after: ByDistrict, m: Measure): Shift {
  const a = new Map(before.rows.map((r) => [r.district, r]));
  const b = new Map(after.rows.map((r) => [r.district, r]));
  const nationalBefore = measureOf(before.national, m);
  const nationalAfter = measureOf(after.national, m);
  const swing = nationalAfter - nationalBefore;
  const rows: ShiftRow[] = [];
  for (const [d, rb] of b) {
    const ra = a.get(d);
    if (!ra) continue;
    const x = measureOf(ra, m);
    const y = measureOf(rb, m);
    rows.push({ district: d, before: x, after: y, raw: y - x, relative: y - x - swing, leaderBefore: ra.leader, leaderAfter: rb.leader, registered: rb.registered });
  }
  const unmatched = [...new Set([...a.keys(), ...b.keys()])].filter((d) => !(a.has(d) && b.has(d))).sort();
  return { nationalBefore, nationalAfter, rows: rows.sort((x, y) => x.district.localeCompare(y.district)), unmatched };
}

/** Adds up any set of rows (a filtered view): the page says these are the shown districts only. */
export function sumRows(rows: readonly Tally[]): Tally & { turnoutPct: number } {
  const t = empty();
  for (const r of rows) {
    t.registered += r.registered;
    t.polled += r.polled;
    t.valid += r.valid;
    t.rejected += r.rejected;
    for (const [k, v] of r.votes) t.votes.set(k, (t.votes.get(k) ?? 0) + v);
  }
  return { ...t, turnoutPct: pct(t.polled, t.registered) };
}

/**
 * Results by a larger unit (province or territory). Every constituency lies in one province, so
 * these add up to the national figures exactly; `unitOf` maps a constituency to its unit.
 */
export function byUnit(file: ResultsFile, unitOf: (constituency: string) => string | undefined): Map<string, Tally & { turnoutPct: number; leader: PartyKey; leaderPct: number }> {
  const per = new Map<string, Tally>();
  for (const r of file.results) {
    const u = !r.not_held && unitOf(r.constituency);
    if (!u) continue;
    const t = per.get(u) ?? empty();
    add(t, r);
    per.set(u, t);
  }
  return new Map(
    [...per].map(([u, t]) => {
      const [leader, n] = leaderOf(t.votes);
      return [u, { ...t, turnoutPct: pct(t.polled, t.registered), leader, leaderPct: pct(n, t.valid) }];
    }),
  );
}

/** Parties by votes, largest first, with their share of valid votes. */
export function topParties(t: Tally, n = 3): { party: PartyKey; votes: number; pct: number }[] {
  return [...t.votes]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([party, votes]) => ({ party, votes, pct: pct(votes, t.valid) }));
}

/**
 * Which party had the most votes in each district, before and after: districts and registered voters
 * per pair. It shows where the lead changed, not how any voter moved.
 */
export function leaderFlows(rows: readonly ShiftRow[]): { from: PartyKey; to: PartyKey; districts: number; registered: number }[] {
  const m = new Map<string, { from: PartyKey; to: PartyKey; districts: number; registered: number }>();
  for (const r of rows) {
    const k = `${r.leaderBefore}\u0000${r.leaderAfter}`;
    const f = m.get(k) ?? { from: r.leaderBefore, to: r.leaderAfter, districts: 0, registered: 0 };
    f.districts++;
    f.registered += r.registered;
    m.set(k, f);
  }
  return [...m.values()].sort((a, b) => b.districts - a.districts || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

/** RFC 4180 CSV; text cells that start with = + - @ are prefixed with ' so spreadsheets don't run them. Numbers stay numbers. */
export function toCsv(header: readonly string[], rows: readonly (string | number)[][]): string {
  const cell = (v: string | number) => {
    if (typeof v === "number") return String(v);
    const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
