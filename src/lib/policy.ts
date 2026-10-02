/**
 * The editorial policy, as code (docs/EDITORIAL_POLICY.md, docs/LAUNCH_PLAN.md §4).
 *
 * What the public build may contain is decided here, once: the site, graph.json and every export
 * are written from publicGraph(), so a field hidden here is absent from all of them, not only from
 * the pages.
 */
import type { Graph } from "../schema.ts";

/** Decisions from SS (docs/LAUNCH_LOG.md, §1 answers). */
export const PUBLISH = {
  /** §1.4: hidden from the public build and exports until a Pakistani lawyer has reviewed them (§4.4). */
  legalCases: false,
} as const;

export const PUBLISHER = "Pakistan Government Graph";

export const LICENCE = {
  data: { id: "CC-BY-4.0", name: "Creative Commons Attribution 4.0 International", url: "https://creativecommons.org/licenses/by/4.0/" },
  code: { id: "MIT", name: "MIT License" },
  attribution: PUBLISHER,
} as const;

/** §1.5: declared assets come only from ECP publications. Add a Gazette host here once one is confirmed to publish the statements. */
export const ASSET_SOURCE_HOSTS: readonly string[] = ["ecp.gov.pk"];

export function isAssetSource(url: string | undefined): boolean {
  try {
    const host = new URL(url ?? "").hostname;
    return ASSET_SOURCE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** The graph as published: fields the policy hides are removed, and the licence is stated. */
export function publicGraph(g: Graph): Graph {
  const hidden = new Set<string>(PUBLISH.legalCases ? [] : ["legal_cases"]);
  return {
    ...g,
    meta: { ...g.meta, licence: LICENCE },
    people: g.people.map((p) => {
      if (!hidden.has("legal_cases") || !p.legal_cases) return p;
      const { legal_cases: _hidden, ...rest } = p;
      return rest;
    }),
    verification: g.verification.filter((v) => !(v.topic && hidden.has(v.topic))),
  };
}
