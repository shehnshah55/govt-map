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

**Branches**: executive, legislative, judicial, constitutional (independent constitutional bodies), military, local.

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
| `field_administration` block | For each division: a `division` jurisdiction, *Office of the Commissioner* and *Commissioner*. For each district: a `district` jurisdiction, *District Administration* and *Deputy Commissioner* |

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
