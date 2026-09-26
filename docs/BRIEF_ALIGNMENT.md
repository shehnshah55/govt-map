# Alignment with the platform brief

This maps the uploaded *Government of Pakistan Interactive Platform & Map* brief and its companion workbook (*Pakistan_Government_Structure_and_Officials.xlsx*) to what the platform implements.

## Data (workbook tabs → graph)

| Workbook | Here | Notes |
|---|---|---|
| Institutions & Branches (47 rows) | `organizations` (~790) | All 47 are covered, with parent links and legal basis. Workbook HQ cities were verified before being added as `hq`. |
| Positions & Hierarchy (30 rows) | `positions` (~1,800) | The workbook's *Classification* column is our `_selection`. *Appointment Authority* and *Selection Method* are the structured `appointment` (by / on advice of / nominated by / consultation / confirmation). Added from the workbook: Minister of State, Adviser (Art. 93), SAPM and Principal Secretary to the PM. |
| Key Incumbents (18 rows) | `people` (~120) | Every incumbent was re-verified; see `data/verification.yaml`. Corrected: CJCSC (office abolished November 2025), KP Chief Minister (Sohail Afridi since October 2025), COAS (now also CDF, term to 2030), NAB appointment authority, PCAA's founding law. |

## Taxonomy (brief §3)

All eight domains are present: federal executive, legislature, judiciary, armed forces and security, inter-provincial and constitutional bodies, independent oversight, sectoral regulators, and provincial and field administration. Parties, local government, tribunals and professional bodies are added on top.

## UX (brief §4)

| Brief | Implementation |
|---|---|
| Sticky header, universal search | Sticky top bar; search covers bodies, posts, people, constituencies (`NA-122`) and laws |
| Toggles: Elected vs Unelected, Federal vs Provincial | *Officials* and *Directory* filters: Elected / Unelected / by type, Government, Created by |
| Summary metric cards | Home, Accountability and Verification stat rows |
| Collapsible hierarchy tree | *Tree* page: Government → body → sub-bodies → posts and holders, with tags |
| Geographic power map | *Map* page: HQs by city on a schematic outline (offline, no tile server) |
| Detail flyout drawer | Clicking a graph node opens a drawer with tags, holders, appointment and link to the full page |
| Palette | Navy #1B365D (constitutional), Pakistan green #006633 (elected), slate #4A6572 (civil service / executive order), burgundy #800020 (judiciary), gold #D4AF37 (regulators); plus olive (military), purple (political appointee) and teal (statutory) for categories the brief does not colour. Light and dark variants. |

## Verification checklist (brief §6)

- **Hierarchy integrity**: `npm run validate` rejects unknown parents and parent cycles.
- **26th Amendment**: recorded in the legal history of the CJP, SC judges, High Court judges, the Judicial Commission, the new Special Parliamentary Committee and the CEC. The 27th Amendment (Federal Constitutional Court, CDF, CJCSC abolished) is also recorded.
- **Dual roles**: ministers who are MNAs or Senators hold both roles; *Accountability → People holding several offices at once* lists them.
- **Geographic validity**: city coordinates are fixed in `src/views/insight.ts` for Islamabad, Rawalpindi, Lahore, Karachi, Peshawar, Quetta, Gilgit, Muzaffarabad and Gwadar.

## Not adopted

- **Next.js / Mapbox / Looker Studio**: the platform ships as a static site (plus a single-file build) so it runs without a server, API keys or tile hosting. The JSON, CSV and Popolo exports can feed Looker Studio directly.
- **Incumbent photos**: not included, because of image rights.
