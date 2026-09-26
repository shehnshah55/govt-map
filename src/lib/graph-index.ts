/** In-memory indexes and queries over the compiled graph. Pure — no DOM. */
import type { Graph, Organization, Person, Position, Jurisdiction, Law, RelationType, Sector } from "../schema.ts";

export type Org = Graph["organizations"][number];
export type Post = Graph["positions"][number];
export type Human = Graph["people"][number];
export type Place = Graph["jurisdictions"][number];
export type Statute = Graph["laws"][number];
export type Edge = Graph["edges"][number];
export type NodeKind = "organization" | "position" | "person" | "jurisdiction" | "law";

export type SeatStatus = "filled" | "acting" | "vacant" | "unknown" | "multi";

export interface Holding {
  person: Human;
  since?: string;
  until?: string;
  status: Person["roles"][number]["status"];
}

export class GraphIndex {
  readonly org = new Map<string, Org>();
  readonly post = new Map<string, Post>();
  readonly person = new Map<string, Human>();
  readonly place = new Map<string, Place>();
  readonly law = new Map<string, Statute>();
  readonly children = new Map<string, Org[]>();
  readonly postsByOrg = new Map<string, Post[]>();
  readonly holdings = new Map<string, Holding[]>();
  readonly out = new Map<string, Edge[]>();
  readonly in = new Map<string, Edge[]>();
  readonly placeChildren = new Map<string, Place[]>();
  readonly orgsByPlace = new Map<string, Org[]>();

  constructor(readonly g: Graph) {
    for (const o of g.organizations) this.org.set(o.id, o);
    for (const p of g.positions) this.post.set(p.id, p);
    for (const p of g.people) this.person.set(p.id, p);
    for (const j of g.jurisdictions) this.place.set(j.id, j);
    for (const l of g.laws) this.law.set(l.id, l);
    for (const o of g.organizations) {
      if (o.parent) push(this.children, o.parent, o);
      push(this.orgsByPlace, o.jurisdiction, o);
    }
    for (const p of g.positions) push(this.postsByOrg, p.org, p);
    for (const person of g.people)
      for (const r of person.roles) push(this.holdings, r.position, { person, since: r.since, until: r.until, status: r.status });
    for (const e of g.edges) {
      push(this.out, e.from, e);
      push(this.in, e.to, e);
    }
    for (const j of g.jurisdictions) if (j.parent) push(this.placeChildren, j.parent, j);
  }

  kindOf(id: string): NodeKind | undefined {
    if (this.org.has(id)) return "organization";
    if (this.post.has(id)) return "position";
    if (this.person.has(id)) return "person";
    if (this.place.has(id)) return "jurisdiction";
    if (this.law.has(id)) return "law";
    return undefined;
  }

  label(id: string): string {
    return (
      this.org.get(id)?.name ??
      this.post.get(id)?.title ??
      this.person.get(id)?.name ??
      this.place.get(id)?.name ??
      this.law.get(id)?.title ??
      id
    );
  }

  shortLabel(id: string): string {
    const o = this.org.get(id);
    if (o) return o.short_name ?? o.name;
    const l = this.law.get(id);
    if (l) return l.short ?? l.title;
    return this.label(id);
  }

  /** Organization ancestry from the root down to (and including) `id`. */
  orgTrail(id: string): Org[] {
    const trail: Org[] = [];
    let cur = this.org.get(id);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      trail.unshift(cur);
      cur = cur.parent ? this.org.get(cur.parent) : undefined;
    }
    return trail;
  }

  placeTrail(id: string): Place[] {
    const trail: Place[] = [];
    let cur = this.place.get(id);
    while (cur) {
      trail.unshift(cur);
      cur = cur.parent ? this.place.get(cur.parent) : undefined;
    }
    return trail;
  }

  /** All organizations below `id` in the hierarchy. */
  descendants(id: string): Org[] {
    const out: Org[] = [];
    const stack = [...(this.children.get(id) ?? [])];
    while (stack.length) {
      const o = stack.pop()!;
      out.push(o);
      stack.push(...(this.children.get(o.id) ?? []));
    }
    return out;
  }

  currentHolders(postId: string): Holding[] {
    return (this.holdings.get(postId) ?? []).filter((h) => !h.until);
  }

  pastHolders(postId: string): Holding[] {
    return (this.holdings.get(postId) ?? []).filter((h) => h.until);
  }

  /** Who sits in a post, following ex officio links (e.g. CCI chair → Prime Minister). */
  effectiveHolders(postId: string): Holding[] {
    const direct = this.currentHolders(postId);
    if (direct.length) return direct;
    const via = this.post.get(postId)?.ex_officio_of;
    return via ? this.effectiveHolders(via) : [];
  }

  seatStatus(postId: string): SeatStatus {
    const p = this.post.get(postId);
    if (!p) return "unknown";
    if (p.seats) return "multi";
    const holders = this.effectiveHolders(postId);
    if (holders.some((h) => h.status !== "confirmed")) return "acting";
    if (holders.length) return "filled";
    if (p.vacant) return "vacant";
    return "unknown";
  }

  /** Leadership posts of an organization, most senior first. */
  leadership(orgId: string): Post[] {
    const rank: Record<Post["role"], number> = {
      head: 0,
      chief_justice: 0,
      presiding_officer: 1,
      chief: 1,
      deputy: 2,
      administrative_head: 3,
      officer: 4,
      judge: 5,
      member: 6,
    };
    return [...(this.postsByOrg.get(orgId) ?? [])].sort((a, b) => rank[a.role] - rank[b.role]);
  }

  /**
   * Chain of appointing authority from a post upwards to its source of legitimacy —
   * e.g. Secretary Health ← Prime Minister ← National Assembly ← voters.
   */
  appointmentChain(postId: string, max = 8): { id: string; via: string }[] {
    const chain: { id: string; via: string }[] = [];
    const seen = new Set<string>([postId]);
    let cur: string | undefined = postId;
    while (cur && chain.length < max) {
      const p = this.post.get(cur);
      let next: string | undefined;
      let via = "";
      if (p?.appointment?.by) {
        next = p.appointment.on_advice_of ?? p.appointment.by;
        via = p.appointment.on_advice_of ? "on the advice of" : p.appointment.method.includes("election") ? "elected by" : "appointed by";
      } else if (p?.ex_officio_of) {
        next = p.ex_officio_of;
        via = "held ex officio by";
      } else if (!p) {
        // an organization: follow the elected/appointed membership upward where it is a chamber or college
        const members: Post | undefined = (this.postsByOrg.get(cur) ?? []).find((x) => x.role === "member" && x.appointment?.by);
        if (members?.appointment?.by) {
          next = members.appointment.by;
          via = members.appointment.method.includes("election") ? "whose members are elected by" : "whose members are appointed by";
        }
      }
      if (!next || seen.has(next)) break;
      seen.add(next);
      chain.push({ id: next, via });
      cur = next;
    }
    return chain;
  }

  /** Organizations/positions directly appointed, elected or nominated by `id` (incl. via its head post). */
  appointees(id: string): Edge[] {
    return (this.out.get(id) ?? []).filter((e) => ["appoints", "elects", "nominates", "confirms", "advises"].includes(e.type));
  }

  relationsOf(id: string, exclude: RelationType[] = []): { outgoing: Edge[]; incoming: Edge[] } {
    const skip = new Set(exclude);
    return {
      outgoing: (this.out.get(id) ?? []).filter((e) => !skip.has(e.type)),
      incoming: (this.in.get(id) ?? []).filter((e) => !skip.has(e.type)),
    };
  }

  /** Organizations established or empowered by a law. */
  enactedBodies(lawId: string): Org[] {
    return (this.in.get(lawId) ?? []).filter((e) => e.type === "established_by").map((e) => this.org.get(e.from)!).filter(Boolean);
  }

  lawCitations(lawId: string): Post[] {
    return this.g.positions.filter((p) => p.appointment?.legal_basis?.some((lb) => lb.law === lawId));
  }

  bySector(sector: Sector): Org[] {
    return this.g.organizations.filter((o) => o.sectors?.includes(sector));
  }

  /** Top-level government (tier) a jurisdiction belongs to: pk, pk-pb, pk-sd, … */
  tierOf(jurId: string): Place | undefined {
    const trail = this.placeTrail(jurId);
    return trail[1] ?? trail[0];
  }

  search(q: string, limit = 40): { id: string; kind: NodeKind; label: string; sub: string; score: number }[] {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const terms = query.split(/\s+/);
    const results: { id: string; kind: NodeKind; label: string; sub: string; score: number }[] = [];
    const consider = (id: string, kind: NodeKind, label: string, hay: string, sub: string, boost = 0, alias?: string) => {
      const h = hay.toLowerCase();
      if (!terms.every((t) => h.includes(t))) return;
      const l = label.toLowerCase();
      let score = boost;
      if (l === query || alias?.toLowerCase() === query) score += 100;
      else if (l.startsWith(query)) score += 50;
      else if (l.includes(query)) score += 25;
      score -= label.length / 40;
      results.push({ id, kind, label, sub, score });
    };
    for (const o of this.g.organizations)
      consider(o.id, "organization", o.name, `${o.name} ${o.short_name ?? ""} ${o.name_ur ?? ""} ${o.kind} ${o.id}`, `${o.short_name ? o.short_name + " · " : ""}${this.place.get(o.jurisdiction)?.name ?? ""}`, o.kind === "field_administration" ? -5 : 5, o.short_name);
    for (const p of this.g.positions) {
      const holders = this.currentHolders(p.id).map((h) => h.person.name).join(", ");
      consider(p.id, "position", p.title, `${p.title} ${holders}`, holders || this.label(p.org), p.generated ? -8 : 0);
    }
    for (const p of this.g.people)
      consider(p.id, "person", p.name, `${p.name} ${p.name_ur ?? ""} ${p.party ?? ""}`, p.roles.filter((r) => !r.until).map((r) => this.label(r.position)).join(" · "), 20);
    for (const j of this.g.jurisdictions) consider(j.id, "jurisdiction", j.name, `${j.name} ${j.name_ur ?? ""} ${j.headquarters ?? ""}`, j.kind.replace(/_/g, " "), j.kind === "district" ? 0 : 10);
    for (const l of this.g.laws) consider(l.id, "law", l.title, `${l.title} ${l.short ?? ""} ${l.year ?? ""}`, `${l.kind}${l.year ? " · " + l.year : ""}`);
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

export type { Organization, Person, Position, Jurisdiction, Law, Sector };
