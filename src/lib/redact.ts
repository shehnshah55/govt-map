/**
 * Removes personal numbers from text a visitor types, before anything else reads it: the question
 * is never stored or sent anywhere, but it is put in the address bar so an answer can be shared,
 * and it stays in the browser's history. Ask Pakistan strips CNIC and passport numbers in the
 * browser for the same reason. Pure — no DOM.
 */

export type Redaction = "CNIC" | "passport number" | "phone number" | "email address" | "long number";

/** Longest text redacted; callers cap what they accept well below this (Ask: 300, search: 200). */
export const MAX_TEXT = 2000;

/** Urdu and Arabic-Indic digits typed on an Urdu keyboard, as ASCII. */
export const asciiDigits = (s: string) => s.replace(/[\u06F0-\u06F9\u0660-\u0669]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10));

/** Dashes and minus signs people paste between digits (en and em dash, minus, full-width hyphen), as "-". */
const DASHES = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;
/** Invisible format characters next to a digit (left-to-right marks from Urdu pages, zero-width spaces), which would split a number. */
const INVISIBLE_BY_DIGIT = /(\d)\p{Cf}+|\p{Cf}+(?=\d)/gu;
/** What can sit between the groups of a number. */
const SEP = "[-\\s._/]";

// Order matters: a CNIC is also a long number, and a mobile number is also a long number.
// Each rule has two groups: the character before the number (kept), and the number (removed). That
// replaces a lookbehind, which Safari before 16.4 cannot parse at all: one in the bundle blanks the
// whole site there. The prefix also anchors each rule, so the time taken grows linearly with the
// text (an unanchored "[…]+@" retried from every character of a long run, 10 s on 100,000).
/** @internal exported for tests/ask.test.ts */
export const RULES: [Redaction, RegExp][] = [
  ["email address", /(^|[^\p{L}\p{N}._%+-])([\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63}){1,8})/gu],
  // 13 digits, usually written 12345-1234567-1
  ["CNIC", new RegExp(`(^|\\D)(\\d{5}${SEP}?\\d{7}${SEP}?\\d)(?!\\d)`, "g")],
  // two letters and seven digits, the current Pakistani passport format, even run into other words
  // ("passportAB1234567"): removing a false match costs less than leaving a real one
  ["passport number", /()(\p{L}{2}[-\s]?\d{7})(?!\d)/gu],
  // mobile (03xx…, +92 3xx…) and landline numbers
  ["phone number", new RegExp(`(^|[^\\d+])((?:(?:\\+92|0092|92)${SEP}?)?\\(?0?3\\d{2}\\)?${SEP}?\\d{7})(?!\\d)`, "g")],
  ["phone number", new RegExp(`(^|[^\\d+])((?:\\+92|0092|0)${SEP}?\\d{2,4}${SEP}?\\d{6,8})(?!\\d)`, "g")],
  // anything else that looks like an identifying number: ten or more digits, however separated
  ["long number", new RegExp(`(^|\\D)(\\d(?:${SEP}?\\d){9,})(?!\\d)`, "g")],
];

export function redact(input: string): { text: string; removed: Redaction[] } {
  let text = asciiDigits(input.slice(0, MAX_TEXT).normalize("NFKC")).replace(DASHES, "-").replace(INVISIBLE_BY_DIGIT, "$1");
  const removed = new Set<Redaction>();
  for (const [kind, re] of RULES) {
    text = text.replace(re, (_m, before: string) => {
      removed.add(kind);
      return `${before}[${kind} removed]`;
    });
  }
  return { text, removed: [...removed] };
}
