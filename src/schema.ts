/**
 * Pakistan Government Graph — data model.
 *
 * The ontology borrows from CivLab's US/SF Gov Graph (entities, positions,
 * people and the legal relationships between them), the Popolo / Open Civic
 * Data standard (Organization, Post, Person, Membership) and the UK/Canadian/
 * Australian machinery-of-government registers (every body carries a type,
 * a parent, a legal basis and a source). See docs/DATA_MODEL.md.
 *
 * These zod schemas validate the hand-authored YAML in data/ and the types
 * they infer are shared by the build script and the web app.
 */
import { z } from "zod";

export const Branch = z.enum([
  "executive",
  "legislative",
  "judicial",
  "constitutional", // independent constitutional bodies: ECP, AGP, FPSC, CII…
  "military",
  "local", // elected local government (Art. 140A)
]);

export const OrgKind = z.enum([
  "state", // the Federation / a Province as a whole
  "head_of_state_office",
  "cabinet",
  "ministry",
  "division", // Rules of Business 1973: a Ministry consists of one or more Divisions
  "department", // provincial department (Provincial Rules of Business)
  "attached_department",
  "autonomous_body",
  "regulator",
  "statutory_council", // professional / sector councils (PMDC, PNMC…)
  "commission",
  "corporation", // state-owned enterprise / company
  "programme", // vertical programme with its own management unit
  "hospital",
  "university",
  "research_institute",
  "intergovernmental_forum", // CCI, NEC, NFC, APEX committees
  "legislature",
  "chamber",
  "committee",
  "secretariat",
  "court",
  "tribunal",
  "judicial_council",
  "ombudsman",
  "law_enforcement",
  "intelligence",
  "armed_service",
  "military_hq",
  "field_administration", // Divisional Commissioner / Deputy Commissioner offices
  "local_government",
  "constitutional_body",
  "other",
]);

export const Confidence = z.enum(["high", "medium", "low"]);

export const Sector = z.enum([
  "health",
  "education",
  "finance",
  "revenue",
  "planning",
  "interior",
  "law",
  "justice",
  "defence",
  "foreign",
  "energy",
  "water",
  "agriculture",
  "industry",
  "commerce",
  "communications",
  "transport",
  "it_telecom",
  "information",
  "social_protection",
  "environment",
  "local_government",
  "elections",
  "accountability",
  "civil_service",
  "religious_affairs",
  "housing",
  "culture",
  "science",
  "human_rights",
  "labour",
  "population",
  "disaster",
  "governance",
]);

export const Source = z.object({
  title: z.string(),
  url: z.string().url().optional(),
  accessed: z.string().optional(),
});

export const LegalRef = z.object({
  law: z.string(), // law id
  provision: z.string().optional(), // e.g. "Art. 91", "s. 3", "Schedule I"
});

export const Budget = z.object({
  fiscal_year: z.string(), // e.g. "2025-26"
  amount_pkr: z.number(),
  type: z.enum(["current", "development", "total"]),
  source: Source,
});

export const Organization = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  short_name: z.string().optional(),
  name_ur: z.string().optional(),
  kind: OrgKind,
  branch: Branch,
  jurisdiction: z.string(),
  parent: z.string().optional(), // primary hierarchical parent (part_of)
  description: z.string().optional(),
  functions: z.array(z.string()).optional(),
  sectors: z.array(Sector).optional(),
  established: z.string().optional(),
  /** Set for historical bodies that no longer exist (kept for lineage edges). */
  abolished: z.string().optional(),
  legal_basis: z.array(LegalRef).optional(),
  website: z.string().url().optional(),
  employees: z
    .object({ count: z.number(), as_of: z.string(), source: Source })
    .optional(),
  budget: z.array(Budget).optional(),
  tags: z.array(z.string()).optional(),
  sources: z.array(Source).optional(),
  confidence: Confidence.default("high"),
  notes: z.string().optional(),
});

export const AppointmentMethod = z.enum([
  "direct_election", // elected by voters
  "indirect_election", // elected by a house / electoral college
  "appointment",
  "appointment_on_advice", // formal appointer acts on binding advice
  "selection", // selected by a commission (e.g. FPSC, JCP)
  "nomination",
  "ex_officio",
  "promotion", // civil service / military promotion & posting
  "posting", // civil servant posted by Establishment / S&GAD
]);

export const Appointment = z.object({
  method: AppointmentMethod,
  by: z.string().optional(), // position or org id that formally appoints/elects
  on_advice_of: z.string().optional(), // position id whose advice binds `by`
  nominated_by: z.string().optional(), // body that nominates / shortlists
  consultation: z.array(z.string()).optional(), // positions that must be consulted
  confirmation: z.string().optional(), // org that confirms / approves
  term: z.string().optional(),
  removal: z.string().optional(),
  legal_basis: z.array(LegalRef).optional(),
  notes: z.string().optional(),
});

export const Position = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  org: z.string(),
  role: z.enum(["head", "deputy", "member", "administrative_head", "officer", "presiding_officer", "chief_justice", "judge", "chief"]),
  grade: z.string().optional(), // BPS scale / military rank
  seats: z.number().optional(), // for multi-member positions (e.g. MNAs)
  appointment: Appointment.optional(),
  ex_officio_of: z.string().optional(), // the position that automatically holds this one
  vacant: z.boolean().optional(),
  description: z.string().optional(),
  confidence: Confidence.default("high"),
  sources: z.array(Source).optional(),
  /** True when created by the build from a naming convention (see docs/DATA_MODEL.md). */
  generated: z.boolean().optional(),
});

export const TenureStatus = z.enum(["confirmed", "acting", "additional_charge", "caretaker", "interim"]);

export const Person = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  name_ur: z.string().optional(),
  party: z.string().optional(),
  roles: z.array(
    z.object({
      position: z.string(),
      since: z.string().optional(),
      until: z.string().optional(),
      status: TenureStatus.default("confirmed"),
      source: Source.optional(),
    }),
  ),
  as_of: z.string(),
  confidence: Confidence.default("medium"),
  notes: z.string().optional(),
});

export const RelationType = z.enum([
  "part_of",
  "administrative_control", // ministry/division → attached dept / autonomous body
  "oversees",
  "appoints",
  "elects",
  "nominates",
  "confirms",
  "advises",
  "accountable_to",
  "reports_to",
  "audits",
  "regulates",
  "funds",
  "coordinates_with",
  "member_of",
  "chairs",
  "appeals_to",
  "successor_of",
  "devolved_to",
  "established_by",
  "holds",
  "head_of",
  "seat_in",
]);

export const Relation = z.object({
  from: z.string(),
  to: z.string(),
  type: RelationType,
  description: z.string().optional(),
  legal_basis: z.array(LegalRef).optional(),
  confidence: Confidence.default("high"),
});

export const Law = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  short: z.string().optional(),
  kind: z.enum(["constitution", "amendment", "act", "ordinance", "rules", "order", "regulation", "notification"]),
  year: z.number().optional(),
  jurisdiction: z.string(),
  url: z.string().url().optional(),
  summary: z.string().optional(),
  confidence: Confidence.default("high"),
});

export const JurisdictionKind = z.enum([
  "country",
  "federal_capital",
  "province",
  "special_territory", // Gilgit-Baltistan, Azad Jammu & Kashmir
  "division",
  "district",
]);

export const Jurisdiction = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  name_ur: z.string().optional(),
  kind: JurisdictionKind,
  parent: z.string().optional(),
  capital: z.string().optional(),
  headquarters: z.string().optional(),
  local_government_law: z.string().optional(),
  notes: z.string().optional(),
  confidence: Confidence.default("high"),
});

/** Compact authoring format for field administration (divisions → districts). */
export const DivisionSpec = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  headquarters: z.string().optional(),
  districts: z.array(z.string()),
  confidence: Confidence.default("high"),
});

export const FieldAdministration = z.object({
  jurisdiction: z.string(), // province / territory id
  appointing_authority: z.string(), // position id that posts Commissioners / DCs
  revenue_authority: z.string().optional(), // org id (Board of Revenue)
  divisions: z.array(DivisionSpec),
  as_of: z.string(),
  sources: z.array(Source).optional(),
});

/** A single YAML data file may contain any subset of these collections. */
export const DataFile = z.object({
  /** Field values merged into every record of that collection in the same file. */
  defaults: z
    .object({
      organizations: z.record(z.string(), z.unknown()).optional(),
      positions: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  jurisdictions: z.array(Jurisdiction).optional(),
  organizations: z.array(Organization).optional(),
  positions: z.array(Position).optional(),
  people: z.array(Person).optional(),
  relations: z.array(Relation).optional(),
  laws: z.array(Law).optional(),
  field_administration: z.array(FieldAdministration).optional(),
});

export type Branch = z.infer<typeof Branch>;
export type OrgKind = z.infer<typeof OrgKind>;
export type Sector = z.infer<typeof Sector>;
export type Source = z.infer<typeof Source>;
export type LegalRef = z.infer<typeof LegalRef>;
export type Organization = z.infer<typeof Organization>;
export type Position = z.infer<typeof Position>;
export type Person = z.infer<typeof Person>;
export type Relation = z.infer<typeof Relation>;
export type RelationType = z.infer<typeof RelationType>;
export type Law = z.infer<typeof Law>;
export type Jurisdiction = z.infer<typeof Jurisdiction>;
export type FieldAdministration = z.infer<typeof FieldAdministration>;
export type DataFile = z.infer<typeof DataFile>;

/** Compiled graph shipped to the browser (public/data/graph.json). */
export interface Graph {
  meta: {
    name: string;
    generated: string;
    data_as_of: string;
    counts: Record<string, number>;
  };
  jurisdictions: (Jurisdiction & { _file: string })[];
  organizations: (Organization & { _file: string })[];
  positions: (Position & { _file: string })[];
  people: (Person & { _file: string })[];
  laws: (Law & { _file: string })[];
  /** All edges: authored relations plus those derived from parents, appointments and roles. */
  edges: (Relation & { derived: boolean })[];
}
