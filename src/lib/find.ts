/**
 * "Find a service": finds the official websites and bodies that answer a question, in English, Urdu or
 * Roman Urdu. Pure (no DOM, no network): it ranks registry entries (data/official-sites.yaml)
 * and graph records, and returns links. It never writes an answer of its own.
 */
import type { GraphIndex } from "./graph-index.ts";
import type { OfficialSite } from "../schema.ts";

/** Arabic-script letters that Urdu text often carries in their Arabic or presentation forms. */
const URDU_FOLD: Record<string, string> = {
  "ي": "ی", "ى": "ی", "ئ": "ی", "ك": "ک", "ه": "ہ", "ۀ": "ہ", "ة": "ہ", "ھ": "ہ", "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ؤ": "و", "ے": "ی", "ۓ": "ی",
};

/** Lower-case, Unicode-normalised, Urdu letter variants folded, diacritics and joiners removed, punctuation to spaces. */
export function normalise(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u200C\u200D\u200E\u200F]/g, "") // harakat, tatweel, ZWNJ/ZWJ, marks
    .replace(/[يىئكهۀةھأإآٱؤےۓ]/g, (c) => URDU_FOLD[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Roman Urdu has no fixed spelling: tareeqa / tariqa, shanakhti / shnakhti, card / kard. Folds one Latin word to a common key. */
export function foldRoman(word: string): string {
  if (!/^[a-z0-9]+$/.test(word)) return word;
  return word
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/q/g, "k")
    .replace(/([bcdfghjklmnpqrstvwxyz])a(?=[bcdfghjklmnpqrstvwxyz])/g, "$1") // drop short medial vowels: shanakhti → shnkhti
    .replace(/([a-z])\1+/g, "$1")
    .replace(/(.)h$/, "$1");
}

const STOP = new Set(
  [
    // English
    "how", "do", "does", "i", "can", "get", "my", "me", "the", "a", "an", "to", "for", "of", "what", "is", "are", "and", "in", "on", "where", "who", "which", "apply", "online", "make", "about", "it", "with", "from", "need", "want",
    // Roman Urdu
    "kaise", "kese", "kesay", "kaisay", "kya", "kia", "hai", "hain", "ka", "ki", "ke", "ko", "se", "mein", "main", "mai", "me", "banwana", "banwane", "banwanay", "banwaye", "banwayen", "banwain", "banwaen", "banwao", "hasil", "karwana", "karwaye", "karwayen", "milega", "milta", "sakta", "sakte", "sakti", "banana", "banane", "tareeqa", "tarika", "tariqa", "kahan", "kab", "liye", "lye", "karna", "karne", "karain", "krna", "mujhe", "mera", "meri", "apna", "apni", "chahiye", "kon", "kaun", "kitni", "kitna",
    // Urdu
    "کیا", "ہے", "ہیں", "کا", "کی", "کے", "کو", "سے", "میں", "کیسے", "کہاں", "کب", "لیے", "لئے", "طریقہ", "بنوانا", "بنوانے", "کرنا", "مجھے", "میرا", "میری", "اپنا", "کتنی", "کتنا", "کون",
  ].map((w) => normalise(w)),
);

/** Meaningful words of a query or keyword, folded for matching. */
export function keyTerms(text: string): string[] {
  return normalise(text)
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .map(foldRoman);
}

export interface SiteHit {
  site: OfficialSite;
  score: number;
  /** The service keyword that matched, for showing why the site was suggested. */
  matched?: string;
}

/** Ranks registry sites for a question: keyword phrases first, then names and hosts. */
export function rankSites(sites: readonly OfficialSite[], q: string, ix?: GraphIndex, limit = 12): SiteHit[] {
  const terms = keyTerms(q);
  if (!terms.length) return [];
  const qKey = ` ${terms.join(" ")} `;
  const hits: SiteHit[] = [];
  for (const site of sites) {
    let score = 0;
    let matched: string | undefined;
    for (const kw of site.services ?? []) {
      const k = keyTerms(kw);
      if (!k.length) continue;
      if (qKey.includes(` ${k.join(" ")} `)) {
        const s = 10 + 4 * k.length;
        if (s > score) {
          score = s;
          matched = kw;
        }
      }
    }
    const body = site.body_id ? ix?.org.get(site.body_id) : undefined;
    const host = (() => {
      try {
        return new URL(site.url).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })();
    const names = new Set([...keyTerms(site.name), ...keyTerms(site.name_ur ?? ""), ...keyTerms(body?.short_name ?? ""), ...keyTerms(body?.name_ur ?? ""), ...host.split(".").slice(0, -2).map(foldRoman)]);
    const nameHits = terms.filter((t) => t.length > 1 && names.has(t)).length;
    score += nameHits * 3;
    if (score > 0) hits.push({ site, score: score + (site.status === "verified" ? 0.5 : 0), matched });
  }
  return hits.sort((a, b) => b.score - a.score || a.site.name.localeCompare(b.site.name)).slice(0, limit);
}

/** Graph records for a question: the whole query first, then each meaningful word on its own. */
export function rankRecords(ix: GraphIndex, q: string, limit = 12) {
  const whole = ix.search(q, limit);
  if (whole.length) return whole;
  const seen = new Map<string, ReturnType<GraphIndex["search"]>[number]>();
  for (const t of normalise(q).split(" ").filter((w) => w.length > 2 && !STOP.has(w)))
    for (const r of ix.search(t, limit)) if (!seen.has(r.id) || seen.get(r.id)!.score < r.score) seen.set(r.id, r);
  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Old links: #/ask (the earlier name of Find a service) open #/find with the same query. */
export function redirectOldPath(path: string): string | undefined {
  return /^\/ask(?=$|[/?])/.test(path) ? `/find${path.slice(4)}` : undefined;
}
