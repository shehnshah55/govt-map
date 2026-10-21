/**
 * Compiles the hand-authored YAML in data/ into a single validated graph.
 *
 *  1. load every data/**\/*.yaml, merge per-file `defaults`, validate with zod
 *  2. expand `field_administration` into divisions, districts, Commissioner and
 *     Deputy Commissioner offices and posts
 *  3. generate convention posts (Federal Minister / Secretary for ministries and
 *     divisions; Provincial Minister / Secretary for provincial departments)
 *  4. check id uniqueness and referential integrity
 *  5. derive edges (part_of, head_of, appoints, elects, nominates, confirms,
 *     advises, holds, established_by) alongside authored relations
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";
import { isSafeUrl } from "../src/lib/safe-url.ts";
import {
  DataFile,
  Jurisdiction,
  Law,
  Organization,
  Person,
  Position,
  Relation,
  type Graph,
  type LegalRef,
  type Origin,
  type RelationType,
  type Selection,
  type Tenure,
} from "../src/schema.ts";

type WithFile<T> = T & { _file: string };

export interface CompileResult {
  graph: Graph;
  errors: string[];
  warnings: string[];
}

function walk(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return walk(p);
      return /\.ya?ml$/.test(name) ? [p] : [];
    });
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Province/territory code → the posts that drive convention-generated appointments. */
const SUBNATIONAL: Record<string, { jur: string; appointer: string; head: string; advisor: string; hr?: string; label: string }> = {
  pb: { jur: "pk-pb", appointer: "pb-governor", head: "pb-chief-minister", advisor: "pb-chief-minister", hr: "pb-sgad", label: "Punjab" },
  sd: { jur: "pk-sd", appointer: "sd-governor", head: "sd-chief-minister", advisor: "sd-chief-minister", hr: "sd-sgad", label: "Sindh" },
  kp: { jur: "pk-kp", appointer: "kp-governor", head: "kp-chief-minister", advisor: "kp-chief-minister", hr: "kp-sgad", label: "Khyber Pakhtunkhwa" },
  ba: { jur: "pk-ba", appointer: "ba-governor", head: "ba-chief-minister", advisor: "ba-chief-minister", hr: "ba-sgad", label: "Balochistan" },
  gb: { jur: "pk-gb", appointer: "gb-governor", head: "gb-chief-minister", advisor: "gb-chief-minister", label: "Gilgit-Baltistan" },
  ajk: { jur: "pk-ajk", appointer: "ajk-president", head: "ajk-prime-minister", advisor: "ajk-prime-minister", label: "Azad Jammu and Kashmir" },
};
const codeForJurisdiction = (jur: string) => Object.entries(SUBNATIONAL).find(([, v]) => v.jur === jur)?.[0];

export function compile(dataDir: string): CompileResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const jurisdictions: WithFile<Jurisdiction>[] = [];
  const organizations: WithFile<Organization>[] = [];
  const positions: WithFile<Position>[] = [];
  const people: WithFile<Person>[] = [];
  const laws: WithFile<Law>[] = [];
  const relations: (Relation & { _file: string })[] = [];
  const fieldAdmin: { block: NonNullable<DataFile["field_administration"]>[number]; file: string }[] = [];
  const seatBlocks: { block: NonNullable<DataFile["legislature_seats"]>[number]; file: string }[] = [];
  const annotations: { a: NonNullable<DataFile["annotations"]>[number]; file: string }[] = [];
  const verification: NonNullable<DataFile["verification"]> = [];

  // ── 1. load & validate ────────────────────────────────────────────────────
  for (const path of walk(dataDir)) {
    const file = relative(join(dataDir, ".."), path);
    let raw: unknown;
    try {
      raw = parse(readFileSync(path, "utf8"));
    } catch (e) {
      errors.push(`${file}: YAML parse error: ${(e as Error).message}`);
      continue;
    }
    if (raw == null) continue;
    const r = raw as Record<string, unknown[]> & { defaults?: Record<string, Record<string, unknown>> };
    const defaults = r.defaults ?? {};
    for (const key of ["organizations", "positions"] as const) {
      if (defaults[key] && Array.isArray(r[key])) {
        r[key] = r[key].map((rec) => ({ ...defaults[key], ...(rec as object) }));
      }
    }
    const parsed = DataFile.safeParse(r);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const where = issue.path.join(".");
        const rec = issue.path.length >= 2 ? (r as Record<string, unknown[]>)[String(issue.path[0])]?.[Number(issue.path[1])] : undefined;
        const id = rec && typeof rec === "object" && "id" in rec ? ` (${(rec as { id: string }).id})` : "";
        errors.push(`${file}: ${where}${id}: ${issue.message}`);
      }
      continue;
    }
    const d = parsed.data;
    d.jurisdictions?.forEach((x) => jurisdictions.push({ ...x, _file: file }));
    d.organizations?.forEach((x) => organizations.push({ ...x, _file: file }));
    d.positions?.forEach((x) => positions.push({ ...x, _file: file }));
    d.people?.forEach((x) => people.push({ ...x, _file: file }));
    d.laws?.forEach((x) => laws.push({ ...x, _file: file }));
    d.relations?.forEach((x) => relations.push({ ...x, _file: file }));
    d.field_administration?.forEach((block) => fieldAdmin.push({ block, file }));
    d.legislature_seats?.forEach((block) => seatBlocks.push({ block, file }));
    d.annotations?.forEach((a) => annotations.push({ a, file }));
    d.verification?.forEach((v) => verification.push(v));
  }

  // ── 1b. ECP asset statements (data/assets/*.csv) ─────────────────────────
  const assetsDir = join(dataDir, "assets");
  let assetRows: { file: string; cells: string[] }[] = [];
  try {
    assetRows = readdirSync(assetsDir)
      .filter((f) => f.endsWith(".csv"))
      .flatMap((f) =>
        readFileSync(join(assetsDir, f), "utf8")
          .split(/\r?\n/)
          .slice(1)
          .filter((l) => l.trim())
          .map((l) => ({ file: `data/assets/${f}`, cells: l.split(",").map((c) => c.trim()) })),
      );
  } catch {
    /* no assets folder */
  }

  // ── 2. field administration ───────────────────────────────────────────────
  const extraRelations: Relation[] = [];
  for (const { block, file } of fieldAdmin) {
    const code = codeForJurisdiction(block.jurisdiction);
    const sub = code ? SUBNATIONAL[code] : undefined;
    const govId = code ? `${code}-government` : undefined;
    const parentOrg = block.revenue_authority ?? govId;
    for (const div of block.divisions) {
      const divJur = `${block.jurisdiction}-div-${div.id}`;
      jurisdictions.push({
        id: divJur,
        name: `${div.name} Division`,
        kind: "division",
        parent: block.jurisdiction,
        headquarters: div.headquarters,
        confidence: div.confidence,
        _file: file,
      });
      const commOffice = `${divJur}-commissioner-office`;
      organizations.push({
        id: commOffice,
        name: `Office of the Commissioner, ${div.name} Division`,
        kind: "field_administration",
        branch: "executive",
        jurisdiction: divJur,
        parent: parentOrg,
        description: `Divisional administration headquartered at ${div.headquarters ?? div.name}. The Commissioner coordinates the Deputy Commissioners of ${div.districts.length} districts, supervises revenue administration and development schemes, and chairs divisional coordination committees.`,
        legal_basis: [{ law: "land-revenue-act-1967" }],
        confidence: div.confidence,
        sources: block.sources,
        generated: true,
        _file: file,
      });
      positions.push({
        id: `${divJur}-commissioner`,
        title: `Commissioner, ${div.name} Division`,
        org: commOffice,
        role: "head",
        grade: "BS-20/21",
        appointment: { method: "posting", by: block.appointing_authority, nominated_by: sub?.hr },
        confidence: div.confidence,
        generated: true,
        _file: file,
      });
      if (code) extraRelations.push({ from: commOffice, to: `${code}-chief-secretary`, type: "reports_to", confidence: "high" });
      for (const district of div.districts) {
        const dJur = `${block.jurisdiction}-${slug(district)}`;
        jurisdictions.push({
          id: dJur,
          name: `${district} District`,
          kind: "district",
          parent: divJur,
          confidence: div.confidence,
          _file: file,
        });
        const dcOffice = `${dJur}-dc-office`;
        organizations.push({
          id: dcOffice,
          name: `District Administration, ${district}`,
          kind: "field_administration",
          branch: "executive",
          jurisdiction: dJur,
          parent: commOffice,
          description: `Headed by the Deputy Commissioner, who is the District Collector (land revenue), District Magistrate functions (price control, public order coordination), and coordinator of provincial line departments in ${district}.`,
          legal_basis: [{ law: "land-revenue-act-1967" }],
          confidence: div.confidence,
          generated: true,
          _file: file,
        });
        positions.push({
          id: `${dJur}-deputy-commissioner`,
          title: `Deputy Commissioner, ${district}`,
          org: dcOffice,
          role: "head",
          grade: "BS-19/20",
          appointment: { method: "posting", by: block.appointing_authority, nominated_by: sub?.hr },
          confidence: div.confidence,
          generated: true,
          _file: file,
        });
      }
    }
  }

  // ── 2b. legislative seat rosters ──────────────────────────────────────────
  const placeName = (id: string) => {
    const j = jurisdictions.find((x) => x.id === id);
    return j ? j.name.replace(/ (District|Division)$/, "") : id;
  };
  for (const { block, file } of seatBlocks) {
    const code = block.code.toLowerCase();
    for (const range of block.ranges) {
      for (let n = range.from; n <= range.to; n++) {
        const label = `${block.code}-${n}`;
        const con = `con-${code}-${n}`;
        jurisdictions.push({ id: con, name: label, kind: "constituency", parent: range.area, confidence: range.confidence, _file: file });
        positions.push({
          id: `seat-${code}-${n}`,
          title: `${block.member_title}, ${label} (${placeName(range.area)})`,
          org: block.chamber,
          role: "member",
          area: con,
          seat_type: "general",
          appointment: {
            method: "direct_election",
            by: "pk-electorate",
            term: block.term,
            notes: "First-past-the-post election in a single-member constituency, conducted by the Election Commission of Pakistan.",
            legal_basis: block.legal_basis,
          },
          confidence: range.confidence,
          sources: block.sources,
          generated: true,
          _file: file,
        });
      }
    }
    for (const r of block.reserved ?? []) {
      const label = r.type === "women" ? "reserved seats for women" : r.type === "non_muslim" ? "reserved seats for non-Muslims" : "technocrat and ulema seats";
      positions.push({
        id: `seat-${code}-${r.type.replace("_", "-")}-${r.area}`,
        title: `${block.member_title}, ${label} (${placeName(r.area)})`,
        org: block.chamber,
        role: "member",
        seats: r.seats,
        area: r.area,
        seat_type: r.type,
        appointment: {
          method: "nomination",
          by: "fed-ecp",
          notes: "Allocated to parties in proportion to the general seats they win; filled from party lists submitted before the election and notified by the ECP.",
          legal_basis: block.legal_basis,
        },
        confidence: "high",
        sources: block.sources,
        generated: true,
        _file: file,
      });
    }
  }

  // ── 3. convention posts ───────────────────────────────────────────────────
  const orgById = new Map(organizations.map((o) => [o.id, o]));
  const postsByOrg = new Map<string, WithFile<Position>[]>();
  for (const p of positions) postsByOrg.set(p.org, [...(postsByOrg.get(p.org) ?? []), p]);
  const childKinds = new Map<string, Set<string>>();
  for (const o of organizations) if (o.parent) childKinds.set(o.parent, (childKinds.get(o.parent) ?? new Set()).add(o.kind));
  const hasPolitical = (id: string) => (postsByOrg.get(id) ?? []).some((p) => p.role === "head" && p.appointment?.method !== "posting");
  const hasCivil = (id: string) =>
    (postsByOrg.get(id) ?? []).some((p) => p.role === "administrative_head" || (p.role === "head" && p.appointment?.method === "posting"));
  const stripMinistry = (n: string) => n.replace(/^Ministry of /, "");
  const stripDept = (n: string) => n.replace(/ Department.*$/, "").replace(/, (Gilgit-Baltistan|Azad Jammu and Kashmir)$/, "");
  const NO_MINISTER = /-(sgad|board-of-revenue)$/;

  for (const o of [...organizations]) {
    if (o.abolished) continue;
    const add = (p: Omit<Position, "confidence"> & { confidence?: Position["confidence"] }) =>
      positions.push({ confidence: o.confidence, ...p, generated: true, _file: o._file } as WithFile<Position>);
    if (o.head_title && !(postsByOrg.get(o.id) ?? []).some((p) => p.role === "head" || p.role === "chief_justice"))
      add({ id: `${o.id}-head`, title: o.head_title, org: o.id, role: "head", appointment: o.head_appointment });
    if (o.id.startsWith("fed-") && o.kind === "ministry") {
      if (!hasPolitical(o.id))
        add({
          id: `${o.id}-minister`,
          title: `Federal Minister for ${stripMinistry(o.name)}`,
          org: o.id,
          role: "head",
          appointment: {
            method: "appointment_on_advice",
            by: "fed-president",
            on_advice_of: "fed-prime-minister",
            legal_basis: [{ law: "constitution-1973", provision: "Art. 92" }],
          },
        });
      if (!childKinds.get(o.id)?.has("division") && !hasCivil(o.id))
        add({
          id: `${o.id}-secretary`,
          title: `Secretary, ${o.name}`,
          org: o.id,
          role: "administrative_head",
          grade: "BS-22",
          appointment: { method: "posting", by: "fed-prime-minister", nominated_by: "fed-establishment-division" },
        });
    }
    if (o.id.startsWith("fed-") && o.kind === "division" && !hasCivil(o.id)) {
      add({
        id: `${o.id}-secretary`,
        title: `Secretary, ${o.name}`,
        org: o.id,
        role: "administrative_head",
        grade: "BS-22",
        appointment: { method: "posting", by: "fed-prime-minister", nominated_by: "fed-establishment-division" },
      });
    }
    const code = o.id.split("-")[0];
    const sub = SUBNATIONAL[code];
    if (sub && o.kind === "department") {
      if (!NO_MINISTER.test(o.id) && !hasPolitical(o.id))
        add({
          id: `${o.id}-minister`,
          title: `Minister for ${stripDept(o.name)}, ${sub.label}`,
          org: o.id,
          role: "head",
          appointment: {
            method: "appointment_on_advice",
            by: sub.appointer,
            on_advice_of: sub.advisor,
            legal_basis: code === "gb" || code === "ajk" ? undefined : [{ law: "constitution-1973", provision: "Art. 132" }],
          },
        });
      if (!hasCivil(o.id))
        add({
          id: `${o.id}-secretary`,
          title: `Secretary, ${stripDept(o.name)} Department, ${sub.label}`,
          org: o.id,
          role: "administrative_head",
          grade: "BS-20/21",
          appointment: { method: "posting", by: sub.head, nominated_by: sub.hr },
        });
    }
  }

  // ── 3b. annotations (merged by id onto posts and bodies) ──────────────────
  {
    const posById = new Map(positions.map((p) => [p.id, p]));
    const oById = new Map(organizations.map((o) => [o.id, o]));
    for (const { a, file } of annotations) {
      const target: { history?: unknown[]; tenure?: unknown; origin?: unknown; hq?: unknown; color?: unknown } | undefined = posById.get(a.id) ?? oById.get(a.id);
      if (!target) {
        errors.push(`${file}: annotation for unknown post or body "${a.id}"`);
        continue;
      }
      if (a.history) target.history = [...(target.history ?? []), ...a.history];
      if (a.tenure) target.tenure = a.tenure;
      if (a.origin) target.origin = a.origin;
      if (a.hq) target.hq = a.hq;
      if (a.color) target.color = a.color;
    }
  }

  // merge asset rows into people
  {
    const byId = new Map(people.map((p) => [p.id, p]));
    for (const { file, cells } of assetRows) {
      const [pid, fy, assets, liabilities, basis, title, url] = cells;
      const person = byId.get(pid);
      if (!person) {
        errors.push(`${file}: unknown person "${pid}"`);
        continue;
      }
      if (!isSafeUrl(url) || !Number(assets)) {
        errors.push(`${file}: row for ${pid} needs a numeric assets_pkr and an https source_url`);
        continue;
      }
      (person.declared_assets ??= []).push({
        amount_pkr: Number(assets),
        liabilities_pkr: liabilities ? Number(liabilities) : undefined,
        as_of: fy,
        basis: basis || "ECP statement",
        source: { title: title || "Election Commission of Pakistan", url },
      });
    }
  }

  // ── 4. integrity ──────────────────────────────────────────────────────────
  const kindOf = new Map<string, string>();
  const register = (id: string, kind: string, file: string) => {
    if (kindOf.has(id)) errors.push(`${file}: duplicate id "${id}" (already used by a ${kindOf.get(id)})`);
    else kindOf.set(id, kind);
  };
  jurisdictions.forEach((x) => register(x.id, "jurisdiction", x._file));
  organizations.forEach((x) => register(x.id, "organization", x._file));
  positions.forEach((x) => register(x.id, "position", x._file));
  people.forEach((x) => register(x.id, "person", x._file));
  laws.forEach((x) => register(x.id, "law", x._file));

  const expect = (id: string | undefined, kinds: string[], ctx: string) => {
    if (!id) return;
    const k = kindOf.get(id);
    if (!k) errors.push(`${ctx}: unknown reference "${id}"`);
    else if (!kinds.includes(k)) errors.push(`${ctx}: "${id}" is a ${k}, expected ${kinds.join(" or ")}`);
  };
  const actor = ["organization", "position"];
  for (const j of jurisdictions) expect(j.parent, ["jurisdiction"], `${j._file} jurisdiction ${j.id}.parent`);
  for (const j of jurisdictions) expect(j.local_government_law, ["law"], `${j._file} jurisdiction ${j.id}.local_government_law`);
  for (const l of laws) expect(l.jurisdiction, ["jurisdiction"], `${l._file} law ${l.id}.jurisdiction`);
  for (const o of organizations) {
    const ctx = `${o._file} organization ${o.id}`;
    expect(o.parent, ["organization"], `${ctx}.parent`);
    expect(o.jurisdiction, ["jurisdiction"], `${ctx}.jurisdiction`);
    o.legal_basis?.forEach((lb) => expect(lb.law, ["law"], `${ctx}.legal_basis`));
    if (o.parent === o.id) errors.push(`${ctx}: is its own parent`);
  }
  // cycle check on org parents
  for (const o of organizations) {
    const seen = new Set<string>();
    let cur: string | undefined = o.id;
    while (cur) {
      if (seen.has(cur)) {
        errors.push(`${o._file} organization ${o.id}: parent cycle via "${cur}"`);
        break;
      }
      seen.add(cur);
      cur = orgById.get(cur)?.parent;
    }
  }
  for (const p of positions) {
    const ctx = `${p._file} position ${p.id}`;
    expect(p.org, ["organization"], `${ctx}.org`);
    expect(p.ex_officio_of, ["position"], `${ctx}.ex_officio_of`);
    expect(p.area, ["jurisdiction"], `${ctx}.area`);
    const a = p.appointment;
    if (a) {
      expect(a.by, actor, `${ctx}.appointment.by`);
      expect(a.on_advice_of, ["position"], `${ctx}.appointment.on_advice_of`);
      expect(a.nominated_by, actor, `${ctx}.appointment.nominated_by`);
      expect(a.confirmation, actor, `${ctx}.appointment.confirmation`);
      a.consultation?.forEach((c) => expect(c, ["position"], `${ctx}.appointment.consultation`));
      a.legal_basis?.forEach((lb) => expect(lb.law, ["law"], `${ctx}.appointment.legal_basis`));
      if (a.method === "ex_officio" && !p.ex_officio_of) warnings.push(`${ctx}: ex_officio appointment without ex_officio_of`);
    }
  }
  for (const person of people) {
    const ctx = `${person._file} person ${person.id}`;
    person.roles.forEach((r) => expect(r.position, ["position"], `${ctx}.roles`));
    expect(person.party, ["organization"], `${ctx}.party`);
    person.legal_cases?.forEach((c) => c.filed_by?.startsWith("fed-") && expect(c.filed_by, ["organization"], `${ctx}.legal_cases`));
    if (person.party && orgById.get(person.party) && orgById.get(person.party)!.kind !== "political_party")
      errors.push(`${ctx}.party: "${person.party}" is not a political_party`);
  }
  const allRelations: Relation[] = [...relations, ...extraRelations];
  for (const r of relations) {
    const ctx = `${r._file} relation ${r.from} -${r.type}-> ${r.to}`;
    expect(r.from, [...actor, "person", "jurisdiction"], ctx);
    expect(r.to, [...actor, "person", "jurisdiction", "law"], ctx);
    r.legal_basis?.forEach((lb) => expect(lb.law, ["law"], ctx));
  }
  // Two people currently holding the same single-seat post is almost always a stale record.
  const currentHolders = new Map<string, string[]>();
  for (const person of people)
    for (const r of person.roles) if (!r.until) currentHolders.set(r.position, [...(currentHolders.get(r.position) ?? []), person.id]);
  const posById = new Map(positions.map((p) => [p.id, p]));
  for (const [pid, holders] of currentHolders) {
    const pos = posById.get(pid);
    if (holders.length > 1 && pos && !pos.seats && pos.role !== "member" && pos.role !== "judge")
      warnings.push(`position ${pid} has ${holders.length} current holders: ${holders.join(", ")}`);
  }

  // ── 5. edges ──────────────────────────────────────────────────────────────
  const edges: Graph["edges"] = [];
  const seen = new Set<string>();
  const edge = (from: string | undefined, to: string | undefined, type: RelationType, extra: Partial<Relation> = {}, derived = true) => {
    if (!from || !to || !kindOf.has(from) || !kindOf.has(to)) return;
    const key = `${from}|${type}|${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, type, confidence: "high", ...extra, derived });
  };
  for (const r of allRelations) {
    const { _file, ...rest } = r as Relation & { _file?: string };
    void _file;
    edge(rest.from, rest.to, rest.type, rest, false);
  }
  for (const o of organizations) {
    edge(o.id, o.parent, "part_of");
    o.legal_basis?.forEach((lb) => edge(o.id, lb.law, "established_by", { description: lb.provision }));
  }
  const ELECTIVE = new Set(["direct_election", "indirect_election"]);
  for (const p of positions) {
    edge(p.id, p.org, p.role === "member" || p.role === "judge" ? "seat_in" : "head_of");
    const a = p.appointment;
    if (!a) continue;
    edge(a.by, p.id, ELECTIVE.has(a.method) ? "elects" : "appoints", { description: a.method.replace(/_/g, " ") });
    edge(a.on_advice_of, p.id, "advises", { description: "binding advice on appointment" });
    edge(a.nominated_by, p.id, "nominates");
    edge(a.confirmation, p.id, "confirms");
    a.consultation?.forEach((c) => edge(c, p.id, "advises", { description: "consulted on appointment" }));
    edge(p.ex_officio_of, p.id, "holds", { description: "ex officio" });
  }
  for (const person of people)
    for (const r of person.roles) if (!r.until) edge(person.id, r.position, "holds", { description: r.status !== "confirmed" ? r.status : undefined });
  for (const person of people) edge(person.id, person.party, "member_of", { description: "party membership" });

  // ── 6. classification: origin (what creates it), selection (how it is filled), tenure ──
  const lawById = new Map(laws.map((l) => [l.id, l]));
  const originOf = (refs: LegalRef[] | undefined): Origin | undefined => {
    if (!refs?.length) return undefined;
    if (refs.some((r) => ["constitution", "amendment"].includes(lawById.get(r.law)?.kind ?? "") && !lawById.get(r.law)?.creates)) return "constitutional";
    const first = lawById.get(refs[0].law);
    if (first?.creates) return first.creates;
    const k = first?.kind;
    if (k === "act" || k === "ordinance" || k === "order" || k === "regulation") return "statutory";
    if (k === "rules" || k === "notification") return "executive";
    return undefined;
  };
  const orgOrigin = new Map<string, Origin>();
  const resolveOrgOrigin = (id: string, depth = 0): Origin => {
    const cached = orgOrigin.get(id);
    if (cached) return cached;
    const o = orgById.get(id);
    if (!o) return "conventional";
    const v =
      o.origin ??
      originOf(o.legal_basis) ??
      (["department", "division", "ministry"].includes(o.kind)
        ? "executive"
        : o.parent && depth < 8
          ? resolveOrgOrigin(o.parent, depth + 1)
          : "unrecorded");
    orgOrigin.set(id, v);
    return v;
  };
  const ELECT = new Set(["direct_election", "indirect_election"]);
  const selectionOf = (p: Position): Selection => {
    const o = orgById.get(p.org);
    const m = p.appointment?.method;
    if (m && ELECT.has(m)) return "elected";
    if (m === "ex_officio") return "ex_officio";
    if ((p.role === "judge" || p.role === "chief_justice") && o?.branch === "judicial") return "judicial";
    if (o?.branch === "military" || /General|Admiral|Air Chief|Marshal/.test(p.grade ?? "")) return "military";
    if (m === "posting" || m === "promotion") return "civil_service";
    if (o && ["regulator", "statutory_council", "professional_body"].includes(o.kind)) return "regulatory";
    if (o && (o.branch === "constitutional" || ["constitutional_body", "ombudsman"].includes(o.kind))) return "constitutional";
    if (m === "appointment_on_advice" && (p.appointment?.on_advice_of === "fed-prime-minister" || /chief-minister|prime-minister/.test(p.appointment?.on_advice_of ?? "")) && !p.appointment?.term)
      return "political";
    if (m === "appointment" && /prime-minister|chief-minister/.test(p.appointment?.by ?? "") && !p.appointment?.term) return "political";
    return "statutory";
  };
  const years = (term?: string) => {
    const m = term?.match(/(\d+)\s*year/);
    return m ? Number(m[1]) : undefined;
  };
  const tenureOf = (p: Position, sel: Selection): Tenure | undefined => {
    if (p.tenure) return p.tenure;
    const term = p.appointment?.term;
    if (sel === "elected") return { kind: "elected_term", years: years(term), notes: term };
    if (sel === "ex_officio") return { kind: "coterminous", notes: "Held for as long as the holder occupies the parent office." };
    if (sel === "judicial") {
      const sc = ["fed-supreme-court", "fed-constitutional-court", "fed-federal-shariat-court"].includes(p.org);
      return { kind: "age_limit", age: sc ? 65 : 62, notes: sc ? "Retires at 65 (Art. 179)." : "Retires at 62 (Art. 195).", legal_basis: [{ law: "constitution-1973", provision: sc ? "Art. 179" : "Art. 195" }] };
    }
    if (years(term)) return { kind: "fixed", years: years(term), notes: term };
    if (sel === "civil_service") return { kind: "service", notes: "Posted and transferred at the government's discretion; civil servants retire at 60." };
    if (sel === "military") return { kind: "service", notes: "Military posting; service chiefs have fixed terms set by the service Acts." };
    if (sel === "political") return { kind: "pleasure", notes: "Holds office during the pleasure of the appointing authority; ends with the government that appointed them." };
    return undefined;
  };
  // references inside the new fields
  for (const o of organizations) {
    o.history?.forEach((h) => expect(h.law, ["law"], `${o._file} organization ${o.id}.history`));
    o.composition?.parties.forEach((cp) => cp.party !== "independent" && cp.party !== "other" && expect(cp.party, ["organization"], `${o._file} organization ${o.id}.composition`));
    if (o.composition) {
      const sum = o.composition.parties.reduce((n, cp) => n + cp.seats, 0);
      if (sum !== o.composition.total) warnings.push(`${o._file} organization ${o.id}: composition seats sum to ${sum}, total is ${o.composition.total}`);
    }
  }
  for (const p of positions) {
    p.history?.forEach((h) => expect(h.law, ["law"], `${p._file} position ${p.id}.history`));
    expect(p.tenure?.extension_by, actor, `${p._file} position ${p.id}.tenure.extension_by`);
  }
  for (const person of people)
    for (const r of person.roles)
      for (const x of r.extensions ?? []) {
        expect(x.by, actor, `${person._file} person ${person.id}.extensions.by`);
        expect(x.law, ["law"], `${person._file} person ${person.id}.extensions.law`);
      }
  const orgsOut = organizations.map((o) => ({ ...o, _origin: resolveOrgOrigin(o.id) }));
  const positionsOut = positions.map((p) => {
    const sel = selectionOf(p);
    return { ...p, _origin: p.origin ?? originOf(p.appointment?.legal_basis) ?? resolveOrgOrigin(p.org), _selection: sel, _tenure: tenureOf(p, sel) };
  });
  // edges for legal history (drillable from a law to every office it changed)
  for (const o of organizations) o.history?.forEach((h) => edge(o.id, h.law, "established_by", { description: `${h.year}: ${h.change}` }));
  for (const p of positions) p.history?.forEach((h) => edge(p.id, h.law, "established_by", { description: `${h.year}: ${h.change}` }));

  const dataAsOf = people.map((p) => p.as_of).sort().at(-1) ?? "";
  const graph: Graph = {
    meta: {
      name: "Pakistan Government Graph",
      generated: new Date().toISOString(),
      data_as_of: dataAsOf,
      counts: {
        jurisdictions: jurisdictions.length,
        organizations: organizations.length,
        positions: positions.length,
        people: people.length,
        laws: laws.length,
        edges: edges.length,
      },
    },
    jurisdictions,
    organizations: orgsOut,
    positions: positionsOut,
    people,
    laws,
    verification,
    pm_terms: people
      .flatMap((p) => p.roles.filter((r) => r.position === "fed-prime-minister" && r.since).map((r) => ({ person: p.id, since: r.since!, until: r.until, status: r.status })))
      .sort((a, b) => a.since.localeCompare(b.since)),
    edges,
  };
  for (const v of verification) v.records?.forEach((r) => expect(r, ["organization", "position", "person", "law", "jurisdiction"], `verification "${v.claim}"`));
  return { graph, errors, warnings };
}
