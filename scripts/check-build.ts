/**
 * Checks the built pages after `npm run build` and `npm run build:single`:
 *  - each has a Content-Security-Policy meta tag;
 *  - script-src never allows 'unsafe-inline' or 'unsafe-eval', and every inline script is allowed
 *    by its SHA-256 hash;
 *  - the page loads nothing from another site (no external script, stylesheet, font or image).
 *
 *   npx tsx scripts/check-build.ts dist/index.html dist-single/index.html
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function checkPage(html: string): string[] {
  const problems: string[] = [];
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
  if (!meta) return ["no Content-Security-Policy meta tag"];
  const policy = new Map(meta[1].split(";").map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));
  const scriptSrc = policy.get("script-src") ?? policy.get("default-src") ?? [];
  if (!scriptSrc.length) problems.push("no script-src or default-src");
  for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "*", "data:", "https:", "http:"]) if (scriptSrc.includes(bad)) problems.push(`script-src allows ${bad}`);
  if (!policy.get("object-src")?.includes("'none'")) problems.push("object-src is not 'none'");
  if (!policy.has("base-uri")) problems.push("no base-uri");
  for (const [tag, body] of [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => [m[1], m[2]])) {
    if (/\ssrc=/.test(` ${tag}`)) continue;
    const hash = `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
    if (!scriptSrc.includes(hash)) problems.push(`inline script not allowed by hash (${body.length} bytes)`);
  }
  for (const [, url] of html.matchAll(/<(?:script|link|img|iframe|source)\b[^>]*\s(?:src|href)="((?:https?:)?\/\/[^"]+)"/gi)) problems.push(`loads ${url}`);
  return problems;
}

if (process.argv[1]?.endsWith("check-build.ts")) {
  const files = process.argv.slice(2);
  if (!files.length) throw new Error("usage: check-build.ts <built index.html> …");
  let failed = false;
  for (const f of files) {
    const problems = checkPage(readFileSync(f, "utf8"));
    console.log(problems.length ? `✗ ${f}\n  ${problems.join("\n  ")}` : `✓ ${f}: CSP present, scripts hashed or same-origin, no third-party loads`);
    failed ||= problems.length > 0;
  }
  if (failed) process.exit(1);
}
