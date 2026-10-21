# Data model

The schema lives in [`src/schema.ts`](../src/schema.ts) (zod). The YAML in `data/` is validated against it by `npm run validate`.

```
Jurisdiction ──parent──▶ Jurisdiction          (country ▸ province/territory ▸ division ▸ district)
Organization ──parent──▶ Organization          (part_of: the administrative hierarchy)
Organization ──jurisdiction──▶ Jurisdiction
Organization ──legal_basis──▶ Law (+ provision)
Position ──org──▶ Organization                 (head_of / seat_in)
Position ──appointment.by / on_advice_of / nominated_by / consultation / confirmation──▶ Position | Organization
Position ──ex_officio_of──▶ Position
Person ──roles[] (since, until, status)──▶ Position
Relation: any ──type──▶ any                     (authored edges with optional legal_basis)
```

## Records

| Collection | Key fields |
|---|---|
| `jurisdictions` | `id`, `name`, `name_ur`, `kind` (country, federal_capital, province, special_territory, division, district), `parent`, `capital`/`headquarters`, `local_government_law` |
| `organizations` | `id`, `name`, `short_name`, `name_ur`, `kind`, `branch`, `jurisdiction`, `parent`, `description`, `functions[]`, `sectors[]`, `established`, `abolished`, `legal_basis[]`, `website`, `employees`, `budget[]`, `sources[]`, `confidence` |
| `positions` | `id`, `title`, `org`, `role` (head, deputy, administrative_head, presiding_officer, chief_justice, judge, chief, officer, member), `grade` (BPS / rank), `seats`, `appointment{method, by, on_advice_of, nominated_by, consultation[], confirmation, term, removal, legal_basis[], notes}`, `ex_officio_of`, `vacant` |
| `people` | `id`, `name`, `name_ur`, `party`, `roles[{position, since, until, status, source}]`, `as_of`, `confidence` |
| `relations` | `from`, `to`, `type`, `description`, `legal_basis[]`, `confidence` |
| `laws` | `id`, `title`, `short`, `kind`, `year`, `jurisdiction`, `url`, `summary` |
| `legislature_seats` | `chamber`, `code` (NA, PP, PS, PK, PB, GBA, LA), `member_title`, `ranges[{from, to, area}]`, `reserved[{type, seats, area}]`, `legal_basis` |

Organizations may also set `head_title` (and `head_appointment`). The build then creates a `<id>-head` post unless a head post is authored.
Positions for legislative seats carry `area` (the constituency or province represented) and `seat_type` (general, women, non_muslim, technocrat).
`person.party` must be the ID of an organization of kind `political_party`; the build adds a `member_of` edge.

**Branches**: executive, legislative, judicial, constitutional (independent constitutional bodies), military, local, political (parties).

**Jurisdiction kinds**: country, federal_capital, province, special_territory, division, district, constituency.

**Appointment methods**: `direct_election`, `indirect_election`, `appointment`, `appointment_on_advice`, `selection`, `nomination`, `ex_officio`, `promotion`, `posting` (civil-service posting).

**Tenure status**: `confirmed`, `acting`, `additional_charge`, `caretaker`, `interim`.

**Relation types**: part_of, administrative_control, oversees, appoints, elects, nominates, confirms, advises, accountable_to, reports_to, audits, regulates, funds, coordinates_with, member_of, chairs, appeals_to, successor_of, devolved_to, established_by, holds, head_of, seat_in.

## Derived edges

The build adds edges so that authors only state each fact once:

- `part_of` from `organization.parent`
- `established_by` from `organization.legal_basis`
- `head_of` / `seat_in` from `position.org`
- `appoints` / `elects` from `appointment.by`, `advises` from `on_advice_of` and `consultation`, `nominates` from `nominated_by`, `confirms` from `confirmation`
- `holds` from each person's current roles and from `ex_officio_of`

Every edge in `graph.json` has `derived: true|false`.

## Conventions (generated records)

`scripts/compile.ts` generates records that follow fixed constitutional or administrative patterns. They are marked `generated: true` and labelled "Standard post" in the UI. Author the record explicitly (same `id`) to replace it.

| Pattern | Generated |
|---|---|
| Federal `ministry` | `<id>-minister`: Federal Minister, appointed by the President on the advice of the PM (Art. 92) |
| Federal `division`, or a ministry with no divisions | `<id>-secretary`: Federal Secretary (BS-22), posted by the PM on the Establishment Division's nomination |
| Provincial / territorial `department` | `<id>-minister` (Governor on the advice of the CM, Art. 132) and `<id>-secretary` (posted by the CM, nominated by S&GAD) |
| `legislature_seats` block | For each general seat: a `constituency` jurisdiction (`con-na-122`) and a seat post (`seat-na-122`), directly elected. For each reserved group: one post with `seats: N`, filled from party lists and notified by the ECP |
| Organization with `head_title` | `<id>-head` post with that title |
| `field_administration` block | For each division: a `division` jurisdiction, *Office of the Commissioner* and *Commissioner*. For each district: a `district` jurisdiction, *District Administration* and *Deputy Commissioner* |

Generated posts carry `generated: true`, and so do the division and district offices created from `field_administration` blocks. `npm run audit:coverage` uses the flag to report authored and generated records separately.

IDs are stable and predictable: `pk-pb-div-lahore`, `pk-pb-lahore`, `pk-pb-lahore-deputy-commissioner`.

## File-level defaults

A YAML file may declare `defaults.organizations` / `defaults.positions`, which are merged into every record of that collection in the file. Values on a record override the defaults.

## Confidence

- `high`: checked against the Constitution, a statute or an official website.
- `medium`: reliable public reporting; verify dates, names and exact structure.
- `low`: provisional.

## Integrity checks

`npm run validate` fails on schema violations, duplicate IDs across all collections, unknown or wrongly-typed references, and organization parent cycles. It warns when a single-seat post has more than one current holder.

## Outputs

- `public/data/graph.json`: everything the web app needs
- `public/data/export/*.csv`: organizations, positions, tenures, jurisdictions, laws, edges
- `public/data/export/popolo.json`: Popolo organizations, posts, persons, memberships, areas

## Classification (derived for every post and body)

| Field | Values | How it is set |
|---|---|---|
| `_origin` (what creates the office or body) | constitutional, statutory, executive, conventional, unrecorded | From the first instrument in `legal_basis` (Constitution or amendment → constitutional; Act, Ordinance or Order → statutory; Rules of Business or notification → executive; a law's `creates` overrides). Departments without a basis are executive; other bodies inherit their parent's origin. Can be overridden with `origin`. Posts use their appointment's legal basis, falling back to their body's origin. |
| `_selection` (how a post is filled: elected or unelected, by type) | elected, political, constitutional, judicial, military, civil_service, regulatory, statutory, ex_officio | From the appointment method, the body's branch and kind, and the appointing authority. For example, appointment at the PM's advice with no fixed term is `political`. |
| `_tenure` | fixed, age_limit, pleasure, coterminous, service, elected_term (+ years, age, renewable, extension_by, holdover) | Authored `tenure`, or derived: judges retire at 65 (SC, Art. 179) or 62 (HC, Art. 195); political appointees serve at pleasure; civil servants and military hold service postings; "N years" terms are fixed. |

## Legal lineage and tenure (`data/annotations/*.yaml`)

`annotations` merge fields onto existing posts or bodies by `id`: `history[{year, law, provision, change}]`, `tenure`, `origin`, `hq`, `color`. History entries create `established_by` edges, so each law page lists every office it created or changed.

## People: holdovers, extensions, backgrounds, assets

Role fields: `status` (confirmed, acting, additional_charge, caretaker, interim, holding_over), `term_ended`, `term_number`, `ends`, `extensions[{granted, to, by, law, notes}]`.
Person fields: `background[{service, rank, retired, notes}]`, used to flag retired or serving officers, judges and bureaucrats in other posts. `declared_assets[{amount_pkr, liabilities_pkr, as_of, basis, source, notes}]` records assets declared to the ECP, not audited net worth. The source must be an ECP publication: validation rejects any other host (`ASSET_SOURCE_HOSTS` in `src/lib/policy.ts`), and so does the CSV importer in `data/assets/`.

### Legal cases (`legal_cases`)

Criminal and accountability proceedings against a person, recorded only from reported court outcomes. Each entry:

| Field | Required | Meaning |
|---|---|---|
| `title` | yes | Name of the case or reference, e.g. "Avenfield reference (London flats)" |
| `filed` | yes | Date the case, reference or FIR was filed (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`) |
| `filed_by` | no | Agency that brought it: an organization id (`fed-nab`, `fed-fia`) or a name |
| `court` | no | Court or forum that heard it |
| `charges` | no | What was charged, in neutral wording (e.g. "Money laundering") |
| `status` | yes | Current status: `pending`, `convicted`, `convicted_on_appeal`, `acquitted`, `quashed`, `withdrawn`, `stayed` or `pardoned` |
| `verdict_date` | no | Date of the verdict, or of the order that set the current status |
| `sentence` | no | Sentence as handed down, including if later set aside |
| `fine` | no | Fine imposed, and whether it was paid, if reported |
| `custody` | no | Time actually spent in custody |
| `outcome` | no | One sentence on how the case stands now (acquittal, suspension, stay) |
| `sources` | yes, at least one | `{title, url, accessed}` for each source |

The UI shows the government in office when the case was filed: `filed` is matched against the Prime Minister's terms (`pm_terms`, derived from `fed-prime-minister` roles). The current status is shown alongside the charge, so acquittals, quashed and withdrawn cases are as visible as the original charge.

**Not published.** Following SS's §1.4 decision, `legal_cases` is removed from the built `graph.json` and from every export by `publicGraph()` in `src/lib/policy.ts` (`PUBLISH.legalCases = false`), until a lawyer has reviewed it. The build fails if any case would be published while the flag is off. The records stay in `data/` for review. Under the editorial policy (`docs/EDITORIAL_POLICY.md`), only proceedings evidenced by a court order, judgment or a court's own website may be published; the current entries cite press reports and must be re-sourced first.

## Family ties (`relatives`)

`relatives[{from, to, relation, sources, notes}]` records a family tie between two people, once per pair. `relation` is `parent`, `spouse`, `sibling`, `grandparent`, `uncle_or_aunt`, `cousin` or `in_law`, read as "`from` is the `relation` of `to`". The build enforces the editorial policy:

- both people must exist and hold or have held at least one public or party office (a role);
- `sources` must include an official (`.gov.pk`) source, or sources from at least two different outlets.

Minors and relatives without a public role are never recorded. Ties appear on the "Political families" page (`#/families`), on a tree for each family (`#/family/<person-id>`, generations from `generations()` in `src/lib/families.ts`) and in a "Family" section on each member's page, always with their sources.

## Form 45 / Form 47 checks (`data/elections/*.yaml`)

`election_checks[{seat, election, person, form47, form45, found_via, status, checked, notes}]` records a seat checked against the ECP's own result documents. Form 45 is the result of the count at each polling station; Form 47 is the provisional consolidated result for the constituency.

| Field | Meaning |
|---|---|
| `seat` | A directly elected seat (`seat-na-…`, `seat-pp-…`, …) |
| `election` | Polling date, e.g. `2024-02-08` |
| `person` | The person Form 47 declared the winner; they must hold or have held the seat |
| `form47` | `{winner: {name, party, votes}, source}`; the source must be an ECP publication |
| `form45` | `{leader, declared_winner, polling_stations, of_polling_stations, sources}`: the highest Form 45 total, the declared winner's Form 45 total, how many polling stations' Form 45s were counted, and the ECP documents |
| `found_via` | Party or observer compilations that led to the seat. They are never the evidence |
| `status` | `differs`, `matches` or `under_review` |

The build enforces the rules of the editorial policy: ECP sources only; `differs` only when the Form 45 leader is someone else with more votes, counted from the Form 45s of **every** polling station; `matches` only when the figures agree. A person with a `differs` check on a seat they still hold is labelled "not legally elected" on their page and on the seat's page, always beside the figures and links to the documents. Whether labels are published is `PUBLISH.form45Labels` in `src/lib/policy.ts`.

## How chosen: "Not directly elected"

Derived, not authored (`src/lib/elections.ts`). A person is tagged when either:

- they hold a seat voters don't fill directly: a Senate seat, or a reserved, technocrat or non-Muslim seat. Nobody can sit in two houses at once (Art. 223), so they hold no directly elected seat; or
- `non_member: {as_of, source}` on their record cites a source saying they are not a member of any legislature, and they hold a political office (minister, adviser, special assistant).

A minister whose seat is simply not recorded is **not** tagged. The person's page lists each office with how it was filled.

## Chamber composition

`organization.composition{as_of, total, parties[{party, seats, side: treasury|opposition|other}], sources}` drives the seating charts. `party` is a party id, or `independent` / `other`. The build warns if seats do not sum to `total`.

## Verification log (`data/verification.yaml`)

Each entry records `{claim, records[], status: verified|corrected|conflict|unverified, finding, origin, topic, checked, sources[]}`. `topic` (`legal_cases`, `declared_assets` or `relatives`) marks entries about content the policy can hide; an entry whose topic is hidden is left out of the public build too. It is shown in the app's Verification page. Claims from outside datasets, such as the uploaded spreadsheet, carry `origin`.
