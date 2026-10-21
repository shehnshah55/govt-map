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
