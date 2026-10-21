# Security policy

The Pakistan Government Graph is a static website: it has no server, no accounts, no database and no forms. Everything it shows is built from the files in this repository.

## Reporting a vulnerability

Please report security problems privately, not in a public issue:

1. Open the repository's **Security** tab and choose **Report a vulnerability** (GitHub private vulnerability reporting).
2. If that option isn't available, open an ordinary issue titled "Security report" that says only that you have something to report. Don't include details. The maintainer will reply with a private way to send them.

Please include what you found, the page or file involved and steps to reproduce it. We aim to acknowledge reports within 7 days.

Factual errors in the data are not security issues. Use the **Correction request** issue template for those.

## In scope

- The published site and the single-file build: for example script injection through data fields, links that run code, content loaded from other sites, or a missing or weak Content-Security-Policy.
- This repository's build and CI: the GitHub Actions workflows, the build and ingestion scripts, and their dependencies.
- Secrets or personal contact details committed to the repository or its history.

## Out of scope

- GitHub's own platform and GitHub Pages hosting.
- The government and press websites the data cites.
- Reports from automated scanners with no demonstrated impact on this site.

## How the site is protected

- Every URL taken from the data must use `https:` (`src/lib/safe-url.ts`). Data text is HTML-escaped when rendered, and `tests/security.test.ts` renders every page type from deliberately hostile data to check this.
- A Content-Security-Policy in `index.html` allows scripts only from the site itself; the single-file build allows its inline script by hash. `npm run check:build` checks the built pages in CI.
- The site makes no requests to third-party services at runtime. Fonts are self-hosted.
- GitHub Actions are pinned to commit SHAs with read-only permissions by default, and `npm audit` runs in CI. Dependabot proposes updates weekly.
