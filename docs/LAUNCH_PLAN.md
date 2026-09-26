# Launch plan: taking the Pakistan Government Graph public

**Audience:** Claude Code, working in this repository.
**Owner:** SS (repo `shehnshah55/govt-map`).
**Goal:** Make every recommendation from the September 2026 review real, in a way that is efficient, secure and independently verified, so that SS can decide whether to make the repository and site public.

Read this whole file before starting. It has four parts: operating rules (§0), questions to ask up front (§1), the phases (§2–§9), and the final launch checklist (§10). When a phase instruction conflicts with the operating rules, the operating rules win.

---

## §0 Operating rules (apply to every phase)

### 0.1 Workflow

1. **One branch and one pull request per phase**, named `launch/phase-N-<slug>`. Never push to `main`. Never force-push a branch someone else has reviewed.
2. **Gates.** No PR is opened until `npm run validate`, `npm test`, `npm run typecheck` and `npm run build` all pass locally. CI must also pass. If a gate fails, fix the cause. Never weaken a test, schema rule or validator to get a pass.
3. **Stop after each PR** and give SS a summary (template in §0.6). Only start the next phase once SS says to, unless SS has said to run several phases back to back. §3 (policy) is a hard stop because it needs SS's decisions.
4. **Keep the log.** Append one entry per working session to `docs/LAUNCH_LOG.md`: date, phase, what changed, what was verified, what is still open. This is the audit trail for going public.
5. **Use the task list.** Create a task list for each phase from its checklist and tick items off as they finish.
6. **Size.** Keep each PR reviewable: under about 2,000 changed YAML lines, or split it (for example 3a-NA, 3a-Senate, 3a-Punjab…).

### 0.2 The data standard (non-negotiable)

These rules exist because the whole value of the project is that every fact can be checked.

1. **No fact from memory.** Every new or changed fact (a name, date, office, legal provision, number, URL) must come from a source you actually fetched in this session. Your training data is not a source. If you "know" something but cannot fetch a source for it, do not add it. Leave the field empty and list it in the log as `unverified — needs source`.
2. **Source hierarchy.** Use the highest level available:
   1. Primary law and official records: Constitution, Pakistan Code and provincial codes, Gazette of Pakistan, ECP notifications and Form-47 results, Cabinet Division, Establishment Division and provincial S&GAD notifications, Assembly and Senate websites, court websites and judgments, official body websites.
   2. State media reporting an official notification (APP, Radio Pakistan, PTV), with the notification number if given.
   3. Reputable independent press (Dawn, The Express Tribune, The News, Business Recorder, Geo, Aaj), used for dates and context.
   4. Wikipedia: **never** as a source. You may use it only to find a primary source, then cite that source.
3. **People and office-holding.** Who holds a post needs one level-1 source, or two independent level-2/3 sources that agree. Set `confidence: high` only for level 1. Set `medium` for two press sources. Otherwise don't add it.
4. **Record provenance.** Every `source` gets `title`, `url` and `accessed` (YYYY-MM-DD). Every person record you touch gets an updated `as_of`.
5. **Conflicts.** When sources disagree, don't pick one silently. Add a `verification.yaml` entry with `status: conflict`, cite both, and use the more authoritative one in the data.
6. **Unreachable sources.** If a government site is down or blocked by the network, say so in the log and move on. Don't substitute a weaker source without labelling the confidence to match, and don't guess.
7. **Bulk data goes through scripts, not hand-typing.** For large lists (assembly members, DCs, law URLs), write an ingestion script in `scripts/ingest/` that fetches or parses the official list into a staging CSV in `scripts/ingest/staging/` (gitignored). Then run a merge script that writes YAML and prints a diff summary. This is both faster and less error-prone than typing records one by one. Keep the scripts in the repo so the ingestion can be repeated.
8. **Neutral wording.** Descriptions state what a body or law does, not whether it is good. No adjectives about people.

### 0.3 Independent verification (the "second pair of eyes")

After each data phase (§4, §5, §6), and before opening the PR, launch a **fresh subagent that has not seen your work**. Give it only the list of changed record IDs and this instruction:

> For a random sample of these records (at least 30, or 10% if larger; 100% of any `legal_cases`, `declared_assets` or `relative_of` records), fetch each cited source and check that it supports the exact claim: name spelling, office, dates and numbers. Report each record as `supported`, `partially supported` (say what differs) or `not supported`. Do not fix anything.

- If more than 5% of the sample is `not supported`, the PR is blocked. Fix the ingestion, re-verify everything from that source, and run a new sample.
- Record the result (sample size, pass rate, failures and fixes) in the PR description and in `verification.yaml`.

### 0.4 Security rules

- Never commit secrets, tokens, `.env` files, personal contact details or source spreadsheets SS has shared privately. Check with `git diff --cached` before every commit.
- Don't add runtime calls to third-party services from the site. All data is fetched at **build time or ingestion time**. The published site stays static.
- Don't add new npm dependencies unless the phase needs them. When you do, state why in the PR, prefer well-maintained packages, and commit the lockfile.
- **Never change repository visibility, branch protection, Pages settings or secrets yourself.** Those steps are for SS; list them in §10.

### 0.5 Efficiency

- **Parallelise the research, not the verification.** In §4 it's fine to use one subagent per province or legislature to gather sources and fill staging CSVs, as long as each writes to its own staging file. Merging into YAML is done by you in the main session. Verification always uses a fresh agent (§0.3).
- Fetch an official list page once and parse it, rather than searching for each person.
- Reuse existing IDs and conventions (see `docs/DATA_MODEL.md`). Don't restructure what already works.

### 0.6 PR summary template

```
## Phase N: <name>
What changed: <bullets>
Coverage delta: <numbers from npm run audit:coverage, before → after>
Verification: <sample size, pass rate, failures and fixes>
Security: <anything relevant, or "no security-relevant changes">
Open items / unverified: <list>
Needs SS decision: <list or "none">
```

---

## §1 Questions to ask SS once, before Phase 0

Ask all of these in a single message and record the answers in `docs/LAUNCH_LOG.md`. Don't start §3 until they are answered. You may start §2–§3 prerequisites (Phases 0 and 1) while waiting.

1. **Publisher name** for attribution and the licence (a person, or a project or organisation name?).
2. **Corrections contact**: a dedicated email address for corrections and legal notices (recommend a project address, not a personal one).
3. **Custom domain**: yes (which?) or GitHub Pages default?
4. **Legal cases at launch**: (a) remove the `legal_cases` field from the public site until after legal review, (b) keep it, sourced to court records only, or (c) keep it as it is. Recommended: (a) or (b).
5. **Declared assets at launch**: keep, sourced to ECP publications only (recommended), or hide until later?
6. **Family ties (`relative_of`)**: include at launch under the policy in §3.3, or defer?
7. **Urdu interface**: Urdu names only (current), or a full Urdu interface toggle (larger job, §7.9)?

### §1 answers from SS (26 September 2026)

| # | Question | Answer |
|---|---|---|
| 1 | Publisher name | **Pending**: ask SS |
| 2 | Corrections contact | **Pending**: ask SS |
| 3 | Web address | GitHub Pages default address for now |
| 4 | Legal cases at launch | **Pending**: ask SS. Until answered, treat as (a): hidden from the public build |
| 5 | Declared assets | Keep, sourced to ECP publications only |
| 6 | Family ties | Include, with a family **tree / map** view (§6 and §7.15) |
| 7 | Urdu | Names in Urdu and English only; no full Urdu interface (skip §7.9) |

SS also asked for **analytics and infographics on the landing page** (see §7.14).

---

## §2 Phase 0: Baseline, honest numbers

Branch: `launch/phase-0-baseline`

- [ ] Run all gates on a clean checkout and record the results in the log.
- [ ] Add `scripts/audit-coverage.ts` and an `npm run audit:coverage` script. It writes `docs/COVERAGE.md` with, at minimum:
  - organisations: authored vs generated; % with `legal_basis`, `sources`, `website`, `description`, `established`, `name_ur`, `budget`, `employees`
  - posts: authored vs generated; % of **single-seat** posts with a current holder, broken down by government and by kind (ministers, secretaries, CS, IG, DCs, commissioners, heads of regulators, judges, assembly seats)
  - people: total; % with a source on the current role; `as_of` age buckets (<90 days, 90–180, >180); confidence mix
  - laws: % with URL, % with summary
  - sources: count by domain and by level (§0.2.2)
- [ ] Make the README's "At a glance" table use these numbers, and separate *authored* from *generated*. Add a row: "posts with a known current holder". Remove the contradiction between "compiled up to late 2025" and the 2026 `as_of` dates. Say exactly what date range the data covers.
- [ ] Add a CI step that runs `audit:coverage` and fails if `docs/COVERAGE.md` is out of date (so the numbers can't drift from the data).
- [ ] Document the `legal_cases` field in `docs/DATA_MODEL.md`. It exists in the schema but isn't documented.

---

## §3 Phase 1: Security hardening

Branch: `launch/phase-1-security`. Do this before any public exposure.

### 3.1 Code

- [ ] **URL scheme allowlist.** `Source.url` uses `z.string().url()`, which accepts `javascript:` and `data:` URLs. Those are then rendered into `href`. Replace every URL field in `src/schema.ts` (sources, websites, law URLs, asset sources, CSV source URLs) with a shared validator that allows only `https:` (and `http:` only for a listed set of government domains that lack TLS). Add tests showing that `javascript:alert(1)`, `data:text/html,…` and `JaVaScRiPt:` are rejected.
- [ ] **Audit every `raw()` call** (`src/ui/hemicycle.ts`, `src/views/insight.ts`, `src/views/common.ts`, `src/main.ts`). Where a value from the data goes into `raw()`, for example party colours into `style="background:…"`, validate it in the schema (for colours: `^#[0-9a-fA-F]{6}$`) or escape it. Add a comment on each remaining `raw()` saying why it is safe.
- [ ] Add a test that renders every page type from a fixture whose text fields contain `<script>`, `"><img onerror>` and similar, and asserts they come out escaped.
- [ ] **Content-Security-Policy** via a `<meta http-equiv>` in `index.html` (GitHub Pages can't set headers): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'`. Check that the dev build, the production build and the single-file build all still work. If the single-file build needs inline scripts, give it its own CSP using a hash, not `'unsafe-inline'`.
- [ ] Add `rel="noopener noreferrer"` to every external link (some have only `noopener`).
- [ ] Self-host fonts (the Nastaliq font especially) rather than loading them from a CDN, if any are loaded from outside.

### 3.2 Supply chain and CI

- [ ] Pin every GitHub Action to a full commit SHA (with the version in a comment).
- [ ] Give each workflow the least `permissions` it needs (`contents: read` by default).
- [ ] Add `npm audit --audit-level=high` to CI. Fix or document any findings.
- [ ] Add `.github/dependabot.yml` (npm and github-actions, weekly, grouped).
- [ ] Run a secret scan over the **full** history (`gitleaks detect` or equivalent; deepen the clone first). Record the result in the log. If anything turns up, stop and tell SS. History rewriting is SS's decision.

### 3.3 Repository files

- [ ] `SECURITY.md`: how to report a vulnerability (the §1 contact), and what's in scope.
- [ ] `.github/CODEOWNERS`: SS owns everything, especially `data/people.yaml`, `data/assets/`, `src/schema.ts` and `.github/`.
- [ ] `.github/pull_request_template.md` with a source checklist that follows §0.2.
- [ ] Issue templates: **Correction request** (record URL, what's wrong, source), **New data** and **Bug**.

---

## §4 Phase 2: Legal and editorial policy (hard stop: needs §1 answers)

Branch: `launch/phase-2-policy`

### 4.1 Licences

- [ ] Keep MIT for code (`LICENSE`). Add `LICENSE-DATA` with **CC BY 4.0** for everything in `data/` and the exports, attributed to the §1 publisher name. Update the README licence section and add the licence to `graph.json` and `popolo.json` metadata.

### 4.2 `docs/EDITORIAL_POLICY.md`

Write it to cover:

- **Scope.** The project records public offices, public bodies and people **in their public roles**. It doesn't record private individuals, home addresses, personal phone numbers or personal email addresses, or photos of people. Only official office contact details are recorded.
- **Sourcing.** The §0.2 hierarchy, in plain language.
- **Legal cases** (per SS's answer to §1.4). If kept, only include proceedings evidenced by a court order or judgment, or a court's own cause list or website. Always show the **current** status, including acquittals, quashed cases and withdrawals, as prominently as the charge. Use neutral wording ("charged under…", "acquitted on…"). No allegations that never reached a court. Review every record every 90 days, or show it as stale.
- **Declared assets.** Only ECP-published statements (Elections Act 2017, s. 60 and s. 137), labelled as declared values, not audited net worth.
- **Family ties** (`relative_of`, per §1.6). Only between people who are both **public officeholders or party office-bearers**. The relationship must be stated in a level-1 source or in two independent reputable outlets. Never add minors. Never add relatives who hold no public role.
- **Election results.** Show ECP official results. Tribunal petitions and court rulings are shown as recorded by the tribunal or court. The project doesn't make its own claims about the fairness of any election.
- **Corrections and right of reply.** Anyone, including the people named, can request a correction through the issue template or the §1 contact. Response target: acknowledge within 7 days. Corrections are logged publicly in `verification.yaml` with `status: corrected`.
- **Takedown.** The process for legal notices, and a commitment to review promptly.

### 4.3 In the product

- [ ] An **About / Methodology** page that sets out the policy, the licence, how to cite, the data date range and the corrections route.
- [ ] A short disclaimer in the footer on every page: "Compiled from public sources; may contain errors; last verified <date per record>; report a correction".
- [ ] Apply SS's §1.4 and §1.5 decisions in code. If a field is hidden, remove it from the **built** `graph.json` and the exports too, not only from the UI.
- [ ] Schema rules that enforce the policy: `legal_cases[].sources` required and non-empty; `declared_assets[].source.url` must be an ECP domain (or a listed Gazette host); `relative_of` relations must have a `sources` array with at least one entry, and both ends must be people with at least one public role.

### 4.4 Human review (launch blocker)

Add to §10: **A Pakistani lawyer reviews the editorial policy and the live `legal_cases`, `declared_assets` and `relative_of` content before the repo goes public**, with PECA 2016 (as amended in 2025) and defamation law in mind. Claude cannot sign this off.

---

## §5 Phase 3: Core data completeness

Branches: `launch/phase-3a-…`, `3b`, and so on, one per sub-phase or split further by legislature or province. Follow §0.2 strictly and verify under §0.3.

### 3a Legislators (the biggest gap: 17 of about 1,270 seats had a named member)

- [ ] **National Assembly (336)**: all general seats from the ECP's notified results and the NA members list (na.gov.pk). Women's and non-Muslim reserved seats: the members as notified by the ECP, attached to the grouped reserved-seat post with each person's party.
- [ ] **Senate (96)** from senate.gov.pk, with province and seat category.
- [ ] **Provincial assemblies** (Punjab, Sindh, KP, Balochistan) and the **GB and AJK assemblies**, from each assembly's website and the ECP.
- [ ] **Party affiliation is dated.** Record the party a member was elected under **and** any later affiliation, with dates (for example PTI-backed independents who later joined the Sunni Ittehad Council). Use the `party` history in roles if the schema supports it. If not, extend the schema and document it.
- [ ] Record **vacancies, de-seatings, by-elections** and **suspended** members with dates and sources.
- [ ] Update the chamber `composition` blocks from the filled data, and check that seats sum to `total`.

### 3b Senior executive and judiciary

- [ ] Chief Secretary and Inspector General of Police for **every** province, ICT, GB and AJK (several are missing).
- [ ] Federal Secretary of **every** Division, and the head of **every** regulator and constitutional body in the data.
- [ ] Chief Justice of every High Court (including the IHC, GB Chief Court and AJK High Court), and the judges of the Supreme Court and Federal Constitutional Court from the courts' own websites.
- [ ] Provincial cabinets: every minister, from each province's official cabinet page or notifications.

### 3c Field administration (0 of 167 DCs had a holder)

- [ ] Commissioners and Deputy Commissioners for every division and district, from provincial government and district websites.
- [ ] These change often. Set `confidence: medium` unless a posting notification is cited. Where no current official source exists, leave the post empty. The Accountability page will then show it as "holder not recorded", which is the honest state.

### 3d Laws (3 of 149 had a URL)

- [ ] Add the Pakistan Code URL for every federal law and amendment. For provincial laws, use the provincial code sites (Punjab, Sindh, KP, Balochistan). **Check each URL loads the right law.**
- [ ] Add a one-to-two-sentence neutral `summary` to every law.
- [ ] For each **ordinance**: `promulgated`, `lapsed`, `re_promulgated[]`, `enacted_as` (the law ID) where applicable. Extend the schema for this and document it. §7.5 depends on it.

### 3e Organisations

- [ ] `sources` on every organisation (3 of 580 had one). At minimum, the enabling law and the official website.
- [ ] `established` dates, and `website` wherever an official site exists.
- [ ] **Urdu names.** Use the official Urdu name when the body publishes one. Otherwise, add a transliteration with `name_ur_source: transliteration` (add this field) so a native reviewer can check it. Don't present machine transliteration as official. Do the same for people (`name_ur` for 2 of 134 people).

### 3f Budget and staffing

- [ ] From the Federal Budget "Details of Demands for Grants and Appropriations" for the current fiscal year: current and development budget per ministry or division, and PSDP allocation. Tag every figure with its fiscal year and source document.
- [ ] Employee numbers only where an official source states them. Leave the rest empty.
- [ ] Provincial budgets per department: Punjab first, then the other provinces, as time allows.

---

## §6 Phase 4: Coverage the review found missing

Branch: `launch/phase-4-coverage`. Same standards.

- [ ] **Military-linked commercial and welfare bodies**: Fauji Foundation, Army Welfare Trust, Shaheen Foundation, Bahria Foundation, National Logistics Cell (NLC), Frontier Works Organization (FWO), Special Communications Organization (SCO), and the Defence Housing Authorities. For each: legal basis, parent or controlling authority, how its head is appointed, sector and website. Use neutral descriptions only.
- [ ] **State-owned enterprises**: take the list from the Finance Division's official SOE reporting (under the SOE (Governance and Operations) Act 2023) and the Privatisation Commission's list. Check the **current** status of each before recording it. Some have been privatised or restructured recently, so don't rely on memory.
- [ ] **Citizen-facing channels**: the Pakistan Citizen's Portal, the federal and provincial information (RTI) commissions, and every ombudsman, each with its **official** complaint route and contact details. Show them on the page of each relevant body ("How to complain / request information").
- [ ] **Caretaker governments**: historical federal and provincial caretaker set-ups (at least 2018 and 2023), with their legal basis (Arts. 224, 224A) and the Elections Act 2017 s. 230 limits on their powers.
- [ ] **Local government**: for each province, the current Local Government Act, the tiers it creates, whether elections have been held and when, and the current status (elected councils or administrators). Model structure first. Filling in individual councils can come later.
- [ ] **Gender**: add an optional `gender` field on people, filled only from how the person is described in official records (for example a women's reserved seat, or official biographies). Add a "Women in office" view by government and post type.
- [ ] **Election results (2024 general election and later by-elections)**: for each NA and provincial seat, the ECP result (winner, runner-up, votes, turnout, margin) with a link to the ECP document. Add **election tribunal petitions** and their status where the tribunal or court record is available. Follow the §4.2 election-results policy.
- [ ] **Family ties**: add the `relative_of` relation type (`{from, to, relation: parent|child|sibling|spouse|in_law|cousin|other, sources}`) if SS approved it in §1.6, under the §4.2 rules. Add a "Political families" view.
- [ ] **Wikidata QIDs**: add a `wikidata` field to people, organisations and jurisdictions. Match with a script (Wikidata API or SPARQL) on exact name plus office or date. Only write matches that are unambiguous, and put ambiguous ones in a review CSV for SS. Add the QIDs to the Popolo export `identifiers`.

---

## §7 Phase 5: Product and UX

Branch per feature (`launch/phase-5-urls`, `launch/phase-5-find-rep`, …). Every feature gets tests and a Playwright check (§8.3).

1. **Real URLs, with link previews.**
   - Move from hash routes (`#/org/x`) to path routes (`/org/x`).
   - **Prerender** a static HTML file for every entity at build time, with `<title>`, meta description, Open Graph and Twitter-card tags (name, type, head of body, government). This makes WhatsApp and X previews work and lets search engines index pages.
   - Generate `sitemap.xml` and `robots.txt`.
   - Keep old `#/…` links working with a small redirect on load.
   - GitHub Pages serves `404.html` for unknown paths, so prerendering avoids the usual SPA hack. Check that the build size stays reasonable.
2. **Find my representative.**
   - Search by district, tehsil or city name, returning the NA and provincial constituencies, their members, and the district's DC, Commissioner and local government.
   - Build the constituency ↔ district mapping from the ECP's 2023 delimitation documents, with the source recorded.
   - Put a prominent search box on the home page ("Who represents me?").
3. **Member pages.** Constituency, party history, committee memberships, and links out to FAFEN Open Parliament and the Assembly's own profile. Only link out: don't copy FAFEN data unless its licence allows it. Office contact details only.
4. **"Who's connected" panel** on each body and person page: the 1-hop and 2-hop neighbours grouped by relationship type (appoints, oversees, member of, relative of…), like CivLab.
5. **Ordinance tracker.** A page listing every ordinance with its promulgated, lapsed, re-promulgated and enacted dates (uses §3d data), plus counts per government and year.
6. **Turnover dashboard.** For key posts (Finance Minister, Interior Minister, CS and IG per province, FBR Chairman, SBP Governor…):
   - number of holders since 2008
   - median tenure
   - share of time on acting or additional charge
   Use accessible charts; follow the repo's palette. Build them only from dated tenures in the data, and say so on the page.
7. **Time slider.** An "as of date" control on the Tree and Directory pages, showing who held which post on a chosen date. It uses `since`/`until` data already in the model.
8. **Changelog page.** Generated at build time from `verification.yaml` and from git history of `data/` (commit date, message, files). Commit messages for data changes should be written for the public ("Added Punjab DCs from S&GAD notifications, Sept 2026").
9. **Urdu interface** (only if SS chose it in §1.7). An English/Urdu toggle for all interface text, using an i18n dictionary, with right-to-left layout for Urdu and a proper Nastaliq font. Records without `name_ur` fall back to English.
10. **Staleness banner.** Any person record with `as_of` older than 90 days shows a small "not re-verified since <date>" note.
11. **News per entity (optional, build-time only).** A curated `news` list per body (title, outlet, date, URL), filled at ingestion time from official press releases (PID, the body's own site). The site must not fetch news at runtime.
12. **Accessibility (WCAG 2.2 AA).**
    - Keyboard access to every control, including an accessible list alternative to the Cytoscape graph.
    - Visible focus.
    - Colour contrast checked in both themes, and never colour alone to carry meaning (the tags already carry text).
    - `lang="ur"` on Urdu text (mostly done).
    - Automated `axe` checks in the Playwright suite (§8.3).
13. **Performance.** Measure `graph.json` size once the data is filled (it will grow a lot). If it passes about 2 MB gzipped, split it: a core index plus per-government chunks loaded on demand. Target: Lighthouse performance ≥ 90 on mobile for the home page and an org page.

14. **Landing-page analytics and infographics** (requested by SS). Branch: `launch/phase-5-analytics`.

    The home page opens with a row of stat tiles and a few charts, each linking to a full, filterable page. Every number is computed at build time from the data. Nothing on these pages is typed in by hand.

    **Career records** (per person, also shown on each person's page):
    - times elected to each house (NA, Senate, each provincial assembly), for example "elected to the Senate 4 times"
    - total years in elected office, and offices held (minister, CM, Speaker…)
    - **party changes**: the number of documented changes of party, with dates and the parties involved. "Never changed party" is shown only when the full party history in the coverage window is sourced; otherwise show "party history incomplete".
    - landing-page tiles: "most-elected legislators", "longest-serving", "most party changes", "never changed party", split by house and government

    **Declared assets** (ECP only, per §4.2):
    - list of members with their latest ECP-declared assets, liabilities and net assets (assets minus liabilities), with the fiscal year and a link to the ECP document
    - **highest and lowest declared net assets**, per house and per party, comparing **only statements from the same fiscal year**
    - asset change across years for the same person (from ECP statements only)
    - the median declared net assets per house and per party

    **Rules that make this defensible:**
    1. **Coverage window on every figure.** State it on each tile and chart (for example "NA elections 2002–2024; Senate elections 2003–2024"). Don't claim a lifetime count unless the data covers the person's whole career. Collect historical results from ECP publications as far back as they are reliably available, and put the window in `docs/COVERAGE.md`.
    2. **Neutral labels.** Say "highest declared net assets", not "richest"; say "party changes", not "turncoats". Add a caption on every asset chart: "Declared to the ECP, including spouse and dependants as the form requires; values are as declared, often at historical cost, and are not audited."
    3. **Defining a party change.** Only a documented change of party membership counts. Joining a coalition doesn't. Cases where candidates were legally unable to contest under their own party's symbol (for example PTI-backed independents in 2024 who later joined the Sunni Ittehad Council) are counted and shown **separately**, with a note, not as ordinary switches.
    4. **Rank only complete records.** A person is included in a ranking only if the data behind their figure is complete for the stated window. Show the count of people excluded ("based on 312 of 336 members with a 2024-25 statement").
    5. **Every figure links to its evidence.** Clicking a tile or bar opens the list of records behind it, each with its ECP or Assembly source.
    6. **Data for this.** It needs historical ECP election results (§3a extended back in time) and ECP annual asset statements, which are published as Gazette PDFs. Write ingestion scripts for both under `scripts/ingest/`, keep staging CSVs, and verify under §0.3, with 100% of the asset figures that appear in any "highest / lowest" list checked against the PDF.
    7. **Charts.** Build them as static SVG at build time or with a small in-repo component. Don't add a charting CDN. Charts must be accessible: text labels, a data table alternative, sufficient contrast in both themes, and no meaning carried by colour alone.

15. **Political families: tree and map view.**
    - A "Political families" page listing each family group (connected `relative_of` records).
    - A **family tree** per group, drawn with the existing Cytoscape + dagre setup: generations top to bottom, spouses side by side. Each person node shows current and past offices and party.
    - A **map** of where each family's members hold or held seats (constituency → district), once the §7.2 constituency-to-district mapping exists.
    - Every link shows its source on hover or tap. Only public officeholders and party office-bearers appear (§4.2). No minors, and no relatives without a public role.

---

## §8 Phase 6: Keeping it fresh

Branch: `launch/phase-6-freshness`

- [ ] **Weekly staleness workflow** (GitHub Actions, scheduled). It runs `audit:coverage` and opens or updates one issue, "Records needing re-verification", listing people with `as_of` > 90 days, legal cases > 90 days since their last check, and broken source links. It has read-only permissions except for `issues: write`. It never edits data.
- [ ] **Link checker** (for example lychee) on all source and law URLs, run weekly and at release. Broken links are reported, not auto-fixed.
- [ ] **Monitoring design (document only for now):** `docs/MONITORING.md` describing how agents could later watch Cabinet Division notifications, ECP gazettes, Establishment Division postings and court websites, and open **pull requests** with cited diffs. Rule: no auto-merge, and a human always reviews.

---

## §9 Phase 7: Pre-launch verification

Branch: `launch/phase-7-verify`. This phase changes little code. It proves the rest.

### 9.1 Full independent audit

Launch a **fresh subagent** with only this file's §0.2 standard and the repository. Ask it to audit:
- a random 10% of people and their current roles
- a random 5% of organisations
- 100% of `legal_cases`, `declared_assets` and `relative_of` records
- 100% of election-result records for a random 20 constituencies
- all headline numbers in the README against `docs/COVERAGE.md`

It reports supported / partial / not supported, with evidence. Fix the failures, re-run the failed parts, and put the report in `docs/AUDIT-<date>.md`.

### 9.2 Security re-check

- Secret scan (full history), `npm audit`, and a check that the CSP is present in every build output.
- A review of every `raw()` and every `href` built from data.
- Confirm that hidden fields (per §1.4 and §1.5) are absent from `graph.json` and the exports.

### 9.3 Automated browser tests (Playwright)

Chromium is available locally; don't download browsers in CI if a system one exists. Smoke-test these routes:
- home, the NHSR&C org page, a person, a place, a law
- Directory, Officials, Parliament, Appointments, Tree, Map, Verification, Accountability, Search
- Find my representative, Ordinance tracker, Turnover, Changelog

For each route, check: no console errors, no failed requests, `axe` shows no serious or critical violations, and the page renders at 375 px and 1280 px widths. Save screenshots of the key pages to `docs/screenshots/` for SS to review.

### 9.4 Lighthouse

Record performance, accessibility, best practices and SEO scores for the home page and one org page (mobile) in the log.

### 9.5 Final report to SS

Write `docs/LAUNCH_READINESS.md`:
- a coverage table, before (the review numbers) and after
- audit results
- the security checklist
- known gaps
- the §10 checklist with every Claude-completable item ticked

---

## §10 Launch checklist (SS completes the items marked 👤)

- [ ] All phase PRs merged; CI green on `main`.
- [ ] `docs/LAUNCH_READINESS.md` reviewed.
- [ ] 👤 Lawyer has reviewed the editorial policy and the sensitive content (§4.4).
- [ ] 👤 Corrections email is live and monitored.
- [ ] 👤 Branch protection on `main`: require PR review, require CI, no force-push.
- [ ] 👤 Secret scanning and Dependabot alerts enabled (repo Settings → Code security).
- [ ] 👤 Repository visibility changed to **public** (Settings → General → Danger Zone).
- [ ] 👤 GitHub Pages enabled (Settings → Pages → Source: GitHub Actions), and the custom domain with HTTPS enforced if chosen.
- [ ] Post-launch smoke test on the live URL (Claude can run §9.3 against it).
- [ ] 👤 Announcement: accuracy caveat, corrections route and data licence stated up front.

---

## Appendix: baseline numbers from the September 2026 review

These are the "before" figures for the coverage table.

| Metric | Baseline |
|---|---|
| Authored organisations | 580 (of ~780 incl. generated) |
| Orgs with `sources` | 3 |
| Orgs with `legal_basis` | 352 |
| Orgs with `website` | 105 |
| Orgs with `established` | 3 |
| Orgs with `name_ur` | 21 |
| Orgs with `budget` / `employees` | 0 / 0 |
| People | 134 (2 with `name_ur`) |
| Current roles with a source | 91 of 221 roles |
| Legislative seats with a named member | 17 (14 NA, 1 Senate, 1 PP, 1 PK) |
| DCs / Commissioners with a holder | 0 |
| Chief Secretaries recorded | Punjab, Sindh, Balochistan |
| IGs recorded | Punjab, KP |
| Laws with a URL | 3 of 149 |
| Laws with a summary | 46 of 149 |
| Military commercial bodies (Fauji, NLC, FWO) | 0 |
| Wikidata IDs | 0 |
| Source URL scheme check | none (`javascript:` accepted) |
| Deployment | not deployed; repo private |
