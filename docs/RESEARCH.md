# Research: government graph models, and what Pakistan's needs

This note records what the Pakistan Government Graph borrows from existing models, and why.

> **Access note.** This research ran in a sandbox whose network policy blocked `graph.civlab.org`, `x.com`, `writing.civlab.org` and most news sites. The CivLab analysis below therefore draws on CivLab's published descriptions and press coverage of the US Gov Graph launch (IBTimes UK, Free Government Information, beSpacific, Maximum New York), not on a live crawl of the HHS page. Before the next iteration, compare the department page against the live site at <https://graph.civlab.org/us/departments/us-department-of-health-and-human-services>.

## 1. CivLab: US Gov Graph and SF Gov Graph

**Who and what.** CivLab (the Civilization Lab) is a San Francisco non-profit founded by Michael Adams. It first built the *SF Government Graph* (v1 in 2024, v2 in December 2024), described as "the first complete map of San Francisco's government". On 16 September 2026 Adams announced the *US Gov Graph* on X, calling it "a complete map of the people and positions of power in the federal government" and "Palantir for The People". The X post linked in the brief appears to be that announcement thread.

**Scale at launch.** 482 federal organisations: 343 executive-branch bodies, 103 independent agencies, 19 legislative and 17 judicial bodies, including 339 sub-agencies.

**Data model.** From CivLab's own description, "a complete data model of the United States federal government: entities, positions, people, and the legal relationships between them".

| Element | What CivLab records |
|---|---|
| Entity | Classification (department, agency, commission, committee…), description, official website, employee count, spending, **the legal source that enables it** |
| Position | The office, separate from its holder; how it is filled (e.g. Senate-confirmed); **vacancy** and **acting** status (at launch: 6 vacant seats, 86 officials acting and unconfirmed) |
| Person | Current holder of a position |
| Relationship | Typed edges such as *appoints* and *oversees*; confirmation lines for every official |
| News | Latest news per entity |
| Maintenance | "Agents monitor official sources to track every appointment, departure and structural change"; LLMs generate and maintain the graph |

**A department page** (e.g. HHS) combines a header with type and branch, a description, leadership positions with holders and appointment or confirmation method, sub-agencies, an interactive relationship graph, legal authority, spending and employees, and news.

**Lessons adopted here**

1. Separate **positions** from **people**. Posts outlive holders, and vacancies and acting arrangements only become visible once they are separate.
2. Give every entity a **legal source**. This is the single most valuable field.
3. Type the **relationships** (*appoints*, *oversees*…), not only the hierarchy.
4. Make **vacancy / acting** a first-class view.
5. Plan for **automated maintenance**, but keep a human-verifiable citation on every fact.

## 2. Other models studied

| Model | Country | What it does well | What we took |
|---|---|---|---|
| **Popolo / Open Civic Data** | International standard | Organization, Post, Person, Membership, Area: a shared vocabulary for civic data | Core ontology; a Popolo JSON export (`popolo.json`) |
| **GOV.UK organisations register and API** | UK | Every department, agency and non-departmental public body, typed, with parent and child links and closed or renamed status | Typed bodies (`kind`), parent links, `abolished` field for lineage |
| **Institute for Government, Whitehall Monitor** | UK | Tracks machinery-of-government changes, ministerial turnover, civil-service headcount | `successor_of` / `devolved_to` edges; turnover via dated tenures |
| **data.gov.uk organograms** | UK | Senior civil-service posts with grade and reporting line | BPS `grade` on posts; `administrative_head` role distinct from the political head |
| **GC InfoBase and GEDS** | Canada | Spending, staffing and results per organisation; an employee directory | `budget` and `employees` fields (schema ready, to be filled from budget documents) |
| **Australian Government Organisations Register (AGOR)** | Australia | Every body with type, portfolio, enabling legislation and governance structure | `legal_basis` with provision-level citations; portfolio = administrative `parent` |
| **Singapore Government Directory (SGDI)** | Singapore | Complete, current directory down to unit level | Deep sub-unit coverage for the flagship ministry |
| **Local Government Directory (LGD)** | India | Stable codes for every state, district, sub-district and local body | Generated, stable IDs for every division and district (`pk-pb-lahore`) |
| **EU Whoiswho** | EU | Institutional hierarchy with people and roles | Hierarchy plus post plus holder rendering |
| **Wikidata / EveryPolitician / OpenSanctions PEPs** | Global | Linked-data identifiers and politically exposed persons | IDs designed to be mapped to Wikidata QIDs later |
| **USAspending** | US | Spending by agency | Future work: link PSDP and budget lines to bodies |

### Models for elected and appointed officials

| Model | What it does well | What we took |
|---|---|---|
| **Open States / Open Civic Data** (US state legislatures) | People hold *roles* in a *jurisdiction*, and each role is tied to a *district*. At most one role is current; past roles are kept | Every legislative seat is a post with an `area` (constituency). Tenures with `since`/`until`. Past holders stay on record |
| **TheyWorkForYou and EveryPolitician** (mySociety, UK and global) | One page per representative and per constituency; a stable roster across terms | Constituency pages (`NA-122`) that link to the seat and its member; a full seat roster per house |
| **FAFEN Open Parliament Pakistan** (openparliament.pk) | Attendance and legislative-activity data for MNAs and MPAs, collected by observers and from Assembly records | Roster IDs use the ECP constituency codes FAFEN uses, so attendance and performance data can be joined later |
| **LittleSis** (power mapping) | People and organisations linked by typed relationships such as board seats, donations and party membership, drawn as power maps | Person → party `member_of` edges; party pages; the "who appoints whom" power map |
| **CivLab elected pages** | Every elected office, with confirmation lines and vacancies | Elected-officials page with coverage by chamber, and an officials register split into elected and appointed |
| **AGOR / GOV.UK type listings** | Browse every body of a given type, with the head and the enabling law | Directory pages for departments, regulators, agencies, courts and tribunals, legislatures, independent bodies, security, local government and parties |

## 3. What is specific to Pakistan

A copy of the US model would miss the features that define how Pakistan is governed. The model encodes them directly.

1. **Ministry → Division.** Under the Rules of Business 1973 a *Ministry* consists of one or more *Divisions*, and each Division is headed by a Federal Secretary (BS-22). Ministries and Divisions are separate node types. Some Divisions (Cabinet, Establishment, National Security) report straight to the Prime Minister.
2. **Devolution (18th Amendment, 2010).** Health, school education, agriculture, labour, population and social welfare became provincial. The graph records the abolished federal Ministry of Health, `devolved_to` edges to each provincial health department, the residual federal NHSR&C, and a **sector × government matrix** that shows who is responsible for what.
3. **Advice-bound appointments.** The President and Governors formally appoint but act on binding advice (Arts. 48, 105). Appointments record `by` *and* `on_advice_of`, and the chain of authority follows the advice, which is where the power sits.
4. **Parliamentary appointment committees.** The Chief Justice is nominated by a Special Parliamentary Committee (26th Amendment). The Chief Election Commissioner needs PM–Opposition Leader consultation and parliamentary-committee confirmation (Art. 213). These are modelled as `nominated_by`, `consultation` and `confirmation`.
5. **Civil-service postings.** Chief Secretaries and Inspectors General are federal (PAS/PSP) officers posted to provinces. Deputy Commissioners are posted by provincial governments. Method `posting` separates these bureaucratic appointments from political ones.
6. **Acting and additional charge.** These are common and tracked as tenure `status`.
7. **Intergovernmental forums.** The CCI, NEC, NFC and IMHPF have Chief Ministers and provincial ministers as members, so the graph has cross-level `member_of` edges.
8. **Field administration.** Divisions and districts, with Commissioners and Deputy Commissioners, run parallel to elected local government (Art. 140A), which differs by province and changes with each Local Government Act.
9. **Special territories.** Gilgit-Baltistan (GB Order 2018) and AJK (Interim Constitution 1974) have their own frameworks and are linked to the Federation through the Ministry of Kashmir Affairs and GB and the AJK Council.
10. **Civil–military institutions.** The armed forces, ISI, the SIFC and the 27th Amendment's Chief of Defence Forces are included with appointment chains, because any honest map of power in Pakistan needs them.
11. **Urdu names** are stored alongside English names (`name_ur`) and rendered in Nastaliq.
12. **Reserved seats.** 60 women's and 10 non-Muslim seats in the National Assembly, and their provincial equivalents, are filled from party lists, not constituencies. They are modelled as grouped seats (`seats: 32`, `seat_type: women`) with the ECP as notifying authority. Senate seats are grouped by province and category (general, women, technocrat/ulema, non-Muslim), because Senators are elected at large by each Assembly.
13. **Parties.** Parties pick most office-holders and fill reserved seats. The PTI's 2024 candidates ran as independents and later joined the Sunni Ittehad Council. Party affiliation is therefore a first-class, dated link and not a free-text label.
14. **Regulators by level.** Devolution created provincial regulators alongside the federal ones: healthcare commissions, food authorities, environmental protection agencies, procurement authorities, information commissions, and in Sindh an electricity regulator (SEPRA) next to NEPRA. The directory lists both levels side by side.

## 4. Roadmap

- **Verification pass** on every `confidence: medium/low` record against the Gazette, Cabinet Division notifications and Assembly websites.
- **Budget and staffing** from the Federal Budget "Details of Demands for Grants", provincial budget books and the PSDP.
- **Fill the seat roster** (the structure for all 1,000+ seats is in place) from the ECP's notified results, and map each constituency to its district from the 2023 delimitation.
- **Automated monitoring**, CivLab-style: agents watch Cabinet Division notifications, ECP gazettes, Establishment Division posting orders and court websites, and open pull requests with cited diffs.
- **Local government layer**: union, village and neighbourhood councils per province using ECP delimitation data.
- **Wikidata QIDs** on people and bodies for interlinking.
