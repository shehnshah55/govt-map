/**
 * Ask: plain questions about the government, in English, Roman Urdu or Urdu, answered only from
 * this graph's own cited records.
 *
 * Modelled on Ask Pakistan (pakistangov.online), which answers questions about government services
 * from official websites with an AI model, links its sources, and says when they don't cover a
 * question. This site can't call a model or any other service (docs/LAUNCH_PLAN.md §0.4), so Ask
 * reads a fixed set of question types with word lists: who holds a post, who appoints it, whom it
 * answers to, what a body does, the law behind it, and where to go for a public service. It finds
 * the record the question names and answers from that record and its sources. When it can't, it
 * says so; it never writes an answer the records don't support. Pure — no DOM.
 */
import type { GraphIndex, Human, Org, Place, Post } from "./graph-index.ts";
import type { LegalRef, ServiceTopic, Source } from "../schema.ts";
import { KIND_LABEL, METHOD_LABEL, REL_PHRASE } from "../ui/labels.ts";
import { redact, type Redaction } from "./redact.ts";

export type Lang = "en" | "ur" | "roman";
export type Intent = "holder" | "appointer" | "accountable" | "about" | "law" | "service";

/** Text, or a link to a record (shown with the record's name unless `text` is given). */
export type Piece = string | { id: string; text?: string };

export interface ServiceMatch {
  topic: ServiceTopic;
  bodies: Org[];
}

export interface Answer {
  /** The question as read, with personal numbers removed. */
  question: string;
  removed: Redaction[];
  lang: Lang;
  intent?: Intent;
  status: "answered" | "ambiguous" | "not_covered" | "empty";
  /** The record the answer is about. */
  subject?: string;
  /** How the question was read, shown so a wrong reading is obvious. */
  readAs?: Piece[];
  /** True when the subject came from a plain search rather than a recognised name. */
  closest?: boolean;
  /** Words the question used that Ask did not recognise, shown so a partial reading is visible. */
  ignored: string[];
  lines: Piece[][];
  sources: Source[];
  laws: LegalRef[];
  /** Other records the question may have meant. */
  choices: string[];
  services: ServiceMatch[];
}

/** Questions to start from, in all three languages. */
export const EXAMPLES: { q: string; lang: Lang }[] = [
  { q: "Who is the Prime Minister?", lang: "en" },
  { q: "Who appoints the Chief Justice of Pakistan?", lang: "en" },
  { q: "CM Punjab kaun hai?", lang: "roman" },
  { q: "پنجاب کا وزیر اعلیٰ کون ہے؟", lang: "ur" },
  { q: "What does NEPRA do?", lang: "en" },
  { q: "Who is the Chief Secretary of Sindh accountable to?", lang: "en" },
  { q: "Passport kaise banwayen?", lang: "roman" },
  { q: "شناختی کارڈ کہاں سے بنتا ہے؟", lang: "ur" },
  { q: "Which law created NAB?", lang: "en" },
  { q: "Who is the MNA for NA-122?", lang: "en" },
];

// ── reading the text ────────────────────────────────────────────────────────

/** Arabic letters often typed for their Urdu forms. */
const FOLD: Record<string, string> = { "ي": "ی", "ى": "ی", "ك": "ک", "ه": "ہ", "ة": "ہ", "ۀ": "ہ", "ۂ": "ہ", "أ": "ا", "إ": "ا", "ٱ": "ا" };

/** Lower-case words with punctuation, Urdu diacritics and joiners removed. Hyphens split words. */
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640\u200B-\u200F\u2060\uFEFF]/g, "")
    .replace(/[يىكهةۀۂأإٱ]/g, (c) => FOLD[c])
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const words = (s: string) => normalize(s).split(" ").filter(Boolean);

/** Words that carry no meaning for finding a record, in all three languages. */
const STOP = new Set(
  (
    "the a an of in on at for to and or is are was were be been by with from s me my i we our you your please tell now today right this that these those it its as " +
    "does do did who what which whom whose how when where why there any all currently present sitting serving can could should may might will would " +
    "ka ki ke ko se hai hain he hy ha kaun kon koun kya kia mein main mujhe mujhay mera meri mere apna apni ne aur ya bhi abhi aaj kal kar karna karta karti karte " +
    "sakta sakti sakte hota hoti hote wala wali wale kis kisi kab koi ab tak par pe liye lye batao batayen btao bataen plz pls " +
    "کا کی کے کو سے ہے ہیں میں نے اور یا بھی ابھی آج کر کرتا کرتی کرتے کس کب کوئی اب تک پر لیے لئے مجھے میرا میری میرے اپنا اپنی ہوتا ہوتی ہوتے والا والی والے سکتا سکتی سکتے کیا کون بتائیں"
  ).split(" "),
);

/** Question words, by what they ask. When a question has several, the highest weight wins. */
const INTENT_WORDS: [Intent, number, string[]][] = [
  ["appointer", 6, ["who appoints", "who appointed", "who chooses", "who selects", "who elects", "who nominates", "who picks", "appointed by", "chosen by", "elected by", "selected by", "appoints", "appointed", "chosen", "elected", "selected", "nominated", "muqarrar", "muqarar", "taqarruri", "taqarrur", "taqarur", "tainati", "lagata", "lagati", "lagate", "chunta", "chunti", "chuna", "chunte", "intikhab", "مقرر", "تقرر", "تقرری", "تعینات", "تعیناتی", "منتخب", "چنتا", "چنا", "لگاتا", "انتخاب"]],
  ["accountable", 6, ["accountable to", "accountable", "answerable to", "answerable", "reports to", "report to", "oversees", "oversee", "oversight", "supervises", "supervise", "who controls", "controls", "who audits", "audits", "audit", "audited", "remove", "removes", "removed", "dismiss", "dismissed", "impeach", "impeachment", "jawabdeh", "jawab deh", "nigrani", "hata sakta", "hata sakti", "hatata", "hatana", "جوابدہ", "جواب دہ", "نگرانی", "ہٹا", "ہٹاتا", "برطرف"]],
  ["law", 5, ["which law", "what law", "legal basis", "under which law", "under what law", "established by", "created by", "set up by", "created", "established", "formed", "kis qanoon", "qanoon", "qanun", "kanoon", "قانون", "آئین"]],
  ["service", 4, ["how do i", "how can i", "how to", "where do i", "where can i", "where to", "apply", "apply for", "renew", "renewal", "register", "get a", "get my", "make a", "lodge", "file a", "contact", "helpline", "website", "kaise", "kese", "kaisay", "kaisy", "kahan", "kahaan", "kidhar", "banwana", "banwani", "banwane", "banwaen", "banwayen", "banwaein", "banta", "banti", "milta", "milti", "کیسے", "کہاں", "کدھر", "بنوانا", "بنوانی", "بنواؤں", "بنوائیں", "بنتا", "بنتی", "ملتا", "ملتی", "درخواست", "تجدید", "رابطہ", "ویب سائٹ"]],
  ["holder", 4, ["who heads", "who leads", "who runs", "who holds", "who is in charge", "in charge", "name of", "kaun", "kon", "koun", "کون", "کس کے پاس"]],
  ["about", 3, ["what is", "what s", "what are", "what does", "what do", "tell me about", "explain", "about", "role of", "function of", "functions of", "kya hai", "kya hain", "kya karta", "kya karti", "kya karte", "ka kaam", "kaam", "zimmedari", "کیا ہے", "کیا کرتا", "کیا کرتی", "کیا کرتے", "کام", "ذمہ داری"]],
  ["holder", 2, ["who is", "who s", "who are", "who", "current"]],
];

/** Words for posts, as post titles use them (the first entry), and how people say them. */
const ROLES: [string, string[]][] = [
  ["deputy prime minister", ["dpm", "deputy pm", "naib wazir e azam", "نائب وزیر اعظم"]],
  ["prime minister", ["pm", "wazir e azam", "wazire azam", "wazir azam", "wazir e aazam", "وزیر اعظم"]],
  ["chief minister", ["cm", "wazir e aala", "wazir e ala", "wazire aala", "wazir aala", "wazir ala", "وزیر اعلی"]],
  ["president", ["sadr", "sadar", "sadr e mumlikat", "sadre mumlikat", "sadar e mumlikat", "صدر", "صدر مملکت"]],
  ["governor", ["گورنر"]],
  ["chief justice", ["cj", "cjp", "چیف جسٹس"]],
  ["deputy speaker", ["ڈپٹی اسپیکر", "ڈپٹی سپیکر"]],
  ["speaker", ["اسپیکر", "سپیکر"]],
  ["deputy chairman", ["ڈپٹی چیئرمین"]],
  ["chairman", ["chairperson", "chair", "چیئرمین", "چیرمین"]],
  ["chief secretary", ["cs", "چیف سیکرٹری", "چیف سیکریٹری"]],
  ["inspector general of police", ["ig", "igp", "ig police", "inspector general", "آئی جی", "آئی جی پی"]],
  ["deputy commissioner", ["dc", "ڈپٹی کمشنر", "ڈی سی"]],
  ["chief commissioner", []],
  ["commissioner", ["کمشنر"]],
  ["secretary", ["سیکرٹری", "سیکریٹری"]],
  ["minister", ["wazir", "وزیر", "ministers"]],
  ["judge", ["judges", "jaj", "جج", "ججز"]],
  ["member of the national assembly", ["mna", "ایم این اے"]],
  ["member of the provincial assembly", ["mpa", "ایم پی اے"]],
  ["senator", ["senators", "سینیٹر"]],
  ["mayor", ["میئر"]],
  ["director general", ["dg", "ڈی جی", "ڈائریکٹر جنرل"]],
  ["auditor general", ["آڈیٹر جنرل"]],
  ["attorney general", ["اٹارنی جنرل"]],
  ["chief election commissioner", ["cec", "چیف الیکشن کمشنر"]],
  ["leader of the opposition", ["opposition leader", "leader of opposition", "قائد حزب اختلاف"]],
  /** The head of whatever body or place is named. */
  ["head", ["chief", "sarbarah", "sarbrah", "سربراہ"]],
];

/** Other names people use for records, beyond the names in the data. */
const EXTRA_NAMES: Record<string, string[]> = {
  "pk-kp": ["kp", "kpk", "pakhtunkhwa", "khyber pakhtoonkhwa", "nwfp", "sarhad", "خیبر پختونخواہ", "پختونخوا"],
  "pk-ba": ["baluchistan", "balochstan"],
  "pk-sd": ["sind"],
  "pk-pb": ["panjab"],
  "pk-ict": ["islamabad", "ict", "اسلام آباد"],
  "pk-gb": ["gb", "gilgit", "گلگت"],
  "pk-ajk": ["ajk", "azad kashmir", "kashmir", "آزاد کشمیر", "کشمیر"],
  pk: ["pakistan", "federal", "federation", "wafaq", "wafaqi", "markaz", "پاکستان", "وفاق", "وفاقی", "مرکز"],
  "pk-sd-div-karachi": ["karachi", "کراچی"],
  "pk-pb-lahore": ["lahore", "لاہور"],
  "pk-kp-peshawar": ["peshawar", "پشاور"],
  "pk-ba-quetta": ["quetta", "کوئٹہ"],
  "pk-pb-rawalpindi": ["rawalpindi", "pindi", "راولپنڈی"],
  "pk-pb-faisalabad": ["faisalabad", "فیصل آباد"],
  "pk-pb-multan": ["multan", "ملتان"],
  "fed-coas": ["coas", "army chief", "آرمی چیف", "سپہ سالار"],
  "fed-cdf": ["cdf"],
  "fed-national-assembly": ["qaumi assembly", "national assembly"],
  "fed-senate": ["senate", "ایوان بالا", "سینیٹ"],
  "constitution-1973": ["constitution", "aain", "آئین"],
};

/** The head of government for each tier, for "who runs Punjab?". */
const PLACE_HEAD: Record<string, string> = {
  pk: "fed-prime-minister",
  "pk-pb": "pb-chief-minister",
  "pk-sd": "sd-chief-minister",
  "pk-kp": "kp-chief-minister",
  "pk-ba": "ba-chief-minister",
  "pk-gb": "gb-chief-minister",
  "pk-ajk": "ajk-prime-minister",
};

/** Leading honorifics and ranks, so "Shehbaz Sharif" finds "Muhammad Shehbaz Sharif". */
const HONORIFICS = new Set("mr mrs ms dr justice syed sardar chaudhry chaudhary mian muhammad mohammad khawaja rana malik lt gen r field marshal admiral air chief marshal general maj brig col".split(" "));

const key = (tokens: string[]) => tokens.join("");
/** A dictionary key: the words without stop words, joined, so spacing and hyphens don't matter. */
const contentKey = (s: string) => key(words(s).filter((w) => !STOP.has(w)));
const fullKey = (s: string) => key(words(s));

interface Lexicon {
  /** Record names and role words (content keys): record ids, or the role. */
  names: Map<string, { ids?: string[]; role?: string }>;
  intents: Map<string, [Intent, number]>;
  /** Service keywords (full keys) → topic ids. */
  services: Map<string, string[]>;
}

const cache = new WeakMap<GraphIndex, Lexicon>();

function lexicon(ix: GraphIndex): Lexicon {
  const hit = cache.get(ix);
  if (hit) return hit;
  const names = new Map<string, { ids?: string[]; role?: string }>();
  for (const [role, variants] of ROLES) for (const v of [role, ...variants]) names.set(contentKey(v), { role });
  const roleKeys = new Set(names.keys());
  // a role word is never also a name: "Governor" is a post title, but people mean the role
  const add = (name: string | undefined, id: string) => {
    if (!name) return;
    const k = contentKey(name);
    if (k.length < 2 || roleKeys.has(k)) return;
    const ids = names.get(k)?.ids ?? [];
    if (!ids.includes(id)) names.set(k, { ids: [...ids, id] });
  };
  for (const o of ix.g.organizations) [o.name, o.short_name, o.name_ur].forEach((n) => add(n, o.id));
  for (const j of ix.g.jurisdictions) {
    [j.name, j.name_ur].forEach((n) => add(n, j.id));
    // "Lahore District" is also "Lahore"; the district and the division then share the name
    if (j.kind === "district" || j.kind === "division") add(j.name.replace(/\s+(District|Division)$/i, ""), j.id);
  }
  const partial: [string, string][] = [];
  for (const p of ix.g.people) {
    [p.name, p.name_ur].forEach((n) => add(n, p.id));
    const parts = words(p.name);
    let i = 0;
    while (i < parts.length - 2 && HONORIFICS.has(parts[i])) i++;
    add(parts.slice(i).join(" "), p.id);
    if (parts.length - i >= 3) partial.push([parts.slice(i, i + 2).join(" "), p.id], [parts.slice(-2).join(" "), p.id]);
  }
  const titles = new Map<string, number>();
  for (const p of ix.g.positions) titles.set(p.title, (titles.get(p.title) ?? 0) + 1);
  for (const p of ix.g.positions) if (titles.get(p.title) === 1 && words(p.title).filter((w) => !STOP.has(w)).length >= 2) add(p.title, p.id);
  for (const l of ix.g.laws) [l.title, l.short].forEach((n) => add(n, l.id));
  for (const [id, variants] of Object.entries(EXTRA_NAMES)) if (ix.kindOf(id)) for (const v of variants) add(v, id);
  // "Maryam Nawaz" for "Maryam Nawaz Sharif", unless the two words are someone's whole name
  for (const [name, id] of partial) if (!names.has(contentKey(name))) add(name, id);
  const intents = new Map<string, [Intent, number]>();
  for (const [intent, weight, phrases] of INTENT_WORDS) for (const p of phrases) if (!intents.has(fullKey(p))) intents.set(fullKey(p), [intent, weight]);
  const services = new Map<string, string[]>();
  for (const s of ix.g.services ?? []) for (const kw of s.keywords) services.set(fullKey(kw), [...(services.get(fullKey(kw)) ?? []), s.id]);
  const lex = { names, intents, services };
  cache.set(ix, lex);
  return lex;
}

/** Longest-first matches of word runs against a dictionary, left to right, without overlap. */
function scan<T>(tokens: string[], dict: Map<string, T>, maxN = 7): { at: number; n: number; value: T }[] {
  const out: { at: number; n: number; value: T }[] = [];
  for (let i = 0; i < tokens.length; ) {
    let found: { at: number; n: number; value: T } | undefined;
    for (let n = Math.min(maxN, tokens.length - i); n >= 1 && !found; n--) {
      const v = dict.get(key(tokens.slice(i, i + n)));
      if (v !== undefined) found = { at: i, n, value: v };
    }
    if (found) {
      out.push(found);
      i += found.n;
    } else i++;
  }
  return out;
}

export function detectLang(text: string): Lang {
  if (/[\u0600-\u06FF]/.test(text)) return "ur";
  return /\b(kaun|kon|koun|kya|kia|hai|hain|kaise|kese|kahan|kahaan|ka|ki|ke|ko|mein|wazir|sadr|banwana|banwayen|banta|milta|batao)\b/i.test(text) ? "roman" : "en";
}

// ── finding the record ──────────────────────────────────────────────────────

interface Reading {
  intent?: Intent;
  /** Records named, in order. */
  named: string[][];
  role?: string;
  /** Words left over once names, roles, question words and stop words are taken out. */
  rest: string[];
  services: string[];
}

function read(ix: GraphIndex, text: string): Reading {
  const lex = lexicon(ix);
  const all = words(text);
  let intent: Intent | undefined;
  let best = 0;
  const intentTokens = new Set<number>();
  for (const m of scan(all, lex.intents)) {
    const [i, w] = m.value;
    for (let k = m.at; k < m.at + m.n; k++) intentTokens.add(k);
    if (w > best) [intent, best] = [i, w];
  }
  const services = [...new Set(scan(all, lex.services).flatMap((m) => m.value))];
  // names and roles are read from the content words only
  const content = all.map((w, i) => ({ w, i })).filter((t) => !STOP.has(t.w));
  const tokens = content.map((t) => t.w);
  const named: string[][] = [];
  let role: string | undefined;
  const used = new Set<number>();
  for (const m of scan(tokens, lex.names)) {
    if (m.value.ids) named.push(m.value.ids);
    else if (m.value.role && !role) role = m.value.role;
    else continue;
    for (let k = m.at; k < m.at + m.n; k++) used.add(content[k].i);
  }
  const rest = all.filter((w, i) => !used.has(i) && !intentTokens.has(i) && !STOP.has(w) && w.length > 1);
  return { intent, named, role, rest, services };
}

/** Words in a title that make it a different post from the role named. */
const NOT_THE_ROLE = /\b(deputy|additional|adviser|advisor|special assistant|principal secretary|parliamentary secretary|focal person|naib|vice)\b/;

function trailDepth(ix: GraphIndex, p: Post) {
  return ix.placeTrail(ix.org.get(p.org)?.jurisdiction ?? "").length;
}

/** Posts matching a role word, within the bodies or places named, best first. */
function postsForRole(ix: GraphIndex, role: string, scope: string[], rest: string[]): { posts: Post[]; scored: boolean; usedRest: boolean } {
  if (role === "head") {
    const heads = scope.map((id) => headOf(ix, id)).filter((x): x is string => !!x);
    return { posts: [...new Set(heads)].map((id) => ix.post.get(id)!), scored: false, usedRest: false };
  }
  const roleWords = normalize(role);
  const orgs = new Set(scope.filter((id) => ix.org.has(id)).flatMap((id) => [id, ...ix.descendants(id).map((o) => o.id)]));
  const places = scope.filter((id) => ix.place.has(id));
  const inScope = (p: Post) => {
    if (!scope.length) return true;
    if (orgs.has(p.org)) return true;
    const trail = ix.placeTrail(ix.org.get(p.org)?.jurisdiction ?? "").map((j) => j.id);
    return places.some((pl) => trail.includes(pl)) || (!!p.area && places.includes(p.area));
  };
  const hay = (p: Post) => {
    const o = ix.org.get(p.org);
    return normalize(`${p.title} ${o?.name ?? ""} ${o?.short_name ?? ""} ${ix.place.get(o?.jurisdiction ?? "")?.name ?? ""}`);
  };
  const match = (p: Post, extra: string[]) => {
    const t = ` ${normalize(p.title)} `;
    // "Prime Minister's Office" staff are not the Prime Minister
    if (!t.includes(` ${roleWords} `) || t.includes(` ${roleWords} s `)) return false;
    if (!NOT_THE_ROLE.test(roleWords) && NOT_THE_ROLE.test(t.replace(` ${roleWords} `, " "))) return false;
    if (!inScope(p)) return false;
    const h = ` ${hay(p)} `;
    return extra.every((w) => h.includes(` ${w}`));
  };
  let posts = ix.g.positions.filter((p) => match(p, rest));
  const usedRest = posts.length > 0 && rest.length > 0;
  if (!posts.length && rest.length) posts = ix.g.positions.filter((p) => match(p, []));
  const exactPlace = new Set(places);
  const score = (p: Post) => {
    const t = normalize(p.title);
    const jur = ix.org.get(p.org)?.jurisdiction ?? "";
    return (t.startsWith(roleWords) ? 10 : 0) + (exactPlace.has(jur) || (p.area && exactPlace.has(p.area)) ? 8 : 0) + (p.generated ? 0 : 3) - trailDepth(ix, p);
  };
  return { posts: posts.sort((a, b) => score(b) - score(a) || a.title.localeCompare(b.title)), scored: true, usedRest };
}

/** With no body or place named: the national post if there is exactly one, else undecided. */
function nationalPick(ix: GraphIndex, role: string, posts: Post[]): Post | undefined {
  const r = normalize(role);
  const ofPakistan = posts.filter((p) => / of pakistan$/.test(normalize(p.title)) && normalize(p.title).startsWith(r));
  if (ofPakistan.length === 1) return ofPakistan[0];
  // a bare title ("Governor", of the State Bank) belongs to its body, so it is never the default
  const federal = posts.filter((p) => ix.org.get(p.org)?.jurisdiction === "pk" && normalize(p.title) !== r);
  return federal.length === 1 ? federal[0] : undefined;
}

/**
 * A record's name for display. A bare post title ("Chairman", "Governor") is shared or means
 * little alone, so it is followed by its body's name.
 */
export function displayName(ix: GraphIndex, id: string): string {
  const p = ix.post.get(id);
  if (!p) return ix.label(id);
  const t = normalize(p.title);
  const bare = !/ of |,/.test(` ${p.title} `) && (t.split(" ").length <= 2 || ix.g.positions.filter((x) => x.title === p.title).length > 1);
  return bare ? `${p.title}, ${ix.shortLabel(p.org)}` : p.title;
}

/** The head post of a body, or of a place's government or field office. */
export function headOf(ix: GraphIndex, id: string): string | undefined {
  if (ix.post.has(id)) return id;
  if (ix.org.has(id)) return ix.leadership(id)[0]?.id;
  const place = ix.place.get(id);
  if (!place) return undefined;
  if (PLACE_HEAD[id] && ix.post.has(PLACE_HEAD[id])) return PLACE_HEAD[id];
  if (place.kind === "constituency") return ix.g.positions.find((p) => p.area === id)?.id;
  const office = (ix.orgsByPlace.get(id) ?? []).find((o) => o.kind === "field_administration");
  return office ? ix.leadership(office.id)[0]?.id : undefined;
}

/** "Lahore" is both a district and a division; people usually mean the district. */
const PLACE_ORDER = ["country", "federal_capital", "province", "special_territory", "district", "division", "constituency"];

function resolve(ix: GraphIndex, r: Reading): { subject?: string; choices: string[]; ambiguous?: boolean; closest?: boolean; usedRest?: boolean } {
  const flat = r.named.flat();
  const posts = flat.filter((id) => ix.post.has(id));
  if (posts.length && !r.role) return { subject: posts[0], choices: posts.slice(1) };
  if (r.role) {
    const scope = flat.filter((id) => ix.org.has(id) || ix.place.has(id));
    const { posts: found, scored, usedRest } = postsForRole(ix, r.role, scope, r.rest);
    if (found.length === 1 || (found.length && (scope.length || !scored))) return { subject: found[0].id, choices: found.slice(1, 8).map((p) => p.id), usedRest };
    if (found.length) {
      const pick = nationalPick(ix, r.role, found);
      if (pick) return { subject: pick.id, choices: found.filter((p) => p !== pick).slice(0, 7).map((p) => p.id), usedRest };
      return { choices: found.slice(0, 10).map((p) => p.id), ambiguous: true, usedRest };
    }
  }
  if (posts.length) return { subject: posts[0], choices: posts.slice(1) };
  // a body or person beats a place: "Punjab Police" names Punjab too, but is about the police
  const order = ["organization", "person", "law", "jurisdiction"] as const;
  for (const kind of order) {
    const group = r.named.find((ids) => ids.some((id) => ix.kindOf(id) === kind));
    if (!group) continue;
    const ids = group.filter((id) => ix.kindOf(id) === kind);
    // several bodies share a short name (four provincial PDMAs): prefer the one in the place named
    const places = flat.filter((id) => ix.place.has(id));
    const inPlace = ids.filter((id) => ix.org.has(id) && places.some((pl) => ix.placeTrail(ix.org.get(id)!.jurisdiction).some((j) => j.id === pl)));
    if (kind === "jurisdiction") ids.sort((a, b) => PLACE_ORDER.indexOf(ix.place.get(a)!.kind) - PLACE_ORDER.indexOf(ix.place.get(b)!.kind));
    // "police in Punjab": the body in the place named, before the place itself
    if (kind === "jurisdiction" && r.rest.length) {
      const within = ix.search(r.rest.join(" "), 30).find((x) => (x.kind === "organization" || x.kind === "position") && ix.placeTrail(ix.org.get(ix.post.get(x.id)?.org ?? x.id)?.jurisdiction ?? "").some((j) => ids.includes(j.id)));
      if (within) return { subject: within.id, choices: [], usedRest: true };
    }
    const pick = inPlace[0] ?? (ids.length === 1 || kind === "jurisdiction" ? ids[0] : undefined);
    if (pick) return { subject: pick, choices: ids.filter((id) => id !== pick) };
    return { choices: ids, ambiguous: true };
  }
  // a plain search on leftover words, as a last resort: only words long enough to mean something
  const words3 = r.rest.filter((w) => w.length >= 3);
  if (words3.length) {
    const found = ix.search(words3.join(" "), 6);
    if (found.length) return { subject: found[0].id, choices: found.slice(1).map((x) => x.id), closest: true, usedRest: true };
  }
  return { choices: [] };
}

// ── answering ───────────────────────────────────────────────────────────────

const STATUS_PHRASE: Record<string, string> = {
  acting: "acting",
  additional_charge: "holding additional charge",
  caretaker: "caretaker",
  interim: "interim",
  holding_over: "holding over after the term ended",
};

const article = (s: string) => (/^[aeiou]/i.test(s) ? "an" : "a");

class Builder {
  lines: Piece[][] = [];
  sources: Source[] = [];
  laws: LegalRef[] = [];
  constructor(readonly ix: GraphIndex) {}
  line(...p: (Piece | false | undefined)[]) {
    const kept = p.filter((x): x is Piece => !!x);
    if (kept.length) this.lines.push(kept);
  }
  source(s: Source | undefined) {
    if (s && !this.sources.some((x) => x.title === s.title && x.url === s.url)) this.sources.push(s);
  }
  law(l: LegalRef) {
    if (!this.laws.some((x) => x.law === l.law && x.provision === l.provision)) this.laws.push(l);
  }
}

function holders(b: Builder, postId: string) {
  const { ix } = b;
  const post = ix.post.get(postId)!;
  const direct = ix.currentHolders(postId);
  const held = ix.effectiveHolders(postId);
  if (!direct.length && held.length && post.ex_officio_of) b.line({ id: postId }, " is held ex officio by the ", { id: post.ex_officio_of }, ".");
  if (!held.length) {
    if (post.seats) b.line({ id: postId }, ` has ${post.seats} seats. Members are listed on the post's page.`);
    else if (post.vacant) b.line({ id: postId }, " is recorded as vacant.");
    else b.line("No current holder of ", { id: postId }, " is recorded yet.");
    post.sources?.forEach((s) => b.source(s));
    return;
  }
  for (const h of held.slice(0, 12)) {
    const role = h.person.roles.find((r) => r.position === (direct.length ? postId : post.ex_officio_of) && !r.until);
    b.line({ id: h.person.id }, " holds the post", h.since && `, since ${h.since}`, STATUS_PHRASE[h.status] && ` (${STATUS_PHRASE[h.status]})`, ".");
    b.source(role?.source);
  }
  if (held.length > 12) b.line(`And ${held.length - 12} more, listed on the post's page.`);
  const checked = held.map((h) => h.person.as_of).sort()[0];
  const shaky = held.filter((h) => h.person.confidence !== "high");
  b.line(`Record last checked ${checked}.`, shaky.length ? " Part of this record still needs checking against an official source." : "");
  post.sources?.forEach((s) => b.source(s));
}

const METHOD_PHRASE: Record<string, string> = {
  direct_election: "elected by",
  indirect_election: "elected by",
  appointment: "appointed by",
  appointment_on_advice: "appointed by",
  selection: "selected by",
  nomination: "nominated by",
  ex_officio: "held ex officio",
  promotion: "filled by promotion, made by",
  posting: "filled by a civil-service posting made by",
};

function appointer(b: Builder, postId: string) {
  const { ix } = b;
  const post = ix.post.get(postId)!;
  const a = post.appointment;
  if (post.ex_officio_of && !a) {
    b.line({ id: postId }, " is held ex officio by the ", { id: post.ex_officio_of }, ", so whoever fills that post fills this one.");
    return;
  }
  if (!a) {
    b.line("How ", { id: postId }, " is filled is not recorded yet.");
    return;
  }
  if (a.by) b.line({ id: postId }, ` is ${METHOD_PHRASE[a.method] ?? "filled by"} `, { id: a.by }, a.on_advice_of && ", on the advice of ", a.on_advice_of && { id: a.on_advice_of }, ".");
  else b.line({ id: postId }, `: ${METHOD_LABEL[a.method]?.toLowerCase() ?? a.method}.`);
  if (a.nominated_by) b.line("Nominated by ", { id: a.nominated_by }, ".");
  if (a.consultation?.length) b.line("After consulting ", ...a.consultation.flatMap((id, i) => [i ? (i === a.consultation!.length - 1 ? " and " : ", ") : "", { id }]), ".");
  if (a.confirmation) b.line("Confirmed by ", { id: a.confirmation }, ".");
  if (a.term) b.line(`Term: ${a.term}.`);
  if (a.removal) b.line(`Removal: ${a.removal}`);
  if (a.notes) b.line(a.notes);
  const chain = ix.appointmentChain(postId);
  if (chain.length > 1) b.line("Chain of authority: ", { id: postId }, ...chain.flatMap((c) => [` ${c.via} `, { id: c.id }]), ".");
  a.legal_basis?.forEach((l) => b.law(l));
  post.sources?.forEach((s) => b.source(s));
}

/** Bodies that stand for a whole government: everything in it is overseen by them, so they say little about one post. */
const BROAD = new Set(["state", "cabinet"]);
const ACCOUNT_OUT = new Set(["accountable_to", "reports_to", "administrative_control"]);
const ACCOUNT_IN = new Set(["oversees", "audits", "regulates"]);

/** "Who appoints the DC?" names 160 posts: say how they are filled, grouped by who fills them. */
function appointerSummary(b: Builder, posts: Post[]) {
  const groups = new Map<string, Post[]>();
  for (const p of posts) {
    const a = p.appointment;
    const k = a ? `${a.method}|${a.by ?? ""}|${a.on_advice_of ?? ""}` : "none";
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const [k, ps] of [...groups].sort((x, y) => y[1].length - x[1].length).slice(0, 8)) {
    const a = ps[0].appointment;
    const which: Piece[] = ps.length === 1 ? [{ id: ps[0].id }] : [`${ps.length} posts, such as `, { id: ps[0].id }, ","];
    if (k === "none") b.line(...which, " are not yet recorded with how they are filled.");
    else if (a?.by) b.line(...which, ` ${ps.length === 1 ? "is" : "are"} ${METHOD_PHRASE[a.method] ?? "filled by"} `, { id: a.by }, a.on_advice_of && ", on the advice of ", a.on_advice_of && { id: a.on_advice_of }, ".");
    else b.line(...which, `: ${METHOD_LABEL[a!.method]?.toLowerCase()}.`);
    ps.forEach((p) => p.appointment?.legal_basis?.forEach((l) => b.law(l)));
  }
  if (groups.size > 8) b.line(`${groups.size - 8} more patterns are on the posts' pages.`);
}

/** Sources for an answer: those gathered, then the text of each law cited. */
function lawSources(ix: GraphIndex, b: Builder): Source[] {
  for (const l of b.laws) {
    const law = ix.law.get(l.law);
    if (law?.url) b.source({ title: law.short ?? law.title, url: law.url });
  }
  return b.sources;
}

function accountable(b: Builder, id: string) {
  const { ix } = b;
  const post = ix.post.get(id);
  const org = post ? ix.org.get(post.org) : undefined;
  const ids = post && org && !BROAD.has(org.kind) ? [id, post.org] : [id];
  let found = 0;
  if (post?.appointment?.by) {
    b.line({ id }, ` is ${METHOD_PHRASE[post.appointment.method] ?? "filled by"} `, { id: post.appointment.by }, post.appointment.on_advice_of && ", on the advice of ", post.appointment.on_advice_of && { id: post.appointment.on_advice_of }, ".");
    post.appointment.legal_basis?.forEach((l) => b.law(l));
  }
  if (post?.appointment?.removal) {
    b.line(`Removal: ${post.appointment.removal}`);
    found++;
  }
  for (const x of ids) {
    for (const e of ix.out.get(x) ?? []) {
      // a body's parent is part of its line of accountability; a post's body's parent says little
      if (!ACCOUNT_OUT.has(e.type) && !(e.type === "part_of" && x === id && !post)) continue;
      b.line({ id: x }, ` ${REL_PHRASE[e.type][0]} `, { id: e.to }, e.description ? `: ${e.description}` : ".");
      e.legal_basis?.forEach((l) => b.law(l));
      found++;
    }
    for (const e of ix.in.get(x) ?? []) {
      if (!ACCOUNT_IN.has(e.type)) continue;
      b.line({ id: e.from }, ` ${REL_PHRASE[e.type][0]} `, { id: x }, e.description ? `: ${e.description}` : ".");
      e.legal_basis?.forEach((l) => b.law(l));
      found++;
    }
  }
  if (!found) b.line("No other accountability links are recorded for ", { id }, " yet.");
}

function legalBasis(b: Builder, id: string) {
  const { ix } = b;
  const rec = ix.org.get(id) ?? ix.post.get(id);
  const basis = ix.org.get(id)?.legal_basis ?? ix.post.get(id)?.appointment?.legal_basis ?? [];
  if (!rec) {
    b.line("No legal basis is recorded for ", { id }, ".");
    return;
  }
  if (basis.length) b.line({ id }, " rests on ", ...basis.flatMap((l, i) => [i ? "; " : "", { id: l.law }, l.provision ? ` ${l.provision}` : ""]), ".");
  for (const h of [...(rec.history ?? [])].sort((x, y) => x.year - y.year)) b.line(`${h.year}: `, { id: h.law }, h.provision ? ` ${h.provision}` : "", ` — ${h.change}`);
  basis.forEach((l) => b.law(l));
  if (!basis.length && !rec.history?.length) b.line("No legal basis is recorded for ", { id }, " yet.");
}

function aboutOrg(b: Builder, o: Org) {
  const { ix } = b;
  const kind = KIND_LABEL[o.kind].toLowerCase();
  b.line({ id: o.id }, o.short_name && o.short_name !== o.name ? ` (${o.short_name})` : "", ` is ${article(kind)} ${kind}`, o.kind === "political_party" ? "" : " of ", o.kind === "political_party" ? "" : { id: o.jurisdiction }, o.parent && ", part of ", o.parent && { id: o.parent }, ".");
  if (o.description) b.line(o.description);
  if (o.functions?.length) b.line(`Functions: ${o.functions.join("; ")}.`);
  const head = ix.leadership(o.id)[0];
  if (head) {
    const h = ix.effectiveHolders(head.id)[0];
    b.line("Head: ", { id: head.id }, h ? " — " : ", no holder recorded", h ? { id: h.person.id } : "", ".");
  }
  if (o.abolished) b.line(`Abolished ${o.abolished}.`);
  o.legal_basis?.forEach((l) => b.law(l));
  o.sources?.forEach((s) => b.source(s));
  if (o.website) b.source({ title: `${o.short_name ?? o.name}: official website`, url: o.website });
}

function aboutPerson(b: Builder, p: Human) {
  const current = p.roles.filter((r) => !r.until);
  b.line({ id: p.id }, p.party ? ", of " : "", p.party ? { id: p.party } : "", current.length ? `, holds ${current.length === 1 ? "one post" : `${current.length} posts`} in the graph.` : ", holds no current post in the graph.");
  for (const r of current) {
    b.line({ id: r.position }, r.since ? `, since ${r.since}` : "", STATUS_PHRASE[r.status] ? ` (${STATUS_PHRASE[r.status]})` : "", ".");
    b.source(r.source);
  }
  const past = p.roles.filter((r) => r.until);
  if (past.length) b.line(`${past.length} earlier ${past.length === 1 ? "post is" : "posts are"} on their page.`);
  b.line(`Record last checked ${p.as_of}.`);
}

function aboutPlace(b: Builder, pl: Place) {
  const kind = pl.kind.replace(/_/g, " ");
  b.line({ id: pl.id }, ` is ${article(kind)} ${kind}`, pl.parent ? " in " : "", pl.parent ? { id: pl.parent } : "", ".");
  const head = headOf(b.ix, pl.id);
  if (head) holders(b, head);
}

function aboutLaw(b: Builder, id: string) {
  const l = b.ix.law.get(id)!;
  b.line({ id }, l.year ? ` (${l.year})` : "", ".");
  if (l.summary) b.line(l.summary);
  const bodies = b.ix.enactedBodies(id);
  if (bodies.length) b.line(`${bodies.length} ${bodies.length === 1 ? "body is" : "bodies are"} established under it, listed on its page.`);
  if (l.url) b.source({ title: l.short ?? l.title, url: l.url });
}

function aboutPost(b: Builder, p: Post) {
  b.line({ id: p.id }, " is a post in ", { id: p.org }, ".");
  if (p.description) b.line(p.description);
  holders(b, p.id);
}

/** Answers a question from the graph. */
export function ask(ix: GraphIndex, input: string): Answer {
  const { text, removed } = redact(input.slice(0, 300));
  // the search box removes numbers before Ask sees them; its placeholders still say what went
  for (const [, kind] of text.matchAll(/\[(CNIC|passport number|phone number|email address|long number) removed\]/g)) if (!removed.includes(kind as Redaction)) removed.push(kind as Redaction);
  const question = text.trim();
  const lang = detectLang(question);
  const base: Answer = { question, removed, lang, status: "empty", lines: [], sources: [], laws: [], choices: [], services: [], ignored: [] };
  if (!normalize(question)) return base;
  const r = read(ix, question.replace(/\[[^\]]* removed\]/g, " "));
  const found = resolve(ix, r);
  const services: ServiceMatch[] = r.services
    .map((id) => ix.g.services.find((s) => s.id === id)!)
    .map((topic) => ({ topic, bodies: topic.bodies.map((id) => ix.org.get(id)).filter((o): o is Org => !!o) }));
  const b = new Builder(ix);

  // a service question, or a service word with nothing else recognised
  if (services.length && (r.intent === "service" || !r.intent || !found.subject || found.closest)) {
    for (const s of services) for (const o of s.bodies) if (o.website) b.source({ title: `${o.short_name ?? o.name}: official website`, url: o.website });
    return { ...base, intent: "service", status: "answered", readAs: ["Where to go for: ", services.map((s) => s.topic.title).join("; ")], services, sources: b.sources };
  }
  if (found.ambiguous && r.intent === "appointer" && found.choices.every((id) => ix.post.has(id))) {
    const all = r.role ? postsForRole(ix, r.role, [], r.rest).posts : found.choices.map((id) => ix.post.get(id)!);
    appointerSummary(b, all);
    return { ...base, intent: "appointer", status: "answered", readAs: [`How ${all.length} posts titled “${r.role ?? "…"}” are filled`], lines: b.lines, laws: b.laws, sources: lawSources(ix, b), choices: found.choices };
  }
  if (found.ambiguous) return { ...base, intent: r.intent, status: "ambiguous", choices: found.choices, readAs: r.role ? [`Several posts match “${r.role}”`] : ["Several records match"] };
  if (!found.subject) {
    const near = r.rest.length ? ix.search(r.rest.join(" "), 5).map((x) => x.id) : [];
    return { ...base, intent: r.intent, status: "not_covered", choices: near };
  }

  const subject = found.subject;
  const kind = ix.kindOf(subject)!;
  let intent: Intent = r.intent ?? (kind === "position" || kind === "jurisdiction" ? "holder" : "about");
  // a "how do I…" question about a body, with no service topic: say what the body is and link its site
  if (intent === "service") intent = "about";
  let readAs: Piece[];
  const headOrSelf = headOf(ix, subject);
  switch (intent) {
    case "holder":
      if (kind === "person") {
        aboutPerson(b, ix.person.get(subject)!);
        readAs = ["Who is ", { id: subject }];
      } else if (kind === "law") {
        aboutLaw(b, subject);
        readAs = ["About ", { id: subject }];
      } else if (headOrSelf) {
        holders(b, headOrSelf);
        readAs = ["Who holds ", { id: headOrSelf }];
      } else {
        b.line("No head post is recorded for ", { id: subject }, ".");
        readAs = ["Who heads ", { id: subject }];
      }
      break;
    case "appointer": {
      const post = kind === "person" ? ix.person.get(subject)!.roles.find((x) => !x.until)?.position : headOrSelf;
      if (post) {
        appointer(b, post);
        readAs = ["Who appoints ", { id: post }];
      } else {
        b.line("No post is recorded for ", { id: subject }, ", so there is no appointment to describe.");
        readAs = ["Who appoints ", { id: subject }];
      }
      break;
    }
    case "accountable": {
      const target = kind === "jurisdiction" ? (headOrSelf ?? subject) : kind === "person" ? (ix.person.get(subject)!.roles.find((x) => !x.until)?.position ?? subject) : subject;
      accountable(b, target);
      readAs = ["Whom ", { id: target }, " answers to"];
      break;
    }
    case "law": {
      const target = kind === "person" ? (ix.person.get(subject)!.roles.find((x) => !x.until)?.position ?? subject) : kind === "jurisdiction" ? (headOrSelf ?? subject) : subject;
      if (kind === "law") aboutLaw(b, subject);
      else legalBasis(b, target);
      readAs = ["The law behind ", { id: target }];
      break;
    }
    default:
      if (kind === "organization") aboutOrg(b, ix.org.get(subject)!);
      else if (kind === "person") aboutPerson(b, ix.person.get(subject)!);
      else if (kind === "jurisdiction") aboutPlace(b, ix.place.get(subject)!);
      else if (kind === "position") aboutPost(b, ix.post.get(subject)!);
      else aboutLaw(b, subject);
      readAs = ["About ", { id: subject }];
  }
  // every answer says something, even if only that the record holds nothing more
  if (!b.lines.length) b.line("Nothing more is recorded about ", { id: subject }, " yet.");
  b.sources = lawSources(ix, b);
  const ignored = found.usedRest ? [] : r.rest;
  return { ...base, intent, status: "answered", subject, readAs, closest: found.closest, ignored, lines: b.lines, sources: b.sources, laws: b.laws, choices: found.choices };
}

/** Whether text typed in the search box reads as a question, so Enter opens Ask instead of search. */
export function isQuestion(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  if (/[?؟]\s*$/.test(text)) return true;
  if (/^(who|whom|what|which|how|where|when|why|is|are|does|do|can|kaun|kon|koun|kya|kia|kaise|kahan)\b/.test(t)) return true;
  return /(^| )(kaun|kon|kya|kaise|kahan|کون|کیا|کیسے|کہاں|کس)( |$)/.test(t);
}

/** Government domains, as used by federal and provincial sites. */
const GOV_DOMAIN = /\.(gov|gop|gos|gob|gkp|gog|ajk)\.pk$/;

const officialHosts = new WeakMap<GraphIndex, Set<string>>();

/**
 * Whether a link is an official government source: a government domain, or the website a public
 * body in the graph lists as its own (sbp.org.pk, nepra.org.pk). Party websites are not official.
 */
export function isOfficialUrl(ix: GraphIndex, url: string | undefined): boolean {
  let host: string;
  try {
    host = new URL(url ?? "").hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
  if (GOV_DOMAIN.test(host) || host === "gov.pk") return true;
  let hosts = officialHosts.get(ix);
  if (!hosts) {
    hosts = new Set(
      ix.g.organizations
        .filter((o) => o.website && o.kind !== "political_party")
        .map((o) => {
          try {
            return new URL(o.website!).hostname.replace(/^www\./, "");
          } catch {
            return "";
          }
        })
        .filter(Boolean),
    );
    officialHosts.set(ix, hosts);
  }
  return hosts.has(host);
}
