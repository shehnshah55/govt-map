/**
 * Two questions Find a service answers from the graph itself, never from text of ours:
 *   "Who appoints the Chief Election Commissioner?"  → the post's recorded appointment
 *   "Whom does NEPRA answer to?"                    → its recorded accountability relations
 * Only relationships already in the data (appointment fields and typed edges, each with its legal
 * basis) are returned; when nothing is recorded the page says so. Pure: no DOM.
 */
import type { Edge, GraphIndex, Post } from "./graph-index.ts";

export type Question = { kind: "appointer" | "accountable"; subject: string };

/** Longest question read; the input box accepts 200 characters. */
const MAX = 200;

const SUBJECT = "(?:the\\s+)?([^?]{2,120}?)";
const END = "\\s*[?.!]*\\s*$";
const RULES: [Question["kind"], RegExp][] = [
  // English
  ["appointer", new RegExp(`^\\s*(?:who|which\\s+(?:body|office|authority))\\s+(?:appoints|appointed|chooses|selects|elects|nominates|names)\\s+${SUBJECT}${END}`, "i")],
  ["appointer", new RegExp(`^\\s*how\\s+(?:is|are|was)\\s+${SUBJECT}\\s+(?:appointed|chosen|selected|elected)${END}`, "i")],
  ["appointer", new RegExp(`^\\s*who\\s+(?:is|are)\\s+${SUBJECT}\\s+appointed\\s+by${END}`, "i")],
  ["accountable", new RegExp(`^\\s*(?:to\\s+)?(?:whom|who)\\s+(?:does|do|is|are)\\s+${SUBJECT}\\s+(?:answer|report|accountable|answerable|responsible)(?:\\s+to)?${END}`, "i")],
  ["accountable", new RegExp(`^\\s*who\\s+(?:oversees|supervises|controls|audits)\\s+${SUBJECT}${END}`, "i")],
  ["accountable", new RegExp(`^\\s*${SUBJECT}\\s+(?:answers|reports|is\\s+accountable|is\\s+answerable)\\s+to\\s+whom${END}`, "i")],
  // Roman Urdu: "CEC ko kaun muqarrar karta hai", "NEPRA kis ko jawabdeh hai"
  ["appointer", new RegExp(`^\\s*${SUBJECT}\\s+(?:ko|ki|ka)\\s+(?:kaun|kon)\\s+(?:muqarrar|mukarrar|muqarar|tainat|taeenat|chunta|chunti|chunte|lagata|lagati|lagate|nominate)\\b.*$`, "i")],
  ["accountable", new RegExp(`^\\s*${SUBJECT}\\s+(?:kis|kise|kisko|kis\\s+ko|kis\\s+ke\\s+aage)\\s+(?:jawabdeh|jawab\\s+deh|jawabda|answerable)\\b.*$`, "i")],
  // Urdu: "… کو کون مقرر کرتا ہے"، "… کس کو جوابدہ ہے"
  ["appointer", /^\s*(.{2,120}?)\s+(?:کو|کی|کا)\s+کون\s+(?:مقرر|منتخب|تعینات|نامزد).*$/u],
  ["accountable", /^\s*(.{2,120}?)\s+(?:کس\s+کو|کس\s+کے\s+سامنے)\s+(?:جوابدہ|جواب\s+دہ).*$/u],
];

/** Reads a question as one of the two types, or undefined. */
export function parseQuestion(q: string): Question | undefined {
  const text = q.slice(0, MAX).replace(/\s+/g, " ").trim();
  for (const [kind, re] of RULES) {
    const m = re.exec(text);
    const subject = m?.[1]?.trim().replace(/^the\s+/i, "");
    if (subject) return { kind, subject };
  }
  return undefined;
}

export interface Resolved {
  /** The record the question is read as. */
  id: string;
  /** Other records the words also match, so the visitor can pick. */
  others: string[];
}

/** The post (for "who appoints") or the body or post (for "answers to") a subject names. */
export function resolveSubject(ix: GraphIndex, q: Question): Resolved | undefined {
  // every word must start a word of the record's names, so "IG" does not match "Irrigation"
  const words = q.subject.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const named = (id: string) => {
    const o = ix.org.get(id);
    const p = ix.post.get(id);
    const owner = p ? ix.org.get(p.org) : undefined;
    const person = ix.person.get(id);
    const names = [ix.label(id), o?.short_name, o?.name_ur, owner?.short_name, owner?.name, owner?.name_ur, person?.name_ur].filter(Boolean).join(" ").toLowerCase();
    const starts = new Set<string>();
    for (const w of names.split(/[^\p{L}\p{N}]+/u)) for (let i = 1; i <= w.length; i++) starts.add(w.slice(0, i));
    return words.every((w) => (/[a-z0-9]/.test(w) ? starts.has(w) : names.includes(w)));
  };
  const hits = ix.search(q.subject, 24).filter((h) => named(h.id));
  const ids: string[] = [];
  for (const h of hits) {
    let id: string | undefined = h.id;
    if (h.kind === "person") id = ix.person.get(h.id)?.roles.find((r) => !r.until)?.position;
    else if (h.kind === "organization" && q.kind === "appointer") id = headPost(ix, h.id)?.id ?? h.id;
    else if (h.kind !== "position" && h.kind !== "organization") id = undefined;
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (!ids.length) return undefined;
  return { id: ids[0], others: ids.slice(1, 5) };
}

function headPost(ix: GraphIndex, orgId: string): Post | undefined {
  return ix.leadership(orgId).find((p) => p.role === "head" || p.role === "chief_justice" || p.role === "chief" || p.role === "presiding_officer");
}

const UP_OUT = new Set(["accountable_to", "reports_to", "appeals_to"]);
const UP_IN = new Set(["administrative_control", "oversees", "audits", "regulates"]);

export interface Accountability {
  /** The body the answer is about (the post's own body for a post). */
  org?: string;
  /** Edges from the subject to whom it answers: accountable_to, reports_to. */
  out: Edge[];
  /** Edges into the subject from bodies that control, oversee, audit or regulate it. */
  in: Edge[];
  /** The body it sits under, when recorded. */
  parent?: string;
  /** For a post: the recorded removal rule and who appoints it. */
  post?: Post;
}

/** Recorded relations saying whom a body or post answers to. */
export function accountability(ix: GraphIndex, id: string): Accountability {
  const post = ix.post.get(id);
  const orgId = post ? post.org : ix.org.has(id) ? id : undefined;
  const ids = [id, ...(orgId && orgId !== id ? [orgId] : [])];
  const out: Edge[] = [];
  const inn: Edge[] = [];
  for (const x of ids) {
    for (const e of ix.out.get(x) ?? []) if (UP_OUT.has(e.type)) out.push(e);
    for (const e of ix.in.get(x) ?? []) if (UP_IN.has(e.type)) inn.push(e);
  }
  const parent = orgId ? ix.org.get(orgId)?.parent : undefined;
  return { org: orgId, out, in: inn, parent, post };
}
