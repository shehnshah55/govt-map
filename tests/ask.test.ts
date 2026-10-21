import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../scripts/compile.ts";
import { ask, detectLang, displayName, EXAMPLES, isOfficialUrl, isQuestion, normalize, type Piece } from "../src/lib/ask.ts";
import { GraphIndex } from "../src/lib/graph-index.ts";
import { redact } from "../src/lib/redact.ts";
import { askView, servicesView } from "../src/views/ask.ts";

const { graph, errors } = compile(new URL("../data", import.meta.url).pathname);
const ix = new GraphIndex(graph);
const ctx = { ix, repo: "https://github.com/shehnshah55/govt-map", go: () => {} };
/** Every record an answer links to. */
const ids = (ps: Piece[][]) => ps.flat().flatMap((p) => (typeof p === "string" ? [] : [p.id]));

describe("redaction", () => {
  it.each([
    ["CNIC with dashes", "my cnic is 35202-1234567-1", "CNIC"],
    ["CNIC without dashes", "cnic 3520212345671 renew", "CNIC"],
    ["CNIC in Urdu digits", "شناختی کارڈ ۳۵۲۰۲-۱۲۳۴۵۶۷-۱", "CNIC"],
    ["passport number", "passport AB1234567 lost", "passport number"],
    ["mobile number", "call 0300-1234567", "phone number"],
    ["mobile number with +92", "call +92 300 1234567", "phone number"],
    ["landline", "office 042-35761234", "phone number"],
    ["email address", "write to someone@example.com", "email address"],
    ["long number", "account 1234 5678 9012", "long number"],
  ])("removes a %s", (_name, text, kind) => {
    const r = redact(text);
    expect(r.removed).toContain(kind);
    expect(r.text).not.toMatch(/\d{5}|@/);
  });

  it("keeps seat codes, years and short service numbers", () => {
    for (const t of ["Who is the MNA for NA-122?", "18th amendment 2010", "BISP 8171", "ECP 8300"]) expect(redact(t)).toEqual({ text: t, removed: [] });
  });

  it("never lets a CNIC reach the answer, the page or the address bar", () => {
    const a = ask(ix, "my cnic 35202-1234567-1 kaise renew karun");
    expect(a.question).not.toContain("1234567");
    expect(a.removed).toEqual(["CNIC"]);
    expect(a.services.map((s) => s.topic.id)).toContain("cnic");
    expect(askView(ctx, "35202-1234567-1 passport").body.html).not.toContain("1234567");
  });

  it("takes time in proportion to the text, however it is crafted", () => {
    // an unanchored email pattern once took 10 s on 100,000 characters (a shared link could freeze a tab)
    for (const s of ["1".repeat(100_000), "a.".repeat(50_000) + "@", "ab1234567".repeat(11_000), "1-".repeat(50_000)]) {
      const t = performance.now();
      redact(s);
      redact(s.slice(0, 1999));
      expect(performance.now() - t, s.slice(0, 12)).toBeLessThan(200);
    }
  });

  it("catches a passport number run into a word", () => {
    expect(redact("passportAB1234567lost").removed).toContain("passport number");
  });

  it("does not read the placeholder it leaves as part of the question", () => {
    // "[phone number removed]" contains "removed", an accountability word
    expect(ask(ix, "call me on 0300-1234567").intent).toBeUndefined();
  });
});

describe("reading questions", () => {
  it("normalises spelling, punctuation and Urdu letter forms", () => {
    expect(normalize("Wazir-e-Azam?")).toBe("wazir e azam");
    expect(normalize("وزیرِ اعلیٰ")).toBe(normalize("وزير اعلى"));
  });

  it("tells the three languages apart", () => {
    expect(detectLang("Who is the Prime Minister?")).toBe("en");
    expect(detectLang("CM Punjab kaun hai?")).toBe("roman");
    expect(detectLang("وزیراعظم کون ہے")).toBe("ur");
  });

  it.each([
    ["Who is the Prime Minister?"],
    ["wazir-e-azam kaun hai"],
    ["وزیراعظم کون ہے"],
    ["pm kon hai"],
  ])("finds the Prime Minister from %j", (q) => {
    const a = ask(ix, q);
    expect(a.status).toBe("answered");
    expect(a.intent).toBe("holder");
    expect(a.readAs && ids([a.readAs])).toContain("fed-prime-minister");
    expect(ids(a.lines)).toContain(ix.currentHolders("fed-prime-minister")[0].person.id);
  });

  it.each([["CM Punjab kaun hai?"], ["پنجاب کا وزیر اعلیٰ کون ہے؟"], ["Who is the Chief Minister of Punjab"], ["punjab cm"]])("finds the Chief Minister of Punjab from %j", (q) => {
    expect(ask(ix, q).readAs && ids([ask(ix, q).readAs!])).toContain("pb-chief-minister");
  });

  it("answers who appoints a post, with the law", () => {
    const a = ask(ix, "Who appoints the Chief Justice of Pakistan?");
    expect(a.intent).toBe("appointer");
    expect(ids(a.lines)).toContain(ix.post.get("fed-chief-justice")!.appointment!.by);
    expect(a.laws.map((l) => l.law)).toContain("constitution-1973");
  });

  it("answers the same appointment question in Roman Urdu", () => {
    const a = ask(ix, "wazir-e-azam ko kaun muqarrar karta hai");
    expect(a.intent).toBe("appointer");
    expect(a.subject).toBe("fed-prime-minister");
  });

  it("puts a role and a body together: the chairman of NADRA, and names the bare title", () => {
    const a = ask(ix, "who is the chairman of nadra");
    expect(a.subject).toBe("fed-nadra-chairman");
    expect(displayName(ix, "fed-nadra-chairman")).toBe("Chairman, NADRA");
  });

  it("finds a body in the place named before the place itself", () => {
    expect(ask(ix, "who controls the police in punjab").subject).toBe("pb-police");
  });

  it("says what a body does from its record, with its official website", () => {
    const a = ask(ix, "What does NEPRA do?");
    expect(a.intent).toBe("about");
    expect(a.subject).toBe("fed-nepra");
    expect(a.lines.flat()).toContain(ix.org.get("fed-nepra")!.description);
    expect(a.sources.map((s) => s.url)).toContain(ix.org.get("fed-nepra")!.website);
  });

  it("answers the law behind a body", () => {
    const a = ask(ix, "Which law created NAB?");
    expect(a.intent).toBe("law");
    expect(a.laws.map((l) => l.law)).toEqual(ix.org.get("fed-nab")!.legal_basis!.map((l) => l.law));
    expect(a.ignored).toEqual([]);
  });

  it("asks which one when a role is ambiguous, and picks the national post when there is one", () => {
    const g = ask(ix, "who is the governor");
    expect(g.status).toBe("ambiguous");
    expect(g.choices).toEqual(expect.arrayContaining(["pb-governor", "sd-governor"]));
    expect(ask(ix, "who is the chief justice").subject).toBe("fed-chief-justice");
  });

  it("summarises how many matching posts are filled rather than listing them", () => {
    const a = ask(ix, "who appoints the dc");
    expect(a.status).toBe("answered");
    expect(a.lines.length).toBeGreaterThan(3);
    expect(a.lines.length).toBeLessThanOrEqual(9);
  });

  it("finds people by the name they are known by", () => {
    expect(ask(ix, "who is shehbaz sharif").subject).toBe(ix.currentHolders("fed-prime-minister")[0].person.id);
  });

  it("says when the graph doesn't cover a question, and shows the words it ignored", () => {
    expect(ask(ix, "who is the best cricketer").status).toBe("not_covered");
    const w = ask(ix, "what is the weather in lahore");
    expect(w.ignored).toEqual(["weather"]);
  });

  it("answers the law behind a person from the post they hold", () => {
    const a = ask(ix, "qanoon justice");
    expect(a.intent).toBe("law");
    expect(a.lines.length).toBeGreaterThan(0);
    expect(a.readAs && ids([a.readAs]).some((id) => ix.post.has(id))).toBe(true);
  });

  it("doesn't guess from two-letter words", () => {
    expect(ask(ix, "qanoon na").subject).toBeUndefined();
  });

  it("never answers with nothing, and links only to records that exist (seeded fuzz)", () => {
    const vocab = ["who", "is", "kaun", "hai", "کون", "appoints", "muqarrar", "what", "kya", "law", "qanoon", "accountable", "pm", "cm", "governor", "chief", "justice", "secretary", "dc", "ig", "minister", "punjab", "sindh", "kp", "پنجاب", "lahore", "nadra", "fbr", "nab", "passport", "cnic", "tax", "?", "na", "122", "<b>", "senator", "mna", "judge", "head", "amendment"];
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let i = 0; i < 250; i++) {
      const q = Array.from({ length: 1 + Math.floor(rnd() * 7) }, () => vocab[Math.floor(rnd() * vocab.length)]).join(" ");
      const a = ask(ix, q);
      if (a.status === "answered") expect(a.lines.length + a.services.length, q).toBeGreaterThan(0);
      for (const id of [...ids(a.lines), ...a.choices]) expect(ix.kindOf(id), `${q}: ${id}`).toBeDefined();
    }
  }, 30_000);

  it("answers every example question", () => {
    for (const e of EXAMPLES) expect(ask(ix, e.q).status, e.q).toBe("answered");
  });

  it("finds every titled post that has a holder from its own title", () => {
    const titles = new Map<string, number>();
    for (const p of graph.positions) titles.set(p.title, (titles.get(p.title) ?? 0) + 1);
    const misses: string[] = [];
    for (const p of graph.positions) {
      // a bare title ("Chairperson") is rightly ambiguous: Ask asks which body
      if (p.generated || titles.get(p.title)! > 1 || displayName(ix, p.id) !== p.title || !ix.currentHolders(p.id).length) continue;
      const a = ask(ix, `Who is the ${p.title}?`);
      if (a.subject !== p.id && !a.choices.includes(p.id)) misses.push(`${p.title} → ${a.subject ?? a.status}`);
    }
    expect(misses).toEqual([]);
  });

  it("only names people the records give as holders", () => {
    for (const p of graph.positions.filter((x) => !x.generated).slice(0, 300)) {
      const a = ask(ix, `who is the ${p.title}`);
      if (a.intent !== "holder" || !a.subject || !ix.post.has(a.subject)) continue;
      const holders = new Set(ix.effectiveHolders(a.subject).map((h) => h.person.id));
      for (const id of ids(a.lines)) if (ix.person.has(id)) expect(holders.has(id), `${p.title}: ${id}`).toBe(true);
    }
  });
});

describe("services", () => {
  it("compile without errors and point only at public bodies", () => {
    expect(errors).toEqual([]);
    expect(graph.services.length).toBeGreaterThan(20);
    for (const s of graph.services) for (const b of s.bodies) expect(ix.org.get(b)?.kind, `${s.id}: ${b}`).not.toBe("political_party");
  });

  it("start provisional, and can't claim more without a source", () => {
    expect(graph.services.every((s) => s.confidence === "low" || s.sources?.length)).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), "svc-"));
    try {
      cpSync(new URL("../data", import.meta.url).pathname, join(dir, "data"), { recursive: true });
      const bad = (extra: string, bodies = "[fed-nadra]") => {
        writeFileSync(join(dir, "data", "services.yaml"), `services:\n  - id: t\n    title: T\n    group: identity\n    keywords: [t1]\n    bodies: ${bodies}\n${extra}`);
        return compile(join(dir, "data")).errors;
      };
      expect(bad("    confidence: high\n")).toEqual([expect.stringContaining('confidence "high" needs sources')]);
      expect(bad("    confidence: high\n    sources: [{title: NADRA, url: 'https://www.nadra.gov.pk'}]\n")).toEqual([]);
      expect(bad("", "[party-pmln]")).toEqual([expect.stringContaining("political party")]);
      expect(bad("", "[no-such-body]")).toEqual([expect.stringContaining("unknown reference")]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ["شناختی کارڈ کہاں سے بنتا ہے؟", "cnic"],
    ["Passport kaise banwayen?", "passport"],
    ["how do i register a company", "company-registration"],
    ["bijli ka bill zyada aya", "electricity"],
    ["token tax kahan jama karun", "vehicle-registration"],
    ["fard kahan se milegi", "land-records"],
  ])("sends %j to the right service", (q, topic) => {
    const a = ask(ix, q);
    expect(a.intent).toBe("service");
    expect(a.services.map((s) => s.topic.id)).toContain(topic);
  });

  it("prefers the longer keyword: “token tax” is not income tax", () => {
    expect(ask(ix, "token tax").services.map((s) => s.topic.id)).toEqual(["vehicle-registration"]);
  });

  it("marks government and body websites official, and party and news sites not", () => {
    expect(isOfficialUrl(ix, "https://www.nadra.gov.pk/x")).toBe(true);
    expect(isOfficialUrl(ix, "https://www.sbp.org.pk")).toBe(true);
    expect(isOfficialUrl(ix, "https://www.ppsc.gop.pk")).toBe(true);
    expect(isOfficialUrl(ix, "https://www.dawn.com/news/1")).toBe(false);
    expect(isOfficialUrl(ix, ix.org.get("party-pmln")?.website)).toBe(false);
  });

  it("the directory lists every topic", () => {
    const page = servicesView(ctx).body.html;
    for (const s of graph.services) expect(page).toContain(`id="svc-${s.id}"`);
  });
});

describe("the search box", () => {
  it.each([["Who is the PM?", true], ["cm punjab kaun hai", true], ["کون ہے وزیراعظم", true], ["NADRA", false], ["Islamabad", false], ["NA-122", false]])("%j is a question: %s", (q, yes) => {
    expect(isQuestion(q)).toBe(yes);
  });
});
