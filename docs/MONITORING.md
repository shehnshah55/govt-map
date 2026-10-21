# Monitoring design

**Status: design only.** Nothing described here runs yet. What runs today is the weekly freshness check (`.github/workflows/freshness.yml`): it lists stale records and broken links in one issue and never changes data.

This document describes how automated agents could later watch official sources for changes and propose updates. The rule that governs all of it:

> **Agents propose; people decide.** An agent may only open a pull request with a cited diff. Nothing is merged automatically, and a person reviews every change against its source before it is merged.

## What to watch

| Source | What changes there | Records affected |
|---|---|---|
| **Cabinet Division** notifications | Ministers, Ministers of State, advisers and special assistants sworn in, removed or reassigned; changes to the Rules of Business (new Divisions, transfers of business) | `people` roles in `fed-cabinet` and `fed-min-*`; Division bodies in `data/federal/` |
| **Establishment Division** notifications | Postings and transfers of Federal Secretaries, Chief Secretaries, IGs, Commissioners and Deputy Commissioners (BS-20 to BS-22) | Secretary, Chief Secretary, IG, Commissioner and DC posts |
| Provincial **S&GAD** notifications | Provincial secretaries, Commissioners and Deputy Commissioners | Provincial department and field-administration posts |
| **ECP** notifications and Gazette | Returned candidates, by-election results, de-notifications, reserved-seat allocations, and annual asset statements (Elections Act 2017, s. 137) | Seat holders (`seat-*`), `declared_assets`, `election_checks` |
| **National Assembly, Senate and provincial assemblies** | Members' oath-taking, resignations, Speakers and Deputies, committee chairs | Seat holders, presiding officers |
| **Supreme Court, Federal Constitutional Court and High Courts** | Judges' appointments, elevations and retirements; judgments in cases already recorded | Judicial posts; `legal_cases` status (if published) |
| **Gazette of Pakistan** and Pakistan Code | New Acts, Ordinances and amendments that create, abolish or change bodies and posts | `laws`, `legal_basis`, `history` |

## How an agent would work

1. **Fetch** each source on a schedule, from official URLs only (§0.2 of the launch plan), and keep the raw documents (PDF or HTML) in a staging area outside the repository.
2. **Extract** candidate changes into a staging CSV, with the document's URL, title, notification number, date and the date it was fetched. One row per change.
3. **Match** each row to an existing record by ID. Where a person or body can't be matched with confidence, the row goes into the pull request as a question for the reviewer, not a guess.
4. **Write** the change into the YAML as a normal edit: close the old role with `until`, add the new role with `since`, and add the `source` with `accessed`. Never delete history.
5. **Validate** with `npm run validate`, `npm test` and `npm run audit:coverage`, exactly as a person would.
6. **Open a pull request**, one per source document, with:
   - the document link and notification number;
   - a table of each change: record, field, old value, new value;
   - anything uncertain listed as a question;
   - the checklist from the pull request template.

## Rules

- **No auto-merge, ever.** The agent's token can open pull requests, but it can't approve or merge them. Branch protection requires review by a code owner (`.github/CODEOWNERS`).
- **Official sources only.** Agents don't use press reports as the basis for a change. A press report can only prompt a look at the official source.
- **No sensitive content by agent.** Agents never add or change `legal_cases`, `declared_assets`, `relatives` or `election_checks` by themselves. They may only flag that an official document seems relevant, in an issue.
- **Least privilege.** Each agent runs with read access to the repository plus permission to open pull requests, and no other secrets. Scheduled runs use `permissions:` set per job, as the existing workflows do.
- **Rate and politeness.** Fetch each source at most daily, identify the project in the User-Agent, and respect robots.txt.
- **Everything is logged.** Each run records what it fetched, what it proposed and what it skipped, as a workflow artifact.

## Order of work, when this is built

1. Cabinet Division and ECP notifications first. They change the most visible records.
2. Then Establishment Division and provincial S&GAD postings. These hold the largest number of posts with no current holder recorded.
3. Then the courts and the Gazette.

Each source starts in **report-only mode**, opening issues instead of pull requests, until its extraction has been checked against a month of real notifications.
