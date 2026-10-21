/**
 * Removes personal numbers from text a visitor types, before anything else reads it: the question
 * is never stored or sent anywhere, but it is put in the address bar so an answer can be shared,
 * and it stays in the browser's history. Ask Pakistan strips CNIC and passport numbers in the
 * browser for the same reason. Pure — no DOM.
 */

export type Redaction = "CNIC" | "passport number" | "phone number" | "email address" | "long number";

/** Urdu and Arabic-Indic digits typed on an Urdu keyboard, as ASCII. */
export const asciiDigits = (s: string) => s.replace(/[\u06F0-\u06F9\u0660-\u0669]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10));

// Order matters: a CNIC is also a long number, and a mobile number is also a long number.
const RULES: [Redaction, RegExp][] = [
  ["email address", /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu],
  // 13 digits, usually written 12345-1234567-1
  ["CNIC", /(?<!\d)\d{5}[-\s.]?\d{7}[-\s.]?\d(?!\d)/g],
  // two letters and seven digits, the current Pakistani passport format
  ["passport number", /(?<![\p{L}\p{N}])\p{L}{2}[-\s]?\d{7}(?![\p{L}\p{N}])/gu],
  // mobile (03xx…, +92 3xx…) and landline numbers
  ["phone number", /(?<![\d+])(?:(?:\+92|0092|92)[-\s]?)?\(?0?3\d{2}\)?[-\s]?\d{7}(?!\d)/g],
  ["phone number", /(?<![\d+])(?:\+92|0092|0)[-\s]?\d{2,4}[-\s]?\d{6,8}(?!\d)/g],
  // anything else that looks like an identifying number: ten or more digits, spaced or not
  ["long number", /(?<!\d)\d(?:[-\s]?\d){9,}(?!\d)/g],
];

export function redact(input: string): { text: string; removed: Redaction[] } {
  let text = asciiDigits(input.normalize("NFKC"));
  const removed = new Set<Redaction>();
  for (const [kind, re] of RULES) {
    text = text.replace(re, () => {
      removed.add(kind);
      return `[${kind} removed]`;
    });
  }
  return { text, removed: [...removed] };
}
