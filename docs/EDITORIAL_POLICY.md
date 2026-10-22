# Editorial policy

The Pakistan Government Graph records how the Pakistani state is organised and who holds public office. This policy says what the project records, what it leaves out, and how it handles sources, sensitive content and corrections. Parts of it are enforced in code. Those parts name the file that enforces them.

The policy and the sensitive content it covers are reviewed by a Pakistani lawyer before the project is made public, with the Prevention of Electronic Crimes Act 2016 (as amended in 2025) and defamation law in mind.

## Scope

- The project records **public bodies, public offices and people in their public roles**: what they hold, since when, who appointed or elected them, and under which law.
- It does **not** record private individuals, home addresses, personal phone numbers, personal email addresses or photographs of people. Where contact details appear, they are the office's official ones.
- People appear because of an office they hold or held, or a party office. Nobody is added for any other reason.

## Sources

Every fact must come from a source that was actually consulted, and the source is cited on the record.

1. **Official records come first.** The Constitution, the Pakistan Code and provincial codes, the Gazette, ECP notifications and results, Cabinet Division, Establishment Division and provincial notifications, the websites of the assemblies, the Senate, the courts and the bodies themselves.
2. **Then state media reporting an official notification:** APP, Radio Pakistan, PTV.
3. **Then reputable independent press:** Dawn, The Express Tribune, The News, Business Recorder, Geo, Aaj. These are used mainly for dates and context.
4. **Encyclopedias, including Wikipedia, are never a source.** They may be used only to find an official source, which is then cited instead.

### Archived copies and other routes to official pages

Many official sites refuse connections from outside Pakistan. Being outside Pakistan is not a reason to leave a fact unsourced, so a page that will not load is read another way, and the citation still names the official page:

- **Another official host first.** The same document on another official site (the department's own site instead of the provincial law portal, `www.` instead of the bare domain) is cited as `url` with `fetched_via: alternate_host`.
- **Then a web archive snapshot.** If no official host loads, the fact may be read from a Wayback Machine (or archive.today) snapshot of the official page. The citation's `url` is still the official page; the snapshot goes in `archive_url`, with `fetched_via: archive`. An archive host is never a citation's `url`: the build rejects it (`isArchiveUrl` in `src/lib/policy.ts`). The site shows an "archived copy" link next to such citations.
- Only what the snapshot itself says is recorded, and a snapshot is evidence only of what the page said on the day it was taken. Registry homepages are confirmed only from snapshots taken since October 2024.
- Routes that are not used: proxies or VPNs of unknown provenance, anything that needs someone else's credentials, and any way around a CAPTCHA or browser challenge (Cloudflare, Turnstile). A site behind such a challenge stays `unreachable_from_ci`.

Who holds a post needs one official source, or two independent press sources that agree. Each record's confidence level reflects this: *high* only for an official source. Every source carries the date it was consulted, and every person record the date it was last checked. When sources disagree, the disagreement is logged in the public verification log rather than settled silently.

## Legal cases

**Published when grounded, cited and traceable** (decision of SS, 20 October 2026, replacing the hold of 30 September 2026). No fiction, presumption or unverified reports.

- **Opt in, case by case.** A case reaches the site, `graph.json` and the exports only when it is marked `publish: true` in `data/`. Any case whose source is missing, unreachable or does not support every detail stays in `data/` with `publish: false` and a `hold_reason`, and is not published.
- **Source hierarchy: court records > official > news.** First, the court's own record: judgments and orders on the Supreme Court, Islamabad, Lahore, Sindh or Peshawar High Court websites, cause lists, or a law-report citation (PLD and the like) where it is freely available. Second, official sources: NAB or FIA press releases, ECP notifications, the Gazette. Third, established outlets (Dawn, APP, Business Recorder, Al Jazeera, Reuters and the like) reporting the court's decision, used only where no primary record is published, and labelled as news. Encyclopedias are never a source. Every detail shown (charge, court, dates, sentence, custody) must be stated by a cited source; anything a source does not state is left out rather than guessed. Official documents are linked, never rehosted in the repository.
- **Timeline.** Each published case carries a dated timeline, oldest first: FIR or reference filing, charges framed, verdict and sentence, appeals, suspensions and bail where material, stays, appellate judgments and the latest status. Every event has a date (exact if known, otherwise year and month), a type, the court or authority, one neutral line and its own source, labelled on the page as **Court record**, **Official** or **News report**. An event that cannot be sourced is left out.
- **FIRs and privacy.** FIR copies are never linked or quoted where they expose complainants, witnesses or minors. An FIR is cited by its number and police station as reported, with the source that reports it. The build enforces this: a published case whose sources or timeline link or title an FIR copy (a scan, photo or PDF of the report) fails (`looksLikeFirCopy` in `src/lib/policy.ts`).
- **Outcome beside the charge.** Each published case shows its current outcome (`pending`, `convicted`, `acquitted`, `stayed`, `quashed`, `withdrawn`, …) next to the charge, with the date that outcome is stated as of (`status_as_of`) and a link to the source for that outcome (`status_source`). If the outcome cannot be sourced, the case is held back rather than show a charge without its outcome.
- **Neutral wording.** Charges are worded as allegations ("as alleged by NAB", "charged under…", "acquitted on…"), and pages say that allegations are not findings of guilt. Acquittals, stays, withdrawals and quashed cases are shown as prominently as the charge.
- **Enforced at build time.** `publishedCaseProblems()` in `src/lib/policy.ts` fails the build if any case marked `publish: true` lacks a charge, a status, a `status_as_of` date, a `status_source` URL or a cited source URL, or if any timeline event lacks a date, type or source URL, or the events are out of date order.
- **Freshness.** Published case sources are link-checked weekly with every other cited URL, and each case is re-checked when its person's record is.
- **Corrections.** Anyone, including the people named, can [open an issue](https://github.com/shehnshah55/govt-map/issues/new?template=correction.yml) with a source. A case whose outcome changes, or whose source turns out not to support it, is corrected or set back to `publish: false`.

## Declared assets

- Only statements **published by the Election Commission of Pakistan** are used: annual statements under section 137 of the Elections Act 2017, and nomination-paper declarations under section 60. This is enforced: a declared-asset record that does not cite an ECP publication fails validation (`ASSET_SOURCE_HOSTS` in `src/lib/policy.ts`).
- Values are labelled as **declared** values, often at historical cost, including spouse and dependants as the form requires. They are not audited net worth.
- Rankings compare one fiscal year at a time, and only once statements cover at least 90% of a house's seats for that year.

## Family ties

- A family tie is recorded only between two people who **both** hold or held a public office or a party office. Relatives with no public role are never recorded, and nor are minors.
- The tie must be stated by an official source, or by two independent reputable outlets. This is enforced at build time (`scripts/compile.ts`).

## Elections, and the "not legally elected" label

- Results are shown as declared by the ECP. Election tribunal petitions and court rulings are shown as recorded by the tribunal or court.
- **"Not legally elected."** Where the ECP's own Form 45 results (the polling-station counts) add up to a different winner from the ECP's Form 47 (the provisional consolidated result), the officeholder is labelled "not legally elected". This label:
  - is applied seat by seat, and only after the figures have been checked against the ECP's own Form 45 documents. Compilations by parties or observers are used only to find seats to check;
  - is always shown with its evidence next to it: the Form 45 totals, the Form 47 result and links to both documents;
  - is part of the lawyer review before launch.
- **"Not directly elected."** Officeholders who were not chosen by voters (members on reserved seats, senators, and unelected ministers, advisers and special assistants) carry a neutral tag that says how they were chosen.
- Apart from these labels, the project makes no claims of its own about the conduct of any election.

## Neutral wording

Descriptions say what a body, law or office does, not whether it is good. They don't use adjectives about people.

## Official websites and Find a service

- `data/official-sites.yaml` lists the official websites of public bodies. An entry must be on a government domain (`.gov.pk`, `.gop.pk`, `.gos.pk`, `.gob.pk`, `.gok.pk`, `.gkp.pk`) or on a host listed in `OFFICIAL_ORG_HOSTS` with the reason it is that body's own site. This is enforced (`isOfficialSiteUrl` in `src/lib/policy.ts`). Private companies, aggregators and unofficial mirrors are never listed.
- Each entry records when it was last checked and its result: `verified`, `cert_issue` (the site loads but its TLS certificate chain is incomplete), `verified_via_archive` (the site does not load from outside Pakistan, but a Wayback Machine snapshot of its official homepage taken since October 2024 shows the body's own site; `archive_url` holds the snapshot) or `unreachable_from_ci` (no route could load it, or the snapshots are too old or show a block page). `fetched_via` records how the check reached the site. Unreachable sites are flagged, not dropped. The weekly freshness report re-checks every URL.
- **Find a service** (`#/find`; old `#/ask` links redirect there) only points to official websites, to pages and documents on them, and to records in the graph. It never writes an answer or gives advice, and it runs entirely in the browser: questions are not sent anywhere. Two question types, "who appoints X" and "whom does X answer to", are answered only from relationships already recorded in the graph (the post's appointment and the body's accountability, oversight and control relations, each with its legal basis); when nothing is recorded the page says so. CNIC, passport, phone and other long numbers and email addresses are removed from a question before it reaches the address bar, the browser history or the page title (`src/lib/redact.ts`).
- The **service index** (`data/service-index/`, [docs/SERVICE_INDEX.md](SERVICE_INDEX.md)) lists citizen-facing pages and documents (forms, fees, procedures, contacts, notifications) found on the registry's official websites. Every item links to the official page, which is the source of record, and shows the date we last fetched it. Its only text is the page's own title and a short excerpt (at most 300 characters) copied verbatim from that page: never a summary, paraphrase or answer of ours. A fee or deadline in an excerpt is what the page said on that date; people are told to confirm on the official site.
- The service index never holds personal data. Pages that list individuals (merit lists, results, seniority or beneficiary lists) or that show a CNIC or several mobile numbers are not indexed, and excerpts may not contain a mobile number, a CNIC or a personal email address. The build fails if one does.

## Corrections and right of reply

- Anyone, including the people named, can ask for a correction using the **Correction request** form on the project's GitHub Issues page. A dedicated email address will be added when one exists.
- Requests are acknowledged within **7 days**.
- Accepted corrections are made in the data and logged publicly in the verification log (`data/verification.yaml`) with `status: corrected`, saying what changed and on what source.
- Where a person named disputes a record and the sources conflict, the conflict is logged and shown, rather than either side being silently preferred.

## Takedown requests

- Legal notices and takedown requests are made through the same Correction request form, or privately through the repository's security reporting route (see `SECURITY.md`) where the request contains personal information.
- Each request is reviewed promptly. While it is under review, the record concerned can be hidden from the public build.
- The outcome is recorded in the verification log, without personal details of the person who asked.

## Licence

The data is released under **CC BY 4.0** (see `LICENSE-DATA`). Attribute it as "Pakistan Government Graph". The code is under the MIT licence (`LICENSE`).
