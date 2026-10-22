import { describe, expect, it } from "vitest";
import { compile } from "../scripts/compile.ts";
import { GraphIndex } from "../src/lib/graph-index.ts";
import { accountability, parseQuestion, resolveSubject } from "../src/lib/who-appoints.ts";

const { graph } = compile(new URL("../data", import.meta.url).pathname);
const ix = new GraphIndex(graph);
const read = (q: string) => {
  const p = parseQuestion(q);
  return p && { kind: p.kind, id: resolveSubject(ix, p)?.id };
};

describe("question types", () => {
  it("reads who-appoints questions in English, Roman Urdu and Urdu", () => {
    expect(parseQuestion("Who appoints the Chief Justice of Pakistan?")).toEqual({ kind: "appointer", subject: "Chief Justice of Pakistan" });
    expect(parseQuestion("How is the Prime Minister elected?")).toEqual({ kind: "appointer", subject: "Prime Minister" });
    expect(parseQuestion("Prime Minister ko kaun muqarrar karta hai")?.kind).toBe("appointer");
    expect(parseQuestion("وزیر اعظم کو کون منتخب کرتا ہے")?.kind).toBe("appointer");
  });

  it("reads answers-to questions", () => {
    expect(parseQuestion("Whom does NEPRA answer to?")).toEqual({ kind: "accountable", subject: "NEPRA" });
    expect(parseQuestion("Who is the Auditor-General accountable to?")?.subject).toBe("Auditor-General");
    expect(parseQuestion("Who oversees SECP?")?.kind).toBe("accountable");
    expect(parseQuestion("nepra kis ko jawabdeh hai")?.kind).toBe("accountable");
  });

  it("leaves service questions to the search", () => {
    for (const q of ["How do I renew my CNIC?", "passport fee", "domicile certificate Lahore", "who"]) expect(parseQuestion(q)).toBeUndefined();
  });
});

describe("answers from recorded relationships", () => {
  it("finds the post and its recorded appointer", () => {
    expect(read("Who appoints the Chief Justice of Pakistan?")).toEqual({ kind: "appointer", id: "fed-chief-justice" });
    expect(ix.post.get("fed-chief-justice")?.appointment?.by).toBe("fed-president");
    expect(read("وزیر اعظم کو کون منتخب کرتا ہے")?.id).toBe("fed-prime-minister");
    expect(read("who appoints the governor of punjab")?.id).toBe("pb-governor");
  });

  it("does not match a word inside another word", () => {
    // "IG" is inside "Irrigation"; a wrong post is worse than no answer
    expect(read("who appoints the IG Punjab")?.id).not.toBe("pb-irrigation-minister");
  });

  it("lists the recorded accountability relations", () => {
    const cabinet = accountability(ix, "fed-cabinet");
    expect(cabinet.out.map((e) => e.to).sort()).toEqual(["fed-national-assembly", "fed-senate"]);
    expect(cabinet.out.every((e) => e.legal_basis?.length)).toBe(true);
    const agp = accountability(ix, resolveSubject(ix, { kind: "accountable", subject: "Auditor-General" })!.id);
    expect(agp.out.some((e) => e.to === "fed-na-pac")).toBe(true);
  });
});
