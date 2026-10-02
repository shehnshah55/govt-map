/**
 * How officeholders were chosen, and the Form 45 / Form 47 label (docs/EDITORIAL_POLICY.md § Elections).
 *
 * "Not directly elected" is shown only where the data makes it certain:
 *  - the person holds a seat that voters don't fill directly (a Senate seat, or a reserved or
 *    technocrat seat). Nobody can sit in two houses at once (Constitution, Art. 223), so they hold
 *    no directly elected seat; or
 *  - a cited source records that they are not a member of any legislature (`non_member`), and
 *    they hold a political office such as minister, adviser or special assistant.
 * Ministers whose seat is simply not recorded yet are not tagged: missing data is not evidence.
 */
import type { GraphIndex, Human, Post } from "./graph-index.ts";
import type { Graph } from "../schema.ts";

export type ElectionCheck = Graph["election_checks"][number];

const HOUSES = new Set(["chamber", "legislature"]);

/** A seat in a house that voters don't fill directly: Senate seats, and reserved or technocrat seats anywhere. */
export function isIndirectSeat(ix: GraphIndex, p: Post): boolean {
  const org = ix.org.get(p.org);
  if (!org || !HOUSES.has(org.kind) || p.role !== "member") return false;
  return p.appointment?.method !== "direct_election";
}

const isPolitical = (ix: GraphIndex, p: Post) => (p._selection === "political" || p._selection === "elected") && ix.org.get(p.org)?.kind !== "political_party";

export interface ChosenHow {
  /** Why the tag applies. */
  reason: "indirect_seat" | "non_member";
  /** The current offices it is about. */
  offices: Post[];
}

export function notDirectlyElected(ix: GraphIndex, person: Human): ChosenHow | undefined {
  const current = person.roles.filter((r) => !r.until).map((r) => ix.post.get(r.position)).filter((p): p is Post => !!p);
  if (current.some((p) => p.appointment?.method === "direct_election")) return undefined;
  const indirect = current.filter((p) => isIndirectSeat(ix, p));
  if (indirect.length) return { reason: "indirect_seat", offices: indirect };
  if (person.non_member) {
    const political = current.filter((p) => isPolitical(ix, p));
    if (political.length) return { reason: "non_member", offices: political };
  }
  return undefined;
}

/** Checks for this person, newest election first. */
export function checksFor(ix: GraphIndex, personId: string): ElectionCheck[] {
  return ix.g.election_checks.filter((c) => c.person === personId).sort((a, b) => b.election.localeCompare(a.election));
}

/** Checks for this seat, newest election first. */
export function checksForSeat(ix: GraphIndex, seatId: string): ElectionCheck[] {
  return ix.g.election_checks.filter((c) => c.seat === seatId).sort((a, b) => b.election.localeCompare(a.election));
}

/** The label applies only to a seat the person still holds, from the election that was checked. */
export function notLegallyElected(ix: GraphIndex, person: Human): ElectionCheck | undefined {
  return checksFor(ix, person.id).find((c) => c.status === "differs" && person.roles.some((r) => r.position === c.seat && !r.until));
}

/** Margin by which the Form 45 leader beat the declared winner, in the Form 45 totals. */
export const form45Margin = (c: ElectionCheck) => c.form45.leader.votes - c.form45.declared_winner.votes;
