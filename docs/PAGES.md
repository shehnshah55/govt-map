# GitHub Pages setup

Expected public URL: **https://shehnshah55.github.io/govt-map/**

The workflow is [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) (`Deploy site`). It builds with `npm run build` and deploys the `dist/` folder via `actions/deploy-pages`.

## Enable Pages (SS only — Settings)

Agents cannot change repository Pages settings (§0.4). Do this in the GitHub UI:

1. Open **https://github.com/shehnshah55/govt-map/settings/pages**
2. Under **Build and deployment → Source**, choose **GitHub Actions** (not "Deploy from a branch").
3. Save. The first successful `Deploy site` run on `main` will publish the site.
4. Optional: under **Custom domain**, leave blank for the default `*.github.io` URL; enforce HTTPS when GitHub offers it.

## Why deploys fail with `HttpError: Not Found`

`actions/deploy-pages` returns **Not Found** when Pages is not enabled, or when Source is still "Deploy from a branch" instead of **GitHub Actions**. CI can be green while Deploy site fails.

## After enabling

1. Re-run the latest failed **Deploy site** workflow on `main`, or push an empty commit / wait for the next push to `main`.
2. Confirm the environment **github-pages** exists and the run shows a `page_url`.
3. Open https://shehnshah55.github.io/govt-map/ and check the home page loads.

## Status check (agents)

```text
Actions → Deploy site → latest run on main
```

If it still fails after Source is GitHub Actions, open the failed job log for the `deploy-pages` step and treat any other error separately.
