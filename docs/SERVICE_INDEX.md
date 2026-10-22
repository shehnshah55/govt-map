# Service index

`data/service-index/` lists citizen-facing pages and documents on the official websites in
[`data/official-sites.yaml`](../data/official-sites.yaml): forms, fee tables, procedures and
eligibility rules, contact and helpline pages, and notifications. **Find a service** (`#/find`)
searches it in the browser, alongside the official websites and the graph.

## What an item is

Each item is one official page or document (`src/schema.ts`, `ServiceItem`):

| field | meaning |
|---|---|
| `url` | the official page or document: **the source of record** (https only) |
| `title` | the page's own title (for documents: the document title, its link text, or file name) |
| `site_id`, `body_id` | the registry site it is on, and the body in the graph that runs it |
| `kind` | `form`, `fee`, `procedure`, `contact`, `notification` or `other` (a service page that fits none) |
| `type` | `html`, `pdf` or `doc` (Word) |
| `language` | `en`, `ur` or `mixed` (share of Arabic-script letters) |
| `fetched_at`, `http_status`, `content_hash` | when we fetched it, the HTTP status (always 2xx), and the SHA-256 of the bytes |
| `excerpt` | at most 300 characters copied **verbatim** from the page (meta description or first real paragraph; PDFs: first text) |
| `size`, `pages` | bytes, and page count for PDFs |

We never summarise, paraphrase or answer. A fee or a deadline in an excerpt is what the official
page said on `fetched_at`; the site tells people to confirm on the official page.

## Build gate

`npm run validate` (and `npm run data`) run `scripts/service-index-check.ts`. It fails when an item:

- does not match the schema (missing `url`, `body_id`, `fetched_at` or `kind`, unknown fields, http links, excerpt over 300 characters);
- is on a host that is not in the registry, or not on its own site's host, or names a `body_id` that differs from the registry or is not in the graph;
- is a duplicate, or is filed under the wrong level;
- has a CNIC, a mobile number or a personal email address in its title or excerpt, or a title that looks like a list of people;
- or when all chunks together exceed **5 MB gzipped**.

## Personal data

The crawler never stores personal data. It skips any page or PDF that shows a CNIC, more than three
mobile numbers or more than three personal email addresses, and anything whose title or link looks
like a list of individuals (merit lists, results, shortlists, seniority, transfer or beneficiary
lists, admit cards). Official helplines and UAN numbers are fine on a page, but excerpts may not
contain any mobile number at all.

## The crawler (`scripts/crawl.ts`)

- **Polite**: reads `robots.txt` first and obeys it (RFC 9309: longest match, `Allow` wins ties; a
  `robots.txt` that errors with 5xx or cannot be fetched means *stay out*), honours `Crawl-delay`,
  and never sends more than **one request per second to a host**. It identifies itself as
  `govt-map-service-index/1.0 (+https://github.com/shehnshah55/govt-map; …)`.
- **Bounded**: same host only (redirects to other hosts are not followed), depth 3, 120 requests,
  40 documents and 200 items per site, 12 minutes per site; PDFs over 15 MB are skipped.
- **Sitemaps first**: URLs from the sitemaps named in `robots.txt` (or `/sitemap.xml`) are queued
  with the homepage, and likely service pages are fetched before anything else.
- Sites marked `cert_issue` in the registry are fetched without TLS chain verification (their
  certificate chain is incomplete); everything else is verified.
- Registry entries without a `body_id` are skipped, because every item must name the body that runs it.
- A site that fails keeps the items an earlier run found, so a partial run never deletes data.

```sh
npx tsx scripts/crawl.ts                        # verified and cert_issue sites
npx tsx scripts/crawl.ts --sites fbr,dgip       # only these registry ids
npx tsx scripts/crawl.ts --include-unreachable  # also unreachable_from_ci sites
npx tsx scripts/crawl.ts --skip-fresh-hours 24  # resume: skip sites crawled in the last day
npx tsx scripts/crawl.ts --prune                # re-apply the current filters to the stored index, no fetching
npm run validate                                # the build gate
```

Other options: `--max-requests`, `--max-depth`, `--max-docs`, `--max-items`, `--site-minutes`,
`--concurrency` (sites in parallel; each host is still limited to one request a second),
`--seeds <file>` (extra URLs to try first, one per line; only URLs on a registry site's own host are
used), `--summary <file>` and `--dry`.

## Freshness, and why coverage is partial

`.github/workflows/service-index.yml` re-crawls every Tuesday and opens (or updates) one pull
request, `bot/service-index-refresh`, with the diff and a crawl summary. Nothing merges without a
person. Items are one per line, so the diff shows which pages appeared, vanished or changed
(`content_hash`).

**Many `.gov.pk` hosts refuse connections from outside Pakistan** (NADRA, ECP, PTA, FPSC, HEC, the
National Assembly and others are `unreachable_from_ci` in the registry), so a GitHub runner, which
is outside Pakistan, covers only part of the registry. To fill the gaps, run the crawl from a
Pakistani network:

```sh
git clone https://github.com/shehnshah55/govt-map && cd govt-map && npm ci
npx tsx scripts/crawl.ts --include-unreachable --concurrency 16 --summary crawl-summary.json
npm run validate && npm test
git checkout -b data/service-index-pk && git add data/service-index
git commit -m "Service index: crawl from a Pakistani network" && git push   # then open a pull request
```

Because failed sites keep their earlier items, later runs from GitHub do not undo that work; they
only refresh the sites they can reach.

## Discovery seeds and reused datasets

Seeds only help the crawler find pages. **Every indexed item is fetched from the official site by
the crawler itself**, and that page is what is stored and cited; seed lists are never stored.

| dataset | licence | how it was used |
|---|---|---|
| `data/official-sites.yaml` (this repository) | CC BY 4.0 ([LICENSE-DATA](../LICENSE-DATA)) | the list of sites crawled |
| official sitemaps (`robots.txt` / `sitemap.xml` of each site) | published by each site for crawlers | discovery |
| [RayyanAlam1/gov-service-navigator](https://github.com/RayyanAlam1/gov-service-navigator) (`db/seed/*.ts`) | MIT | six official URLs (DGIP, NADRA, Punjab, Sindh) checked as discovery seeds: three were already registry homepages, two are on NADRA (not reachable from outside Pakistan) and one is on a host not in the registry, so none added pages; no content copied |
| [opendata.com.pk](https://opendata.com.pk/) (CKAN catalogue) | per dataset | searched; no dataset of government service pages was found, nothing used |
| data.gov.pk | — | not reachable when checked (404), nothing used |
| Wikidata | CC0 | not needed: the registry already lists the sites |

The index itself is released with the rest of `data/` under CC BY 4.0. Titles and excerpts are
short quotations of official pages, which remain their publishers' work; the licence covers our
compilation (which pages, their kind, dates and hashes), not the quoted text.

No question-and-answer site was crawled, nothing behind a captcha or challenge was fetched, and no
unlicensed content was copied.
