/**
 * The "Not directly elected" tag and the "not legally elected" label (docs/EDITORIAL_POLICY.md
 * § Elections). The label never appears without its evidence: the Form 45 and Form 47 figures and
 * links to the ECP documents sit directly beside it.
 */
import { form45Margin, notDirectlyElected, notLegallyElected, type ElectionCheck } from "../lib/elections.ts";
import type { GraphIndex, Human } from "../lib/graph-index.ts";
import { safeHref } from "../lib/safe-url.ts";
import { html, type Raw } from "../ui/dom.ts";
import { appointmentSentence, link } from "./common.ts";

const fmt = (n: number) => n.toLocaleString("en-US");

/** Tags for the person's page header. */
export function electionTags(ix: GraphIndex, person: Human): Raw {
  const nde = notDirectlyElected(ix, person);
  const nle = notLegallyElected(ix, person);
  return html`${nle ? html`<a class="tag flag-bad strong" href="#form45">Not legally elected: Form 45 shows a different winner</a>` : ""}${
    nde ? html`<a class="tag flag-info" href="#chosen-how" title="Chosen by an elected house, a party list or an appointing authority, not by voters">Not directly elected</a>` : ""
  }`;
}

/** Sections for the person's page: the Form 45 evidence and how they were chosen. */
export function electionSections(ix: GraphIndex, person: Human): Raw {
  const nde = notDirectlyElected(ix, person);
  const nle = notLegallyElected(ix, person);
  return html`${nle ? form45Panel(ix, nle) : ""}${
    nde
      ? html`<section id="chosen-how"><h2>How chosen</h2>
          <p class="hint" style="margin-bottom:10px">${
            nde.reason === "indirect_seat"
              ? "Holds a seat that voters do not fill directly. No one can sit in two houses at once (Constitution, Art. 223), so this person holds no directly elected seat."
              : html`Not a member of any legislature, according to ${sourceLink(person.non_member!.source)} (as of ${person.non_member!.as_of}).`
          }</p>
          <ul class="plain">${nde.offices.map((p) => html`<li>${link(ix, p.id)}: ${appointmentSentence(ix, p)}</li>`)}</ul>
        </section>`
      : ""
  }`;
}

/** The evidence for the "not legally elected" label, also shown on the seat's page. */
export function form45Panel(ix: GraphIndex, c: ElectionCheck): Raw {
  const f45 = c.form45;
  const party = (p?: string) => (p ? html` <span class="hint">(${ix.org.has(p) ? link(ix, p, ix.shortLabel(p)) : p})</span>` : "");
  return html`<section id="form45" class="form45 panel" aria-labelledby="form45-h">
    <h2 id="form45-h">Not legally elected: the Form 45 results show a different winner</h2>
    <p>In the ${c.election.slice(0, 4)} election for ${link(ix, c.seat)}, the polling-station results (Form 45) put ${f45.leader.name} ahead of ${link(ix, c.person)} by ${fmt(form45Margin(c))} votes. The consolidated result (Form 47) declared ${link(ix, c.person)} the winner.</p>
    <div class="tablewrap"><table>
      <thead><tr><th>Document</th><th>Candidate</th><th class="n">Votes</th></tr></thead>
      <tbody>
        <tr><td rowspan="2">Form 45 totals${f45.polling_stations ? html`<div class="hint num">${fmt(f45.polling_stations)} of ${fmt(f45.of_polling_stations ?? f45.polling_stations)} polling stations</div>` : ""}</td><td>${f45.leader.name}${party(f45.leader.party)}</td><td class="n">${fmt(f45.leader.votes)}</td></tr>
        <tr><td>${f45.declared_winner.name}${party(f45.declared_winner.party)}</td><td class="n">${fmt(f45.declared_winner.votes)}</td></tr>
        <tr><td>Form 47 (declared result)</td><td>${c.form47.winner.name}${party(c.form47.winner.party)}</td><td class="n">${fmt(c.form47.winner.votes)}</td></tr>
      </tbody>
    </table></div>
    <p class="hint">Sources, all published by the Election Commission of Pakistan: ${f45.sources.map((s, i) => html`${i ? ", " : ""}${sourceLink(s)}`)}; ${sourceLink(c.form47.source)}. Checked ${c.checked}.${
      c.found_via?.length ? html` The seat was identified from ${c.found_via.map((s, i) => html`${i ? ", " : ""}${sourceLink(s)}`)}; those compilations are not the evidence.` : ""
    }</p>
    <p class="hint">Why this label: see the project's editorial policy (docs/EDITORIAL_POLICY.md § Elections). Tribunal and court rulings on this seat are shown when recorded.</p>
  </section>`;
}

function sourceLink(s: { title: string; url?: string }): Raw {
  return s.url ? html`<a href="${safeHref(s.url)}" target="_blank" rel="noopener noreferrer">${s.title}</a>` : html`${s.title}`;
}
