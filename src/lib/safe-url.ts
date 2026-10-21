/**
 * The one rule for every URL that comes from the data and ends up in an href.
 *
 * Only https: is allowed. http: is allowed only for hosts listed here (official sites that do
 * not serve TLS); add a host only after checking it has no https: version. Anything else,
 * including javascript:, data:, vbscript: and mixed-case variants, is rejected.
 */
export const HTTP_ALLOWED_HOSTS: ReadonlySet<string> = new Set<string>([]);

export function isSafeUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && HTTP_ALLOWED_HOSTS.has(u.hostname.replace(/^www\./, ""));
}

/** For rendering: the URL if it is safe, otherwise a harmless placeholder. */
export const safeHref = (value: unknown): string => (isSafeUrl(value) ? value : "#");

export const SAFE_URL_MESSAGE = "URL must use https: (http: only for a host in HTTP_ALLOWED_HOSTS in src/lib/safe-url.ts)";
