/**
 * Strips personal identifiers out of text a visitor types into Find a service or the search box,
 * before the text is put in the address bar, the browser history or the page title. Nothing typed
 * is ever sent anywhere, but a query in the URL is kept in history and can be shared by accident.
 *
 * Removes: CNIC numbers (13 digits, usually 12345-1234567-1), Pakistani mobile and landline
 * numbers, any other run of ten or more digits, passport numbers (two letters and seven digits)
 * and email addresses. Each is replaced with a short marker such as "[CNIC removed]".
 *
 * Every pattern is linear in the length of the text: each has a fixed literal or class at its start,
 * bounded repeats, and no nested quantifier that can match the same characters two ways. No pattern
 * uses a lookbehind (Safari before 16.4 cannot parse one). Pure: no DOM.
 */

export type Removed = "CNIC" | "phone number" | "number" | "passport number" | "email address";

/** Text longer than this is cut before redaction; the search boxes accept far less. */
export const MAX_INPUT = 1000;

const MARK: Record<Removed, string> = {
  CNIC: "[CNIC removed]",
  "phone number": "[phone number removed]",
  number: "[number removed]",
  "passport number": "[passport number removed]",
  "email address": "[email removed]",
};

/** Eastern Arabic and Urdu (Extended Arabic-Indic) digits as ASCII 0-9. */
function asciiDigits(s: string): string {
  return s.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) % 16));
}

// local part, "@", then one to eight dot-separated labels; "." is not in the label class, so the
// labels can only be split one way
const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}/g;
// two letters then seven digits, not inside a longer word or number; group 1 keeps the character before
const PASSPORT = /(^|[^A-Za-z0-9])([A-Za-z]{2}[ -]?\d{7})(?!\d)/g;
// a run of digits, optionally with a leading "+", where groups may be split by at most two of
// space - . / ( ) ; every repeat must consume a digit, so a run is read once
const DIGITS = /\+?\(?\d(?:[ \-./()]{0,2}\d)*/g;

function classify(run: string): Removed | undefined {
  const d = run.replace(/\D/g, "");
  // a list of years ("1973 2010 2018") is not an identifier
  if (/^(?:1[89]|20)\d\d(?:[ ,./-]{1,2}(?:1[89]|20)\d\d)+$/.test(run)) return undefined;
  if (d.length === 13 && !run.startsWith("+") && !d.startsWith("00")) return "CNIC";
  if (/^(?:03\d{9}|923\d{9}|00923\d{9})$/.test(d)) return "phone number";
  // landlines: 0 + area code + number (10-11 digits), or +92 / 0092 then the same without the 0
  if (/^(?:0[1-9]\d{8,9}|92[1-9]\d{8,9}|0092[1-9]\d{8,9})$/.test(d)) return "phone number";
  if (d.length >= 10) return "number";
  return undefined;
}

/** @internal the raw patterns, for the linear-time test */
export const PATTERNS = { EMAIL, PASSPORT, DIGITS };

export function redact(input: string): { text: string; removed: Removed[] } {
  const removed = new Set<Removed>();
  const mark = (kind: Removed) => {
    removed.add(kind);
    return MARK[kind];
  };
  let text = asciiDigits(input.slice(0, MAX_INPUT).normalize("NFKC"))
    // dashes and invisible marks pasted between digits would split a number in two
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, "");
  text = text.replace(EMAIL, () => mark("email address"));
  text = text.replace(PASSPORT, (_m, before: string) => before + mark("passport number"));
  text = text.replace(DIGITS, (run) => {
    const kind = classify(run);
    return kind ? mark(kind) : run;
  });
  return { text, removed: [...removed] };
}

/** The `q` value of a route such as "/find?q=…" with identifiers removed; other routes unchanged. */
export function redactPath(path: string): string {
  const i = path.indexOf("?");
  if (i < 0) return path;
  const params = new URLSearchParams(path.slice(i + 1));
  const q = params.get("q");
  if (q === null) return path;
  const { text, removed } = redact(q);
  if (!removed.length) return path;
  params.set("q", text);
  return `${path.slice(0, i)}?${params.toString().replace(/\+/g, "%20")}`;
}
