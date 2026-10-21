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
  /** §1.4: hidden from the public build and exports until a Pakistani lawyer has reviewed them (§4.4). */
  legalCases: false,
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
      if (hidden.has("legal_cases") && person.legal_cases) {
        const { legal_cases: _hidden, ...rest } = person;
        person = rest;
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
