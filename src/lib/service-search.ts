/**
 * Find a service: search over the service index (data/service-index/), in the browser.
 * A small inverted index of our own: no library, no network. Terms are folded the same way as
 * the official-websites search (src/lib/find.ts), so English, Urdu and Roman Urdu spellings meet,
 * and service synonyms (shanakhti card / CNIC, domicile / ڈومیسائل …) widen the query.
 */
import type { ServiceItem, ServiceKind } from "../schema.ts";
import { keyTerms } from "./find.ts";

/**
 * Words people use for the same service. Each group is a set of interchangeable phrases. A group
 * with a `kind` also says what sort of page the person wants (a fee table, a form …).
 */
export const SERVICE_SYNONYMS: { phrases: string[]; kind?: ServiceKind }[] = [
  { phrases: ["cnic", "id card", "identity card", "national identity card", "shanakhti card", "shnakhti card", "shanakhti", "شناختی کارڈ", "شناختی", "smart card", "nicop"] },
  { phrases: ["domicile", "domicil", "domisile", "dumisail", "domicile certificate", "ڈومیسائل", "ڈومیسائل سرٹیفکیٹ"] },
  { phrases: ["passport", "pasport", "e-passport", "machine readable passport", "پاسپورٹ"] },
  { phrases: ["visa", "ویزا", "e-visa"] },
  { phrases: ["fee", "fees", "charges", "tariff", "rates", "fis", "فیس", "فیسیں", "kitni fees"], kind: "fee" },
  { phrases: ["form", "forms", "proforma", "performa", "application form", "فارم"], kind: "form" },
  { phrases: ["helpline", "contact", "phone number", "address", "office", "rabta", "رابطہ", "ہیلپ لائن", "uan"], kind: "contact" },
  { phrases: ["complaint", "shikayat", "grievance", "شکایت"], kind: "contact" },
  { phrases: ["procedure", "process", "how to", "tareeqa", "tarika", "طریقہ", "طریقہ کار", "requirements", "documents required", "eligibility", "ahliyat", "اہلیت"], kind: "procedure" },
  { phrases: ["notification", "circular", "sro", "gazette", "notice", "اعلامیہ", "نوٹیفکیشن"], kind: "notification" },
  { phrases: ["ntn", "national tax number", "tax number", "ٹیکس نمبر", "tax registration", "income tax registration"] },
  { phrases: ["fbr", "federal board of revenue", "inland revenue", "iris"] },
  { phrases: ["tax", "taxes", "tex", "ٹیکس", "income tax", "filer", "atl", "active taxpayer"] },
  { phrases: ["licence", "license", "laisans", "lisens", "لائسنس"] },
  { phrases: ["driving licence", "driving license", "dl", "ڈرائیونگ لائسنس", "gari ka licence"] },
  { phrases: ["vehicle registration", "car registration", "gari registration", "motor vehicle", "token tax", "گاڑی"] },
  { phrases: ["birth certificate", "pedaish", "paidaish", "پیدائش", "b-form", "b form", "child registration"] },
  { phrases: ["death certificate", "wafat", "وفات"] },
  { phrases: ["marriage", "nikah", "nikahnama", "نکاح", "marriage certificate", "divorce", "talaq", "طلاق"] },
  { phrases: ["electricity", "bijli", "بجلی", "power", "wapda"] },
  { phrases: ["bill", "bil", "بل", "duplicate bill"] },
  { phrases: ["gas", "sui gas", "گیس"] },
  { phrases: ["water", "pani", "پانی", "sewerage"] },
  { phrases: ["land record", "fard", "فرد", "jamabandi", "intiqal", "mutation", "انتقال", "property record"] },
  { phrases: ["property", "jaidad", "جائیداد", "plot", "house"] },
  { phrases: ["pension", "پنشن", "pensioner"] },
  { phrases: ["scholarship", "wazifa", "وظیفہ", "stipend"] },
  { phrases: ["admission", "dakhla", "داخلہ"] },
  { phrases: ["noc", "no objection certificate", "این او سی"] },
  { phrases: ["police", "polis", "پولیس", "fir", "ایف آئی آر"] },
  { phrases: ["character certificate", "police certificate", "police clearance", "کریکٹر سرٹیفکیٹ"] },
  { phrases: ["arms licence", "arms license", "weapon licence", "اسلحہ لائسنس"] },
  { phrases: ["zakat", "زکوٰۃ", "zakaat"] },
  { phrases: ["hajj", "حج", "umrah"] },
  { phrases: ["jobs", "naukri", "نوکری", "recruitment", "vacancies"] },
  { phrases: ["e-stamp", "estamp", "stamp paper", "اسٹامپ"] },
  { phrases: ["citizenship", "shehriyat", "شہریت", "nationality", "naturalization"] },
  { phrases: ["renew", "renewal", "tajdeed", "تجدید"] },
];

export interface ServiceHit {
  item: ServiceItem;
  score: number;
}

type Posting = Map<number, number>; // doc → weight

/** Plural folding on top of keyTerms: fees → fee, forms → form. Applied to both sides. */
const fold = (t: string) => (t.length > 4 && /^[a-z]+s$/.test(t) && !t.endsWith("ss") ? t.slice(0, -1) : t);
const terms = (text: string) => keyTerms(text).map(fold);

interface Concept {
  /** Each variant is a list of terms that must all match. */
  variants: string[][];
  /** Set for words that name a sort of page (fee, form …) rather than a service. */
  kind?: ServiceKind;
}

const GROUPS = SERVICE_SYNONYMS.map((g) => ({ kind: g.kind, variants: g.phrases.map(terms).filter((v) => v.length) }));

/** Splits a query into concepts: a synonym group where a known phrase matches, else one word. */
export function concepts(query: string): Concept[] {
  const q = terms(query);
  const out: Concept[] = [];
  const used = new Set<object>();
  for (let i = 0; i < q.length; ) {
    let best: { len: number; group: (typeof GROUPS)[number] } | undefined;
    for (const g of GROUPS)
      for (const v of g.variants)
        if (v.length > (best?.len ?? 0) && v.every((t, j) => q[i + j] === t)) best = { len: v.length, group: g };
    if (best) {
      // the same group twice ("fee fees") counts once
      if (!used.has(best.group)) out.push({ variants: best.group.variants, kind: best.group.kind });
      used.add(best.group);
      i += best.len;
    } else {
      out.push({ variants: [[q[i]]] });
      i++;
    }
  }
  return out;
}

export class ServiceIndex {
  private postings = new Map<string, Posting>();
  constructor(
    readonly items: readonly ServiceItem[],
    /** Extra searchable words per item, e.g. the department's name. */
    extra: (item: ServiceItem) => string = () => "",
  ) {
    items.forEach((it, doc) => {
      let path = "";
      try {
        path = decodeURIComponent(new URL(it.url).pathname).replace(/\.(php|aspx?|html?|pdf|docx?)$/i, "");
      } catch {
        /* keep empty */
      }
      const fields: [string, number][] = [
        [it.title, 3],
        [path, 1.5],
        [it.excerpt ?? "", 1],
        [extra(it), 1.2],
      ];
      for (const [text, w] of fields)
        for (const t of new Set(terms(text))) {
          let p = this.postings.get(t);
          if (!p) this.postings.set(t, (p = new Map()));
          p.set(doc, Math.max(p.get(doc) ?? 0, w));
        }
    });
  }

  private idf(t: string) {
    const n = this.postings.get(t)?.size ?? 0;
    return n ? Math.log(1 + this.items.length / n) : 0;
  }

  search(query: string, limit = 20): ServiceHit[] {
    const cs = concepts(query);
    if (!cs.length) return [];
    // concepts that name a service or a place must match; kind words (fee, form …) only rank,
    // unless the question is nothing but kind words
    const content = cs.filter((c) => !c.kind);
    const ranking = content.length ? cs.filter((c) => c.kind) : [];
    const required = content.length ? content : cs;
    const needed = Math.max(1, Math.ceil(required.length * 0.6));
    const scores = new Map<number, { score: number; matched: number }>();
    for (const c of required) {
      for (const [doc, s] of this.match(c)) {
        const cur = scores.get(doc) ?? { score: 0, matched: 0 };
        scores.set(doc, { score: cur.score + s, matched: cur.matched + 1 });
      }
    }
    const hits: ServiceHit[] = [];
    for (const [doc, { score, matched }] of scores) {
      if (matched < needed) continue;
      const item = this.items[doc];
      let s = score * (matched / required.length) ** 2;
      // "passport fee": a fee table about passports beats a passport page that only mentions fees
      for (const c of ranking) s += (this.match(c).get(doc) ?? 0) * 0.5 + (item.kind === c.kind ? 2 : 0);
      hits.push({ item, score: s + (item.type === "html" ? 0.05 : 0) });
    }
    hits.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
    // the same title on the same site (a page and its print or language copy) is shown once
    const shown = new Set<string>();
    return hits.filter((h) => {
      const key = `${h.item.site_id}\n${h.item.title.toLowerCase()}`;
      if (shown.has(key)) return false;
      shown.add(key);
      return true;
    }).slice(0, limit);
  }

  /** Documents matching any variant of a concept, with the best variant's score. */
  private match(c: Concept): Map<number, number> {
    const best = new Map<number, number>();
    for (const v of c.variants) {
      const lists = v.map((t) => this.postings.get(t));
      if (lists.some((l) => !l)) continue;
      const ps = lists as Posting[];
      for (const [doc] of ps[0]) {
        if (!ps.every((l) => l.has(doc))) continue;
        const s = v.reduce((n, t, j) => n + ps[j].get(doc)! * this.idf(t), 0);
        if (s > (best.get(doc) ?? 0)) best.set(doc, s);
      }
    }
    if (c.kind) this.items.forEach((it, doc) => it.kind === c.kind && best.set(doc, (best.get(doc) ?? 0) + 1.5));
    return best;
  }
}

/** Loads every chunk of data/service-index/ on first use, as separate same-origin files. */
export async function loadServiceItems(): Promise<ServiceItem[]> {
  const chunks = import.meta.glob<{ items: ServiceItem[] }>("../../data/service-index/items-*.json", { import: "default" });
  const parts = await Promise.all(Object.values(chunks).map((load) => load()));
  return parts.flatMap((p) => p.items);
}
