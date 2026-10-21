# Design

The Pakistan Government Graph is an independent civic-education map of Pakistan's government, built from publicly available official sources. This note records the main design choices behind its data model. The schema itself is in [DATA_MODEL.md](DATA_MODEL.md), and the rules for sources and sensitive content are in [EDITORIAL_POLICY.md](EDITORIAL_POLICY.md).

## Core choices

1. **Posts are separate from people.** Offices outlive their holders, so vacancies, acting arrangements and additional charge are visible.
2. **Every body and post carries its legal basis**: the constitutional article, statute or order that creates it, at provision level where known.
3. **Relationships are typed** (*appoints*, *oversees*, *accountable to*, *devolved to*…), not only a hierarchy.
4. **Every fact cites a source** with the date it was checked, so any record can be traced back and corrected.
5. **Stable identifiers** for every body, post and place (for example `pk-pb-lahore`), so links and downloads keep working as records change.

## Open standards

- **Popolo / Open Civic Data**: Organization, Post, Person and Membership. The `popolo.json` export uses this vocabulary.
- **ECP constituency codes** (for example `NA-122`) identify legislative seats, so other public data about seats can be joined.
- Identifiers are designed so they can later be mapped to Wikidata QIDs.

## How Pakistan is governed, and how the model records it

The data model encodes the features that define how Pakistan is governed directly, rather than fitting them to a generic template.

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

## Planned work

- **Verification pass** on every `confidence: medium/low` record against the Gazette, Cabinet Division notifications and Assembly websites.
- **Budget and staffing** from the Federal Budget "Details of Demands for Grants", provincial budget books and the PSDP.
- **Fill the seat roster** (the structure for all 1,000+ seats is in place) from the ECP's notified results, and map each constituency to its district from the 2023 delimitation.
- **Automated monitoring** of Cabinet Division notifications, ECP gazettes, Establishment Division posting orders and court websites, proposing cited changes for a person to review (design in `docs/MONITORING.md`).
- **Local government layer**: union, village and neighbourhood councils per province using ECP delimitation data.
- **Wikidata QIDs** on people and bodies for interlinking.
