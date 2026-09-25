# Pakistan Government Graph

An open, source-cited map of **Pakistan's government at every level**: the Federation, Parliament and superior courts; ministries and their Divisions; regulators and state enterprises; the four provinces, Islamabad, Gilgit-Baltistan and AJK; and every division and district with its Commissioner and Deputy Commissioner. It records the posts that lead each body, the people in them, and the constitutional article or statute behind every link.

It follows CivLab's [US Gov Graph](https://graph.civlab.org/us) (entities, positions, people and the legal relationships between them) and adapts it to how Pakistan is governed: Ministry → Division structure, 18th-Amendment devolution, advice-bound appointments, parliamentary appointment committees, civil-service postings, acting and additional-charge officials, and intergovernmental forums like the CCI and NFC.

**Flagship page:** the Ministry of National Health Services, Regulations and Coordination (route `#/org/fed-min-nhsrc`), Pakistan's counterpart to the US Department of Health and Human Services. It is modelled down to DRAP, PMDC, NIH, the polio EOC, Sehat Sahulat and the Islamabad hospitals, and linked to all four provincial health departments.

## At a glance

| | |
|---|---|
| Government bodies | ~780: ministries and departments, ~70 regulators and professional bodies, courts and tribunals, agencies, local governments, 16 political parties |
| Posts | ~1,780, including every elected seat: all 336 NA, 96 Senate, 749 provincial and 86 GB/AJK seats. Each post has its appointment method, appointing authority and legal basis |
| Jurisdictions | Country, 4 provinces, ICT, GB, AJK, 38 divisions, 167 districts, 859 constituencies |
| Officeholders | ~120 elected and appointed officials, dated and confidence-rated (checked against 2026 reporting where possible) |
| Laws cited | ~125 (Constitution articles, amendments, Rules of Business, statutes) |
| Connections | ~5,900 typed edges |

## Features

- **Department pages** (like CivLab's department pages): leadership with holders and how they were appointed; the **chain of authority** traced back to voters or the Constitution; sub-bodies grouped by type; an interactive structure or connections graph; typed relationships; legal basis; sources; a confidence rating for each record.
- **Directory by type**: ministries and departments, regulators, agencies and enterprises, courts and tribunals, legislatures, independent bodies, security, local government and parties. Every government is shown side by side, with each body's head and legal basis.
- **Elected officials**: every legislature's seats and recorded members by party, every office filled by election, and a seat roster searchable by constituency code (e.g. `NA-122`).
- **Officials register**: appointed and elected officeholders with how they were chosen, since when, and how current the record is.
- **Classification tags on every post and body**: what created it (constitutional, statutory, executive order), how it is filled (elected, political appointee, constitutional appointee, judiciary, military, civil service, regulatory, statutory, ex officio), and its tenure (fixed term, until age, at pleasure, coterminous). Each also links to the latest amendment or statute that changed it.
- **Legal history**: a dated timeline for key offices (e.g. CJP: 18th → 19th → 26th Amendment; COAS: 8th → 13th → Army Act 2020/2024 → 27th), drillable to each law. Law pages list every office the law created or changed.
- **Parliament in session**: seating charts of the National Assembly and Senate, with treasury benches vs opposition by party and named members ringed with their constituency and offices.
- **Who appoints whom**: the Army chief, judges, regulators, the CEC, governors, secretaries and others, with appointer, binding advice, nomination, confirmation, tenure and extension rules.
- **Holdovers, extensions and backgrounds**: officials holding over after their term, extended or repeat terms, retired or serving generals, judges and bureaucrats in civilian posts, concurrent offices, and declared assets with sources.
- **Tree, map, drawer**: a collapsible tree of the state, headquarters by city, and a detail drawer when clicking graph nodes, as the platform brief specifies (see docs/BRIEF_ALIGNMENT.md).
- **Verification log**: every fact check, correction and open conflict, with sources.
- **Power map**: who appoints, elects, nominates or confirms each office, per government.
- **Sectors × governments matrix**: after devolution, see which government runs what (e.g. *Health in every government*).
- **Accountability**: acting and additional-charge officials, vacancies, key posts with no recorded holder, and records that need verification.
- **Place pages**: province → division → district, with Deputy Commissioners and governing bodies.
- **Law pages**: every body and post a statute or constitutional article creates.
- **Search** across bodies, posts, people, places and laws (press `/`). Urdu names in Nastaliq. Light and dark themes.
- **Open data**: `graph.json`, CSVs, and a [Popolo](https://www.popoloproject.com/) export.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run validate     # check data integrity
npm test
npm run build        # static site in dist/
npm run build:single # one self-contained HTML file in dist-single/
```

## Project layout

```
data/                 hand-authored YAML (source of truth)
scripts/compile.ts    validation, conventions, derived edges
scripts/build-data.ts writes public/data/graph.json and exports
src/schema.ts         the data model (zod)
src/lib/              graph index and queries
src/views/, src/ui/   the web app (TypeScript, Cytoscape.js)
docs/RESEARCH.md      CivLab and other government-graph models, and Pakistan-specific design
docs/DATA_MODEL.md    schema, conventions, integrity rules
```

## Data status

Structural records cite primary law. **Officeholder records were compiled from public reporting up to late 2025.** Each carries an `as_of` date and a confidence level, and many are marked *Verify*. Check them against official sources before relying on them, and see [CONTRIBUTING.md](CONTRIBUTING.md) to help.

## Licence

MIT (code). Data is released for public use; please attribute "Pakistan Government Graph".
