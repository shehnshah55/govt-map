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
import { isSafeUrl, SAFE_URL_MESSAGE } from "./lib/safe-url.ts";
import { ASSET_SOURCE_HOSTS, isAssetSource, isEcpSource, isOfficialSiteUrl } from "./lib/policy.ts";

/** Every URL field: https only (see src/lib/safe-url.ts). Plain z.string().url() would accept javascript: and data: URLs. */
export const SafeUrl = z.string().refine(isSafeUrl, { message: SAFE_URL_MESSAGE });
/** Display colours go straight into SVG attributes and inline styles, so only #rrggbb is allowed. */
export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colour must be #rrggbb");

export const Branch = z.enum([
  "executive",
  "legislative",
  "judicial",
  "constitutional", // independent constitutional bodies: ECP, AGP, FPSC, CII…
  "military",
  "local", // elected local government (Art. 140A)
  "political", // registered political parties (outside the state, but they select most office-holders)
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
  "political_party",
  "professional_body", // statutory self-regulating professions (bar councils, PEC, ICAP…)
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
  url: SafeUrl.optional(),
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

/** A dated change in the legal basis of an office or body — drillable to the law. */
export const HistoryEntry = z.object({
  year: z.number(),
  law: z.string(),
  provision: z.string().optional(),
  change: z.string(),
});

export const Tenure = z.object({
  kind: z.enum([
    "fixed", // fixed term of `years`
    "age_limit", // until the retirement age `age`
    "pleasure", // holds office during the pleasure of the appointing authority
    "coterminous", // ends with the government / assembly / appointing office
    "service", // civil-service or military posting until transfer or superannuation
    "elected_term", // term of the house or office
  ]),
  years: z.number().optional(),
  age: z.number().optional(),
  renewable: z.enum(["no", "once", "yes", "extendable"]).optional(),
  extension_by: z.string().optional(), // post or org id that can extend or reappoint
  holdover: z.boolean().optional(), // continues after expiry until a successor is appointed
  notes: z.string().optional(),
  legal_basis: z.array(LegalRef).optional(),
});

export const Origin = z.enum(["constitutional", "statutory", "executive", "conventional", "unrecorded"]);

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
  website: SafeUrl.optional(),
  employees: z
    .object({ count: z.number(), as_of: z.string(), source: Source })
    .optional(),
  budget: z.array(Budget).optional(),
  tags: z.array(z.string()).optional(),
  sources: z.array(Source).optional(),
  confidence: Confidence.default("high"),
  notes: z.string().optional(),
  /** Headquarters city (for the geographic view). */
  hq: z.string().optional(),
  /** Display colour (used for political parties). */
  color: HexColor.optional(),
  /** Overrides the origin derived from the first legal_basis entry. */
  origin: Origin.optional(),
  history: z.array(HistoryEntry).optional(),
  /** Party composition of a legislature. */
  composition: z
    .object({
      as_of: z.string(),
      total: z.number(),
      parties: z.array(z.object({ party: z.string(), seats: z.number(), side: z.enum(["treasury", "opposition", "other"]) })),
      notes: z.string().optional(),
      sources: z.array(Source),
      confidence: Confidence.default("medium"),
    })
    .optional(),
  /** Title of the body's head. The build creates a "<id>-head" post with it unless a head post is authored. */
  head_title: z.string().optional(),
  /** How the head is filled, for the generated head post. */
  head_appointment: z.lazy(() => Appointment).optional(),
  /** True when created by the build (division and district offices from field_administration blocks). */
  generated: z.boolean().optional(),
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
  /** For legislative seats: the constituency or area the seat represents. */
  area: z.string().optional(),
  tenure: Tenure.optional(),
  history: z.array(HistoryEntry).optional(),
  origin: Origin.optional(),
  seat_type: z.enum(["general", "women", "non_muslim", "technocrat", "at_large"]).optional(),
  description: z.string().optional(),
  confidence: Confidence.default("high"),
  sources: z.array(Source).optional(),
  /** True when created by the build from a naming convention (see docs/DATA_MODEL.md). */
  generated: z.boolean().optional(),
});

export const TenureStatus = z.enum(["confirmed", "acting", "additional_charge", "caretaker", "interim", "holding_over"]);

export const Person = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  name_ur: z.string().optional(),
  party: z.string().optional(), // organization id of a political_party
  roles: z.array(
    z.object({
      position: z.string(),
      since: z.string().optional(),
      until: z.string().optional(),
      status: TenureStatus.default("confirmed"),
      /** Scheduled end of the current term, if known. */
      ends: z.string().optional(),
      /** For holding_over: when the term expired. */
      term_ended: z.string().optional(),
      /** 2 = second term in this post, etc. */
      term_number: z.number().optional(),
      extensions: z
        .array(z.object({ granted: z.string().optional(), to: z.string().optional(), by: z.string().optional(), law: z.string().optional(), notes: z.string().optional() }))
        .optional(),
      source: Source.optional(),
    }),
  ),
  /**
   * A sourced statement that the person is not a member of any legislature (for example a cabinet
   * notification listing them as a non-member Adviser). Used for the "Not directly elected" tag.
   */
  non_member: z.object({ as_of: z.string(), source: Source }).optional(),
  /** Career background: e.g. a retired Lieutenant-General now in a civilian post. */
  background: z
    .array(
      z.object({
        service: z.enum(["military", "judiciary", "civil_service", "police", "foreign_service", "business", "law", "academia", "media", "medicine", "politics"]),
        rank: z.string().optional(),
        retired: z.string().optional(), // date, or "yes" when the date is unknown
        notes: z.string().optional(),
      }),
    )
    .optional(),
  /** Criminal and accountability cases, recorded only from reported court outcomes with a source. */
  legal_cases: z
    .array(
      z.object({
        title: z.string(),
        filed: z.string(), // date the case/reference/FIR was filed
        filed_by: z.string().optional(), // agency id or name (NAB, FIA, police)
        court: z.string().optional(),
        charges: z.string().optional(),
        status: z.enum(["pending", "convicted", "convicted_on_appeal", "acquitted", "quashed", "withdrawn", "stayed", "pardoned"]),
        verdict_date: z.string().optional(),
        sentence: z.string().optional(),
        fine: z.string().optional(),
        custody: z.string().optional(), // time actually spent in custody
        outcome: z.string().optional(),
        sources: z.array(Source).min(1),
      }),
    )
    .optional(),
  /** Assets declared to the ECP (nomination papers or annual statements) — not independently audited net worth. */
  declared_assets: z
    .array(
      z.object({
        amount_pkr: z.number(),
        liabilities_pkr: z.number().optional(),
        as_of: z.string(),
        basis: z.string(),
        // §1.5: ECP publications only
        source: Source.refine((src) => isAssetSource(src.url), { message: `declared assets must cite an ECP publication (${ASSET_SOURCE_HOSTS.join(", ")})` }),
        notes: z.string().optional(),
      }),
    )
    .optional(),
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

/**
 * A family tie between two people who both hold or held a public office or party office
 * (docs/EDITORIAL_POLICY.md). Stored once per pair, from the older generation where it applies.
 */
export const Relative = z.object({
  from: z.string(),
  to: z.string(),
  relation: z.enum(["parent", "spouse", "sibling", "grandparent", "uncle_or_aunt", "cousin", "in_law"]),
  sources: z.array(Source).min(1),
  notes: z.string().optional(),
});

/** An ECP result document. Only ECP publications are accepted (docs/EDITORIAL_POLICY.md § Elections). */
const EcpSource = Source.refine((src) => isEcpSource(src.url), { message: "must be an ECP publication (ecp.gov.pk)" });
const Tally = z.object({ name: z.string(), party: z.string().optional(), votes: z.number().int().nonnegative() });

/**
 * A seat checked for the Form 45 / Form 47 question. Form 45 is the result of the count at each
 * polling station; Form 47 is the provisional consolidated result for the constituency. When the
 * Form 45 totals give a different winner from Form 47, the declared winner is labelled
 * "not legally elected", always with these figures and documents beside the label.
 */
export const ElectionCheck = z.object({
  seat: z.string(),
  election: z.string(),
  /** The person declared the winner on Form 47. */
  person: z.string(),
  form47: z.object({ winner: Tally, source: EcpSource }),
  form45: z.object({
    /** Highest total in the Form 45s. */
    leader: Tally,
    /** The Form 47 winner's total in the same Form 45s. */
    declared_winner: Tally,
    polling_stations: z.number().int().positive().optional(),
    of_polling_stations: z.number().int().positive().optional(),
    sources: z.array(EcpSource).min(1),
  }),
  /** Party or observer compilations used to find the seat. They are never the evidence. */
  found_via: z.array(Source).optional(),
  status: z.enum(["differs", "matches", "under_review"]),
  checked: z.string(),
  notes: z.string().optional(),
});

export const Law = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  short: z.string().optional(),
  kind: z.enum(["constitution", "amendment", "act", "ordinance", "rules", "order", "regulation", "notification"]),
  /** What kind of office an instrument creates, when its `kind` is ambiguous (e.g. an executive "Order"). */
  creates: z.enum(["constitutional", "statutory", "executive"]).optional(),
  year: z.number().optional(),
  jurisdiction: z.string(),
  url: SafeUrl.optional(),
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
  "constituency",
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

/** Compact authoring format for the general-seat roster of a legislature. */
export const LegislatureSeats = z.object({
  chamber: z.string(), // organization id
  code: z.string(), // "NA", "PP", "PS", "PK", "PB"
  member_title: z.string(), // "Member of the National Assembly"
  legal_basis: z.array(LegalRef),
  term: z.string().optional(),
  ranges: z.array(z.object({ from: z.number(), to: z.number(), area: z.string(), confidence: Confidence.default("medium") })),
  reserved: z.array(z.object({ type: z.enum(["women", "non_muslim", "technocrat"]), seats: z.number(), area: z.string() })).optional(),
  as_of: z.string(),
  sources: z.array(Source).optional(),
});

/** Governments a registry site belongs to (data/official-sites.yaml). */
export const SiteLevel = z.enum(["federal", "punjab", "sindh", "kp", "balochistan", "ict", "ajk", "gb"]);
export const SiteCategory = z.enum([
  "government", // portals, ministries, departments, offices
  "legislature",
  "identity_travel",
  "tax_business",
  "social_protection",
  "jobs_education",
  "health",
  "utilities",
  "law_justice",
  "police_safety",
  "regulators",
  "land_records",
  "citizen_services",
  "overseas",
  "statistics",
]);
/** Result of the last link check: verified, served with a broken TLS certificate chain, or not reachable from a CI runner. */
export const SiteStatus = z.enum(["verified", "cert_issue", "unreachable_from_ci"]);

/** One official government website, optionally tied to a body in the graph. */
export const OfficialSite = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  name_ur: z.string().optional(),
  /** Homepage. Must be on an official domain (OFFICIAL_SUFFIXES / OFFICIAL_ORG_HOSTS in src/lib/policy.ts). */
  url: SafeUrl.refine((u) => isOfficialSiteUrl(u), { message: "official site must be on a government domain or a host in OFFICIAL_ORG_HOSTS (src/lib/policy.ts)" }),
  level: SiteLevel,
  category: SiteCategory,
  /** What people come to the site for, in English, Urdu and Roman Urdu. Used by Find a service (#/find). */
  services: z.array(z.string()).optional(),
  /** The body in the graph that runs the site. */
  body_id: z.string().optional(),
  /** A single-service portal (e-stamping, bill lookup, …), not the body's homepage: never back-filled as its website. */
  portal: z.boolean().optional(),
  status: SiteStatus,
  checked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
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
  relatives: z.array(Relative).optional(),
  election_checks: z.array(ElectionCheck).optional(),
  laws: z.array(Law).optional(),
  field_administration: z.array(FieldAdministration).optional(),
  legislature_seats: z.array(LegislatureSeats).optional(),
  official_sites: z.array(OfficialSite).optional(),
  /** Log of fact checks: what was verified, corrected or left unverified, and against which sources. */
  verification: z
    .array(
      z.object({
        claim: z.string(),
        records: z.array(z.string()).optional(),
        status: z.enum(["verified", "corrected", "conflict", "unverified"]),
        finding: z.string().optional(),
        origin: z.string().optional(), // where the claim came from (e.g. the uploaded spreadsheet)
        /** Set when the entry is about content the policy may hide (src/lib/policy.ts); hidden content's checks are hidden with it. */
        topic: z.enum(["legal_cases", "declared_assets", "relatives", "election_checks"]).optional(),
        checked: z.string(),
        sources: z.array(Source),
      }),
    )
    .optional(),
  /** Thematic overlays merged onto existing posts/bodies by id (legal history, tenure, HQ). */
  annotations: z
    .array(
      z.object({
        id: z.string(),
        history: z.array(HistoryEntry).optional(),
        tenure: Tenure.optional(),
        origin: Origin.optional(),
        hq: z.string().optional(),
        color: HexColor.optional(),
      }),
    )
    .optional(),
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
export type Relative = z.infer<typeof Relative>;
export type ElectionCheck = z.infer<typeof ElectionCheck>;
export type RelationType = z.infer<typeof RelationType>;
export type Law = z.infer<typeof Law>;
export type Jurisdiction = z.infer<typeof Jurisdiction>;
export type FieldAdministration = z.infer<typeof FieldAdministration>;
export type LegislatureSeats = z.infer<typeof LegislatureSeats>;
export type Tenure = z.infer<typeof Tenure>;
export type HistoryEntry = z.infer<typeof HistoryEntry>;
export type Origin = z.infer<typeof Origin>;
export type OfficialSite = z.infer<typeof OfficialSite>;
export type SiteLevel = z.infer<typeof SiteLevel>;
export type SiteCategory = z.infer<typeof SiteCategory>;
export type SiteStatus = z.infer<typeof SiteStatus>;

/** How a post is filled, in the categories of the platform brief (elected vs unelected by type). */
export type Selection = "elected" | "political" | "constitutional" | "judicial" | "military" | "civil_service" | "regulatory" | "statutory" | "ex_officio";
export type DataFile = z.infer<typeof DataFile>;

/** Compiled graph shipped to the browser (public/data/graph.json). */
export interface Graph {
  meta: {
    name: string;
    generated: string;
    data_as_of: string;
    counts: Record<string, number>;
    /** Added to the published graph by publicGraph() (src/lib/policy.ts). */
    licence?: { data: { id: string; name: string; url: string }; code: { id: string; name: string }; attribution: string };
  };
  jurisdictions: (Jurisdiction & { _file: string })[];
  organizations: (Organization & { _file: string; _origin: Origin })[];
  positions: (Position & { _file: string; _origin: Origin; _selection: Selection; _tenure?: Tenure })[];
  people: (Person & { _file: string })[];
  laws: (Law & { _file: string })[];
  verification: NonNullable<DataFile["verification"]>;
  /** Heads of the federal government by date (for "filed under which government"). */
  pm_terms: { person: string; since: string; until?: string; status: string }[];
  /** Family ties between officeholders (published only within the rules of docs/EDITORIAL_POLICY.md). */
  relatives: (Relative & { _file: string })[];
  /** Seats checked against the ECP's Form 45 and Form 47 (docs/EDITORIAL_POLICY.md § Elections). */
  election_checks: (ElectionCheck & { _file: string })[];
  /** Official government websites (data/official-sites.yaml). */
  official_sites: (OfficialSite & { _file: string })[];
  /** All edges: authored relations plus those derived from parents, appointments and roles. */
  edges: (Relation & { derived: boolean })[];
}
