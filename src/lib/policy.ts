/**
 * The editorial policy, as code (docs/EDITORIAL_POLICY.md, docs/LAUNCH_PLAN.md §4).
 *
 * What the public build may contain is decided here, once: the site, graph.json and every export
 * are written from publicGraph(), so a field hidden here is absent from all of them, not only from
 * the pages.
 */
import type { Graph, Source } from "../schema.ts";

/** Decisions from SS (docs/LAUNCH_LOG.md, §1 answers). */
export const PUBLISH = {
  /**
   * SS, 20 October 2026: legal cases are published when they are grounded, cited and traceable.
   * Only cases marked `publish: true` that pass publishedCaseProblems() reach the public build;
   * everything else stays in data/ (docs/EDITORIAL_POLICY.md).
   */
  legalCases: true,
  /** SS, 2 October 2026: "not legally elected" labels are live from launch, always with their evidence. Part of the lawyer review (§10). */
  form45Labels: true,
} as const;

export const PUBLISHER = "Pakistan Government Graph";

export const LICENCE = {
  data: { id: "CC-BY-4.0", name: "Creative Commons Attribution 4.0 International", url: "https://creativecommons.org/licenses/by/4.0/" },
  code: { id: "MIT", name: "MIT License" },
  attribution: PUBLISHER,
} as const;

/** §1.5: declared assets come only from ECP publications. Add a Gazette host here once one is confirmed to publish the statements. */
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

/** Election result documents (Form 45, Form 47) come only from the ECP. */
export const isEcpSource = (url: string | undefined): boolean => onHost(url, ["ecp.gov.pk"]);

/** §0.2.2: encyclopedias must not ship as citations. Authored YAML may still hold them until replaced. */
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
        // Encyclopedia URLs cannot be asset sources (§1.5 + §0.2.2); drop the figure if its only citation is one.
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
