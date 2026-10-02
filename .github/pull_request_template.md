## What changed

<!-- A few bullets. For data changes, the record IDs or files touched. -->

## Sources (data changes)

Every new or changed fact needs a source fetched for this change (docs/LAUNCH_PLAN.md §0.2).

- [ ] No fact is from memory. Anything I couldn't source is left empty and listed below as "unverified, needs source".
- [ ] Each source is the highest level available: official records first (Constitution, Pakistan Code, Gazette, ECP, Assembly and Senate sites, court sites, official body sites), then state media reporting a notification, then reputable press. **No Wikipedia** (or other encyclopedias) as a source.
- [ ] Who holds a post: one official source, or two independent press sources that agree. `confidence` matches (`high` only for an official source).
- [ ] Every `source` has `title`, an `https` `url` and `accessed` (YYYY-MM-DD). Every person record touched has an updated `as_of`.
- [ ] Where sources disagree, there is a `verification.yaml` entry with `status: conflict` citing both.
- [ ] Bulk lists came through a script in `scripts/ingest/`, not typed by hand.
- [ ] Wording is neutral: what a body or law does, no adjectives about people.

## Checks

- [ ] `npm run validate`, `npm test`, `npm run typecheck` and `npm run build` pass.
- [ ] `npm run audit:coverage` re-run if the data changed.
- [ ] No secrets, tokens, `.env` files or personal contact details (checked with `git diff --cached`).

## Unverified or open items

<!-- Anything left out for lack of a source, unreachable sites, follow-ups. Write "none" if none. -->
