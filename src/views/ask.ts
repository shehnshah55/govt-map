/**
 * Ask (#/ask) and the public services directory (#/services). Inspired by Ask Pakistan: plain
 * questions in English, Urdu or Roman Urdu, answered with links to official sources, and a plain
 * "not covered" when the records don't hold the answer. Everything runs in the browser.
 */
import { ask, displayName, EXAMPLES, isOfficialUrl, type Answer, type Piece } from "../lib/ask.ts";
import type { GraphIndex, Org } from "../lib/graph-index.ts";
import { redact } from "../lib/redact.ts";
import { safeHref } from "../lib/safe-url.ts";
import type { ServiceGroup, Source } from "../schema.ts";
import { html, type Raw } from "../ui/dom.ts";
import { hrefFor, link, type Ctx, type View } from "./common.ts";
import { electionTags } from "./election-labels.ts";

const SCOPE =
  "Ask can tell you who holds a post, who appoints it, whom it answers to, what a public body does, the law behind it, and which body to go to for a public service. It does not know procedures, fees or documents, and it holds no news or opinions.";

const PRIVACY =
  "Nothing you type is sent anywhere: Ask runs in your browser. CNIC, passport and phone numbers and email addresses are removed before your question is read or put in the address bar.";

export const GROUP_LABEL: Record<ServiceGroup, string> = {
  identity: "Identity documents",
  travel: "Travel and working abroad",
  tax: "Tax",
  welfare: "Welfare and pensions",
  health: "Health",
  jobs: "Government jobs",
  education: "Education",
  utilities: "Electricity, gas and telecoms",
  complaints: "Complaints and accountability",
  police: "Police and safety",
  courts: "Courts",
  emergencies: "Emergencies",
  land: "Land",
  business: "Business, records and post",
  elections: "Elections",
};

const askHref = (q: string) => `#/ask?q=${encodeURIComponent(q)}`;

function pieces(ix: GraphIndex, ps: Piece[], tagPeople: boolean): Raw {
  return html`${ps.map((p) => {
    if (typeof p === "string") return p;
    const person = tagPeople ? ix.person.get(p.id) : undefined;
    return html`${link(ix, p.id, p.text ?? displayName(ix, p.id))}${person ? html` ${electionTags(ix, person)}` : ""}`;
  })}`;
}

function sourceList(ix: GraphIndex, sources: Source[]): Raw {
  if (!sources.length) return html``;
  return html`<section class="ans-part"><h3>Sources</h3><ul class="plain">${sources.map(
    (s) =>
      html`<li>${s.url ? html`<a href="${safeHref(s.url)}" target="_blank" rel="noopener noreferrer">${s.title}</a>` : s.title} ${
        isOfficialUrl(ix, s.url) ? html`<span class="tag ok" title="A government website, or the body's own website">Official</span>` : s.url ? html`<span class="tag flag-info" title="A news report or other secondary source">Secondary</span>` : ""
      }</li>`,
  )}</ul></section>`;
}

function bodyRow(ix: GraphIndex, o: Org): Raw {
  const where = ix.place.get(o.jurisdiction);
  return html`<li>${link(ix, o.id)}${where && o.jurisdiction !== "pk" ? html` <span class="hint">· ${where.name}</span>` : ""} ${
    o.website ? html`<a class="tag ok" href="${safeHref(o.website)}" target="_blank" rel="noopener noreferrer">Official website ↗</a>` : html`<span class="hint">· website not yet recorded</span>`
  }</li>`;
}

function serviceCards(ix: GraphIndex, a: Answer): Raw {
  return html`<div class="svc-list">${a.services.map(
    (s) => html`<article class="svc">
      <h3>${s.topic.title}</h3>
      ${s.topic.title_ur ? html`<p class="urdu" lang="ur" dir="rtl">${s.topic.title_ur}</p>` : ""}
      <ul class="plain">${s.bodies.map((o) => bodyRow(ix, o))}</ul>
      ${s.topic.notes ? html`<p class="hint">${s.topic.notes}</p>` : ""}
    </article>`,
  )}</div>
  <p class="hint">Steps, fees and documents change often, so they are not copied here. Follow the body's official website, and check the address before you enter personal details.</p>`;
}

function answerPanel(ctx: Ctx, a: Answer): Raw {
  const { ix } = ctx;
  const notices: Raw[] = [];
  if (a.removed.length) notices.push(html`<p class="ans-note">Removed from your question before it was read: ${a.removed.join(", ")}. It was not stored or sent anywhere.</p>`);
  if (a.lang !== "en" && a.status === "answered") notices.push(html`<p class="ans-note">Answers are in English for now. Names are shown in Urdu where the record has them. <span class="urdu" lang="ur" dir="rtl">جوابات فی الحال انگریزی میں ہیں۔</span></p>`);
  if (a.closest) notices.push(html`<p class="ans-note">No name in your question matched a record exactly. This is the closest match; check it is what you meant.</p>`);
  if (a.ignored.length) notices.push(html`<p class="ans-note">Not recognised: ${a.ignored.map((w, i) => html`${i ? ", " : ""}“${w}”`)}. This answer covers only the part of the question Ask understood.</p>`);
  const subjectUr = a.subject ? (ix.org.get(a.subject)?.name_ur ?? ix.person.get(a.subject)?.name_ur ?? ix.place.get(a.subject)?.name_ur) : undefined;
  const laws = a.laws.length
    ? html`<section class="ans-part"><h3>Legal basis</h3><ul class="plain">${a.laws.map((l) => html`<li>${link(ix, l.law)}${l.provision ? html` <span class="cite">${l.provision}</span>` : ""}</li>`)}</ul></section>`
    : "";
  const choices = a.choices.length
    ? html`<section class="ans-part"><h3>${a.status === "ambiguous" ? "Which did you mean?" : a.status === "not_covered" ? "Closest records" : "Also matches"}</h3><ul class="plain">${a.choices.map((id) => html`<li>${link(ix, id, displayName(ix, id))}</li>`)}</ul></section>`
    : "";
  let main: Raw;
  if (a.status === "not_covered")
    main = html`<p><b>The graph doesn't answer this.</b></p><p>${SCOPE}</p>
      <p class="btnrow"><a class="btn ghost" href="#/search?q=${encodeURIComponent(a.question)}">Search the graph instead</a><a class="btn ghost" href="#/services">Public services directory</a></p>`;
  else if (a.status === "ambiguous") main = html`<p><b>Several records match.</b> Choose one below, or add a place or body to your question (for example “Governor of Sindh”).</p>`;
  else if (a.services.length) main = serviceCards(ix, a);
  else main = html`<div class="ans-lines">${a.lines.map((l) => html`<p>${pieces(ix, l, a.intent === "holder")}</p>`)}</div>`;
  return html`<section class="panel answer" aria-labelledby="ans-h">
    <h2 id="ans-h" class="visually-hidden">Answer</h2>
    <p class="hint">You asked: <q dir="auto" ${a.lang === "ur" ? html`lang="ur" class="urdu"` : ""}>${a.question}</q></p>
    ${a.readAs ? html`<p class="readas"><span class="hint">Read as</span> ${pieces(ix, a.readAs, false)}</p>` : ""}
    ${subjectUr ? html`<p class="urdu" lang="ur" dir="rtl">${subjectUr}</p>` : ""}
    ${notices}
    ${main}
    ${laws}
    ${a.services.length ? "" : sourceList(ix, a.sources)}
    ${choices}
    <p class="hint ans-foot">${a.subject ? html`<a href="${hrefFor(ix, a.subject)}">Open the full page for ${displayName(ix, a.subject)} →</a> · ` : ""}Wrong or out of date? <a href="${ctx.repo}/issues/new?template=correction.yml" target="_blank" rel="noopener noreferrer">Report a correction</a>.</p>
  </section>`;
}

export function askView(ctx: Ctx, q: string): View {
  const a = ask(ctx.ix, q);
  const examples = html`<section><h2>Try a question</h2><ul class="examples">${EXAMPLES.map(
    (e) => html`<li><a class="chip-btn${e.lang === "ur" ? " urdu" : ""}" href="${askHref(e.q)}" ${e.lang === "ur" ? html`lang="ur" dir="rtl"` : ""}>${e.q}</a></li>`,
  )}</ul></section>`;
  const body = html`
    <header class="pagehead"><div class="eyebrow">Ask</div><h1>Ask about the government</h1>
      <p class="lede">Who holds a post, who appoints it, whom it answers to, what a public body does, and where to go for a public service. Ask in English, Urdu or Roman Urdu.</p>
      <p class="urdu" lang="ur" dir="rtl">انگریزی، اردو یا رومن اردو میں سوال پوچھیں۔</p></header>
    <div class="stack">
      <div>
        <div class="askbox" role="search" aria-label="Ask a question">
          <label for="ask-q" class="visually-hidden">Your question</label>
          <input id="ask-q" type="text" dir="auto" autocomplete="off" maxlength="300" value="${a.question}" placeholder="Who appoints the Chief Justice? · CM Punjab kaun hai?" />
          <button class="btn" type="button" data-ask>Ask</button>
        </div>
        <p class="hint" style="margin-top:8px">${PRIVACY}</p>
      </div>
      ${a.status === "empty" ? html`${examples}<p class="hint">${SCOPE} For services, see the <a href="#/services">public services directory</a>.</p>` : answerPanel(ctx, a)}
      ${a.status !== "empty" ? examples : ""}
      <p class="hint">Ask is modelled on <a href="https://pakistangov.online" target="_blank" rel="noopener noreferrer">Ask Pakistan</a>, an independent AI search for government services. This version uses no AI: it reads a fixed set of question types and answers only from this site's cited records, so it cannot make up an answer.</p>
    </div>`;
  const mount = (root: HTMLElement) => {
    // a shared link may carry numbers typed before redaction existed, or pasted by hand: take them out of the address bar
    if (a.removed.length) {
      try {
        history.replaceState(null, "", askHref(a.question));
      } catch {
        /* sandboxed frame */
      }
    }
    // no <form>: the page has no form anywhere (CSP form-action 'none', and tests/security.test.ts bans the tag)
    const button = root.querySelector<HTMLButtonElement>("[data-ask]");
    const input = root.querySelector<HTMLInputElement>("#ask-q");
    if (!button || !input) return;
    if (a.status === "empty") input.focus();
    const submit = () => {
      const text = redact(input.value).text.trim();
      if (text) ctx.go(`/ask?q=${encodeURIComponent(text)}`);
    };
    button.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        submit();
      }
    });
  };
  return { title: a.question ? `Ask: ${a.question}` : "Ask", body, mount };
}

export function servicesView(ctx: Ctx): View {
  const { ix } = ctx;
  const groups = (Object.keys(GROUP_LABEL) as ServiceGroup[]).map((g) => [g, ix.g.services.filter((s) => s.group === g)] as const).filter(([, s]) => s.length);
  const sites = ix.g.organizations.filter((o) => o.website && o.kind !== "political_party" && !o.abolished).sort((a, b) => (a.jurisdiction === "pk" ? 0 : 1) - (b.jurisdiction === "pk" ? 0 : 1) || a.jurisdiction.localeCompare(b.jurisdiction) || a.name.localeCompare(b.name));
  const unrecorded = ix.g.organizations.filter((o) => !o.website && o.kind !== "political_party" && !o.abolished && !o.generated).length;
  const body = html`
    <header class="pagehead"><div class="eyebrow">Public services</div><h1>Where to go for a public service</h1>
      <p class="lede">Which public body handles each common service, with its official website. To ask in your own words, in English, Urdu or Roman Urdu, use <a href="#/ask">Ask</a>.</p></header>
    <div class="stack">
      <p class="hint">Each entry names the body responsible and links its official website. Steps, fees and documents change often, so they are not copied here: follow the body's own site.</p>
      ${groups.map(
        ([g, services]) => html`<section><h2>${GROUP_LABEL[g]}</h2><div class="svc-list">${services.map(
          (s) => html`<article class="svc" id="svc-${s.id}">
            <h3>${s.title}</h3>
            ${s.title_ur ? html`<p class="urdu" lang="ur" dir="rtl">${s.title_ur}</p>` : ""}
            <ul class="plain">${s.bodies.map((id) => ix.org.get(id)).filter((o): o is Org => !!o).map((o) => bodyRow(ix, o))}</ul>
            ${s.notes ? html`<p class="hint">${s.notes}</p>` : ""}
          </article>`,
        )}</div></section>`,
      )}
      <section><h2>Official websites in the graph <span class="count num">${sites.length}</span></h2>
        <p class="hint">Every public body in the graph with a recorded website. ${unrecorded} more bodies have no website recorded yet; additions with a source are welcome.</p>
        <div class="tablewrap"><table><thead><tr><th>Body</th><th>Government</th><th>Website</th></tr></thead><tbody>${sites.map(
          (o) => html`<tr><td>${link(ix, o.id)}</td><td>${ix.tierOf(o.jurisdiction)?.name ?? ""}</td><td><a href="${safeHref(o.website)}" target="_blank" rel="noopener noreferrer">${hostOf(o.website!)}</a></td></tr>`,
        )}</tbody></table></div>
      </section>
    </div>`;
  return { title: "Public services", body };
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
