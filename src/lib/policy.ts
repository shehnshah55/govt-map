/**
 * The editorial policy, as code (docs/EDITORIAL_POLICY.md).
 *
 * What the public build may contain is decided here, once: the site, graph.json and every export
 * are written from publicGraph(), so a field hidden here is absent from all of them, not only from
 * the pages.
 */
import type { Graph, Source } from "../schema.ts";

/** Publishing decisions (docs/EDITORIAL_POLICY.md). */
export const PUBLISH = {
  /**
   * SS, 20 October 2026: legal cases are published when they are grounded, cited and traceable.
   * Only cases marked `publish: true` that pass publishedCaseProblems() reach the public build;
   * everything else stays in data/ (docs/EDITORIAL_POLICY.md).
   */
  legalCases: true,
  /** SS, 2 October 2026: "not legally elected" labels are live from launch, always with their evidence. Part of the lawyer review. */
  form45Labels: true,
} as const;

export const PUBLISHER = "Pakistan Government Graph";

export const LICENCE = {
  data: { id: "CC-BY-4.0", name: "Creative Commons Attribution 4.0 International", url: "https://creativecommons.org/licenses/by/4.0/" },
  code: { id: "MIT", name: "MIT License" },
  attribution: PUBLISHER,
} as const;

/** Declared assets come only from ECP publications (docs/EDITORIAL_POLICY.md, Declared assets). Add a Gazette host here once one is confirmed to publish the statements. */
export const ASSET_SOURCE_HOSTS: readonly string[] = ["ecp.gov.pk"];

const onHost = (url: string | undefined, hosts: readonly string[]) => {
  try {
    const host = new URL(url ?? "").hostname;
    return hosts.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
};

export const isAssetSource = (url: string | undefined): boolean => onHost(url, ASSET_SOURCE_HOSTS);

/**
 * Web archives. A fact read from an archived copy is still cited by the official page: `url` is the
 * official URL and `archive_url` the snapshot it was read from, with `fetched_via: archive`.
 * An archive host is never a citation's `url` (docs/EDITORIAL_POLICY.md § Archived copies).
 */
export const ARCHIVE_HOSTS: readonly string[] = ["web.archive.org", "archive.org", "archive.ph", "archive.today", "archive.is"];
export const isArchiveUrl = (url: string | undefined): boolean => onHost(url, ARCHIVE_HOSTS);

/** Election result documents (Form 45, Form 47) come only from the ECP. */
export const isEcpSource = (url: string | undefined): boolean => onHost(url, ["ecp.gov.pk"]);

/** Census figures come only from the Pakistan Bureau of Statistics. */
export const isPbsSource = (url: string | undefined): boolean => onHost(url, ["pbs.gov.pk"]);

/** Encyclopedias must not ship as citations (docs/EDITORIAL_POLICY.md, Sources, rule 4). Authored YAML may still hold them until replaced. */
const ENCYCLOPEDIA_HOST = /wikipedia\.org|britannica\.com/i;

export function isEncyclopediaUrl(url: string | undefined): boolean {
  return !!url && ENCYCLOPEDIA_HOST.test(url);
}

function keepSource<T extends Source>(s: T | undefined): T | undefined {
  if (!s) return undefined;
  return isEncyclopediaUrl(s.url) ? undefined : s;
}

function keepSources(sources: Source[] | undefined): Source[] | undefined {
  if (!sources) return sources;
  return sources.filter((s) => !isEncyclopediaUrl(s.url));
}

type LegalCase = NonNullable<Graph["people"][number]["legal_cases"]>[number];

const isHttpUrl = (url: string | undefined) => {
  try {
    return ["http:", "https:"].includes(new URL(url ?? "").protocol);
  } catch {
    return false;
  }
};

/** Statuses where no court has found guilt, so the charge stays an allegation and the page says so. */
export const ALLEGATION_STATUSES: readonly string[] = ["pending", "stayed", "withdrawn", "quashed", "acquitted"];

/**
 * The publishing gate for one case: what it lacks to be published. A published case must show the
 * charge, its outcome (status) with the date that outcome is stated as of and the source for it, and
 * at least one cited source; none of them may be an encyclopedia.
 */
/**
 * A link or title that looks like a copy of an FIR (a scan, photo or PDF of the report itself) rather
 * than a court record, an official release or a news report about it. FIR copies carry the names and
 * addresses of complainants and witnesses, so they are never linked (docs/EDITORIAL_POLICY.md, FIRs
 * and privacy): an FIR is cited by its number and police station as reported.
 */
const FIR_COPY = [
  /\bfir[\s_-]*(?:copy|copies|scan|scanned|image|photo|pdf)\b/i,
  /\b(?:copy|scan|scanned|photo|image)[\s_-]*(?:of[\s_-]*)?(?:the[\s_-]*)?fir\b/i,
  /\bfirst[\s_-]*information[\s_-]*report[\s_-]*(?:copy|scan)\b/i,
  // a document or image file whose name says FIR: fir.pdf, FIR_123-2023.jpg, scanned-fir-no-45.png
  /(?:^|[/_.-])fir(?:[\s_.-][^/?#]*)?\.(?:pdf|jpe?g|png|gif|webp|tiff?)(?:[?#]|$)/i,
];
export function looksLikeFirCopy(...texts: (string | undefined)[]): boolean {
  return texts.some((t) => !!t && FIR_COPY.some((re) => re.test(t.replace(/%20/g, " "))));
}

export function caseProblems(c: LegalCase): string[] {
  const out: string[] = [];
  if (!c.charges?.trim()) out.push("no charge");
  if (!c.status) out.push("no status (outcome)");
  if (!c.status_as_of?.trim()) out.push("no status_as_of date");
  else if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(c.status_as_of)) out.push(`status_as_of "${c.status_as_of}" is not YYYY, YYYY-MM or YYYY-MM-DD`);
  if (!isHttpUrl(c.status_source?.url)) out.push("no status_source URL");
  else if (isEncyclopediaUrl(c.status_source?.url)) out.push("status_source is an encyclopedia");
  if (!c.sources?.length || !c.sources.every((s) => isHttpUrl(s.url))) out.push("a source without a URL");
  if (c.sources?.some((s) => isEncyclopediaUrl(s.url))) out.push("an encyclopedia source");
  if (looksLikeFirCopy(c.status_source?.url, c.status_source?.title) || c.sources?.some((s) => looksLikeFirCopy(s.url, s.title, s.archive_url))) out.push("a source that looks like an FIR copy");
  out.push(...timelineProblems(c.timeline));
  return out;
}

const EVENT_DATE = /^\d{4}-\d{2}(-\d{2})?$/;

/** Dates of different precision compare on their common prefix, so 2023-10 sits with any day in October. */
const dateBefore = (a: string, b: string) => {
  const n = Math.min(a.length, b.length);
  return a.slice(0, n) > b.slice(0, n);
};

/** What a case's timeline lacks to be published: at least one event, each dated, typed and sourced, in order. */
export function timelineProblems(timeline: LegalCase["timeline"]): string[] {
  if (!timeline?.length) return ["no timeline"];
  const out: string[] = [];
  timeline.forEach((e, i) => {
    const at = `timeline[${i}]`;
    if (!e.date || !EVENT_DATE.test(e.date)) out.push(`${at}: date "${e.date ?? ""}" is not YYYY-MM or YYYY-MM-DD`);
    if (!e.type) out.push(`${at}: no type`);
    if (!e.description?.trim()) out.push(`${at}: no description`);
    if (!isHttpUrl(e.source_url)) out.push(`${at}: no source_url`);
    else if (isEncyclopediaUrl(e.source_url)) out.push(`${at}: source_url is an encyclopedia`);
    if (looksLikeFirCopy(e.source_url, e.source_title)) out.push(`${at}: source looks like an FIR copy; cite the FIR by number and police station instead`);
    if (!e.source_type) out.push(`${at}: no source_type`);
    const prev = timeline[i - 1];
    if (prev?.date && e.date && dateBefore(prev.date, e.date)) out.push(`${at}: ${e.date} is out of order (after ${prev.date})`);
  });
  return out;
}

/** Every case marked publish: true that fails the gate, as "person: case: problems". The build fails on any. */
export function publishedCaseProblems(g: Graph): string[] {
  return g.people.flatMap((p) =>
    (p.legal_cases ?? []).filter((c) => c.publish === true).flatMap((c) => {
      const problems = caseProblems(c);
      return problems.length ? [`${p.id}: legal case "${c.title}": ${problems.join(", ")}`] : [];
    }),
  );
}

/** Cases that may be published: opted in with publish: true, and passing the gate. Internal flags are stripped. */
function publishableCases(cases: LegalCase[]): LegalCase[] {
  return cases
    .filter((c) => c.publish === true && caseProblems(c).length === 0)
    .map(({ publish: _p, hold_reason: _h, ...rest }) => rest);
}

/** The graph as published: fields the policy hides are removed, and the licence is stated. */
export function publicGraph(g: Graph): Graph {
  const hidden = new Set<string>([...(PUBLISH.legalCases ? [] : ["legal_cases"]), ...(PUBLISH.form45Labels ? [] : ["election_checks"])]);
  return {
    ...g,
    meta: { ...g.meta, licence: LICENCE },
    people: g.people.map((p) => {
      const roles = p.roles.map((r) => {
        const source = keepSource(r.source);
        if (source === r.source) return r;
        if (source) return { ...r, source };
        const { source: _drop, ...rest } = r;
        return rest;
      });
      let person = { ...p, roles };
      if (person.legal_cases) {
        const cases = hidden.has("legal_cases") ? [] : publishableCases(person.legal_cases);
        if (cases.length) person = { ...person, legal_cases: cases };
        else {
          const { legal_cases: _hidden, ...rest } = person;
          person = rest;
        }
      }
      if (person.declared_assets) {
        // Encyclopedia URLs cannot be asset sources (EDITORIAL_POLICY: Declared assets; Sources, rule 4); drop the figure if its only citation is one.
        const assets = person.declared_assets
          .map((a) => {
            const source = keepSource(a.source);
            return source ? { ...a, source } : undefined;
          })
          .filter((a): a is NonNullable<typeof a> => !!a);
        person = assets.length ? { ...person, declared_assets: assets } : (() => {
          const { declared_assets: _drop, ...rest } = person;
          return rest;
        })();
      }
      return person;
    }),
    relatives: (g.relatives ?? []).map((r) => ({
      ...r,
      sources: keepSources(r.sources) ?? r.sources,
    })),
    verification: g.verification
      .filter((v) => !(v.topic && hidden.has(v.topic)))
      .map((v) => (v.sources ? { ...v, sources: keepSources(v.sources)! } : v)),
    // Form 45 / 47 sources are ECP publications by schema, so no encyclopedia citation can reach them
    election_checks: hidden.has("election_checks") ? [] : g.election_checks,
  };
}

/**
 * Official websites (data/official-sites.yaml, docs/EDITORIAL_POLICY.md § Official websites).
 * A registry entry must be on a government domain, or on a host listed in OFFICIAL_ORG_HOSTS
 * with the reason that host is the body's own official site.
 */
export const OFFICIAL_SUFFIXES: readonly string[] = ["gov.pk", "gop.pk", "gos.pk", "gob.pk", "gok.pk", "gkp.pk"];

/** Statutory bodies and state enterprises whose official site is not on a government domain. Add one only with its justification. */
export const OFFICIAL_ORG_HOSTS: Readonly<Record<string, string>> = {
  "sbp.org.pk": "State Bank of Pakistan: central bank under the SBP Act 1956",
  "nepra.org.pk": "NEPRA: regulator under the NEPRA Act 1997",
  "ogra.org.pk": "OGRA: regulator under the OGRA Ordinance 2002",
  "pnra.org": "PNRA: regulator under the PNRA Ordinance 2001",
  "ppra.org.pk": "PPRA: regulator under the PPRA Ordinance 2002 (older domain; ppra.gov.pk is current)",
  "pmdc.pk": "PMDC: statutory council under the PMDC Act 2023",
  "nih.org.pk": "National Institute of Health, Islamabad (federal health institute)",
  "aiou.edu.pk": "Allama Iqbal Open University: federal public university",
  "fbise.edu.pk": "FBISE: federal examination board under the FBISE Act 1975",
  "hsa.edu.pk": "Health Services Academy: federal public university",
  "pesrp.edu.pk": "Punjab Education Sector Reform Programme (School Education Department)",
  "smeda.org": "SMEDA: federal authority under the SMEDA Ordinance 2002",
  "phrc.org.pk": "Pakistan Health Research Council (federal statutory council)",
  "phc.org.pk": "Punjab Healthcare Commission (provincial statutory regulator)",
  "shcc.org.pk": "Sindh Healthcare Commission (provincial statutory regulator)",
  "endpolio.com.pk": "National Emergency Operations Centre for Polio Eradication (federal programme)",
  "fesco.com.pk": "FESCO: state-owned electricity distribution company",
  "gepco.com.pk": "GEPCO: state-owned electricity distribution company",
  "iesco.com.pk": "IESCO: state-owned electricity distribution company",
  "mepco.com.pk": "MEPCO: state-owned electricity distribution company",
  "pesco.com.pk": "PESCO: state-owned electricity distribution company",
  "qesco.com.pk": "QESCO: state-owned electricity distribution company",
  "sepco.com.pk": "SEPCO: state-owned electricity distribution company",
  "pitc.com.pk": "PITC: state-owned IT company of the Power Division (electricity bills)",
  "sngpl.com.pk": "SNGPL: state-controlled gas utility",
  "ssgc.com.pk": "SSGC: state-controlled gas utility",
};

export function isOfficialHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (OFFICIAL_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`))) return true;
  return Object.keys(OFFICIAL_ORG_HOSTS).some((o) => h === o || h.endsWith(`.${o}`));
}

export function isOfficialSiteUrl(url: string | undefined): boolean {
  try {
    return isOfficialHost(new URL(url ?? "").hostname);
  } catch {
    return false;
  }
}
