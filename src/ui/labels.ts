import type { Branch, OrgKind, RelationType, Sector } from "../schema.ts";

export const BRANCH_LABEL: Record<Branch, string> = {
  executive: "Executive",
  legislative: "Legislative",
  judicial: "Judicial",
  constitutional: "Independent constitutional",
  military: "Armed forces",
  local: "Local government",
  political: "Political party",
};

export const KIND_LABEL: Record<OrgKind, string> = {
  state: "Government",
  head_of_state_office: "Office of the head",
  cabinet: "Cabinet",
  ministry: "Ministry",
  division: "Division",
  department: "Department",
  attached_department: "Attached department",
  autonomous_body: "Autonomous body",
  regulator: "Regulator",
  statutory_council: "Statutory council",
  commission: "Commission",
  corporation: "State enterprise",
  programme: "National programme",
  hospital: "Hospital",
  university: "University",
  research_institute: "Institute",
  intergovernmental_forum: "Intergovernmental forum",
  legislature: "Legislature",
  chamber: "House of Parliament",
  committee: "Committee",
  secretariat: "Secretariat",
  court: "Court",
  tribunal: "Tribunal",
  judicial_council: "Judicial council",
  ombudsman: "Ombudsman",
  law_enforcement: "Law enforcement",
  intelligence: "Intelligence agency",
  armed_service: "Armed service",
  military_hq: "Military headquarters",
  field_administration: "Field administration",
  local_government: "Local government",
  constitutional_body: "Constitutional body",
  political_party: "Political party",
  professional_body: "Professional body",
  other: "Body",
};

/** Plural group headings for sub-organization lists, in display order. */
export const KIND_GROUP: [OrgKind[], string][] = [
  [["ministry", "division"], "Ministries and divisions"],
  [["department"], "Departments"],
  [["regulator", "statutory_council", "professional_body"], "Regulators, statutory councils and professional bodies"],
  [["attached_department"], "Attached departments"],
  [["autonomous_body", "corporation"], "Autonomous bodies and state enterprises"],
  [["programme"], "Programmes"],
  [["research_institute", "university", "hospital"], "Institutes, universities and hospitals"],
  [["chamber", "legislature", "committee", "secretariat"], "Houses, committees and secretariats"],
  [["court", "tribunal", "judicial_council"], "Courts and judicial bodies"],
  [["law_enforcement", "intelligence", "armed_service", "military_hq"], "Security and armed forces"],
  [["commission", "constitutional_body", "ombudsman", "intergovernmental_forum"], "Commissions and forums"],
  [["field_administration", "local_government"], "Field administration and local government"],
  [["political_party"], "Political parties"],
  [["state", "head_of_state_office", "cabinet", "other"], "Other bodies"],
];

export const SECTOR_LABEL: Record<Sector, string> = {
  health: "Health",
  education: "Education",
  finance: "Finance",
  revenue: "Revenue and tax",
  planning: "Planning and development",
  interior: "Interior and security",
  law: "Law",
  justice: "Justice",
  defence: "Defence",
  foreign: "Foreign affairs",
  energy: "Energy",
  water: "Water",
  agriculture: "Agriculture and food",
  industry: "Industry",
  commerce: "Trade and investment",
  communications: "Communications",
  transport: "Transport",
  it_telecom: "IT and telecom",
  information: "Information and media",
  social_protection: "Social protection",
  environment: "Environment and climate",
  local_government: "Local government",
  elections: "Elections",
  accountability: "Accountability and audit",
  civil_service: "Civil service",
  religious_affairs: "Religious affairs",
  housing: "Housing and works",
  culture: "Culture and sport",
  science: "Science and technology",
  human_rights: "Human rights",
  labour: "Labour and overseas workers",
  population: "Population",
  disaster: "Disaster management",
  governance: "Governance",
};

/** How an edge reads in a sentence: [from] ___ [to]. */
export const REL_PHRASE: Record<RelationType, [outgoing: string, incoming: string]> = {
  part_of: ["is part of", "includes"],
  administrative_control: ["is administratively controlled by", "administratively controls"],
  oversees: ["oversees", "is overseen by"],
  appoints: ["appoints", "is appointed by"],
  elects: ["elects", "is elected by"],
  nominates: ["nominates", "is nominated by"],
  confirms: ["confirms", "is confirmed by"],
  advises: ["advises on", "acts on advice of"],
  accountable_to: ["is accountable to", "holds to account"],
  reports_to: ["reports to", "receives reports from"],
  audits: ["audits", "is audited by"],
  regulates: ["regulates", "is regulated by"],
  funds: ["funds", "is funded by"],
  coordinates_with: ["coordinates with", "coordinates with"],
  member_of: ["is a member of", "has as a member"],
  chairs: ["chairs", "is chaired by"],
  appeals_to: ["appeals lie to", "hears appeals from"],
  successor_of: ["succeeded", "was succeeded by"],
  devolved_to: ["devolved functions to", "received functions from"],
  established_by: ["is established by", "establishes"],
  holds: ["holds", "is held by"],
  head_of: ["heads", "is headed by"],
  seat_in: ["is a seat in", "has seats"],
};

export const METHOD_LABEL: Record<string, string> = {
  direct_election: "Directly elected",
  indirect_election: "Indirectly elected",
  appointment: "Appointed",
  appointment_on_advice: "Appointed on advice",
  selection: "Selected",
  nomination: "Nominated",
  ex_officio: "Ex officio",
  promotion: "Promoted",
  posting: "Civil-service posting",
};

export const STATUS_LABEL = {
  filled: "Filled",
  acting: "Acting / additional charge",
  vacant: "Vacant",
  unknown: "Holder not recorded",
  multi: "Multi-seat",
} as const;

export const CONFIDENCE_NOTE = {
  high: "Checked against the constitutional or statutory text or the official website.",
  medium: "From reliable public reporting; details (dates, names, exact structure) should be verified.",
  low: "Provisional. Needs verification before use.",
} as const;

/** How a post is filled: the elected / unelected taxonomy. */
export const SELECTION_LABEL = {
  elected: "Elected",
  political: "Political appointee",
  constitutional: "Constitutional appointee",
  judicial: "Judiciary",
  military: "Military",
  civil_service: "Civil service",
  regulatory: "Regulatory appointee",
  statutory: "Statutory appointee",
  ex_officio: "Ex officio",
} as const;

export const SELECTION_HELP = {
  elected: "Chosen by voters or by an elected house.",
  political: "Chosen at the discretion of the head of government; serves at pleasure and leaves with the government.",
  constitutional: "Appointed through a procedure fixed in the Constitution, usually with a protected term.",
  judicial: "Superior-court judge appointed through the Judicial Commission.",
  military: "Serving or senior military officer.",
  civil_service: "Career civil servant posted by the government.",
  regulatory: "Head or member of a statutory regulator.",
  statutory: "Appointed under an Act or Ordinance.",
  ex_officio: "Held automatically by the holder of another office.",
} as const;

/** What creates the office or body. */
export const ORIGIN_LABEL = {
  constitutional: "Constitutional",
  statutory: "Statutory",
  executive: "Executive order",
  conventional: "Convention",
  unrecorded: "Basis not recorded",
} as const;

export const ORIGIN_HELP = {
  constitutional: "Created or required by the Constitution; only a constitutional amendment (two-thirds of each House) can abolish it.",
  statutory: "Created by an Act of Parliament, an Assembly or an Ordinance; can be changed by ordinary legislation.",
  executive: "Created by the Rules of Business or a government notification; the executive can change it without legislation.",
  conventional: "Not codified in law; exists by practice.",
  unrecorded: "The instrument that created this body has not yet been added to the data.",
} as const;

export function tenureLabel(t: { kind: string; years?: number; age?: number; renewable?: string; holdover?: boolean } | undefined): string {
  if (!t) return "";
  switch (t.kind) {
    case "fixed":
      return `${t.years}-year term${t.renewable === "once" ? ", renewable once" : t.renewable === "extendable" ? ", extendable" : t.renewable === "yes" ? ", renewable" : ""}${t.holdover ? ", holds over" : ""}`;
    case "age_limit":
      return `Until age ${t.age}`;
    case "pleasure":
      return "At pleasure (discretionary)";
    case "coterminous":
      return "Coterminous";
    case "service":
      return "Service posting";
    case "elected_term":
      return t.years ? `${t.years}-year elected term${t.renewable === "once" ? ", max. two" : ""}` : "Elected term";
  }
  return t.kind;
}
