# Pakistan Government Graph

An open, source-cited map of **Pakistan's government at every level**: the Federation, Parliament and superior courts; ministries and their Divisions; regulators and state enterprises; the four provinces, Islamabad, Gilgit-Baltistan and AJK; and every division and district with its Commissioner and Deputy Commissioner. It records the posts that lead each body, the people in them, and the constitutional article or statute behind every link.

It follows CivLab's [US Gov Graph](https://graph.civlab.org/us) (entities, positions, people and the legal relationships between them) and adapts it to how Pakistan is governed: Ministry → Division structure, 18th-Amendment devolution, advice-bound appointments, parliamentary appointment committees, civil-service postings, acting and additional-charge officials, and intergovernmental forums like the CCI and NFC.

**Flagship page:** the Ministry of National Health Services, Regulations and Coordination (route `#/org/fed-min-nhsrc`), Pakistan's counterpart to the US Department of Health and Human Services. It is modelled down to DRAP, PMDC, NIH, the polio EOC, Sehat Sahulat and the Islamabad hospitals, and linked to all four provincial health departments.

## At a glance

| | |
|---|---|
| Government bodies | ~700 (≈490 authored + generated field administration) |
| Posts | ~700, each with appointment method, appointing authority and legal basis |
| Jurisdictions | Country, 4 provinces, ICT, GB, AJK, 38 divisions, 167 districts |
| Laws cited | ~70 (Constitution articles, amendments, Rules of Business, statutes) |
| Connections | ~3,400 typed edges |

## Features

- **Department pages** (like CivLab's department pages): leadership with holders and how they were appointed; the **chain of authority** traced back to voters or the Constitution; sub-bodies grouped by type; an interactive structure or connections graph; typed relationships; legal basis; sources; a confidence rating for each record.
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
