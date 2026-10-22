/** Official websites (#/sources), the "Official websites" panel on body pages, and Find a service (#/find). */
import type { OfficialSite, ServiceItem, ServiceKind, SiteCategory, SiteLevel, SiteStatus } from "../schema.ts";
import { rankRecords, rankSites } from "../lib/find.ts";
import { safeHref } from "../lib/safe-url.ts";
import { loadServiceItems, ServiceIndex, type ServiceHit } from "../lib/service-search.ts";
import { html, type Raw } from "../ui/dom.ts";
import { appointmentSentence, chain, hrefFor, legalList, link, relationRows, type Ctx, type View } from "./common.ts";
import { accountability, parseQuestion, resolveSubject, type Question, type Resolved } from "../lib/who-appoints.ts";
import { wireFilters } from "./entities.ts";

export const LEVEL_LABEL: Record<SiteLevel, string> = {
  federal: "Federal",
  punjab: "Punjab",
  sindh: "Sindh",
  kp: "Khyber Pakhtunkhwa",
  balochistan: "Balochistan",
  ict: "Islamabad",
  ajk: "Azad Jammu and Kashmir",
  gb: "Gilgit-Baltistan",
};

export const CATEGORY_LABEL: Record<SiteCategory, string> = {
  government: "Government offices and portals",
  legislature: "Legislatures",
  identity_travel: "Identity, passports and travel",
  tax_business: "Tax and business",
  social_protection: "Social protection",
  jobs_education: "Jobs and education",
  health: "Health",
  utilities: "Utilities",
  law_justice: "Law and justice",
  police_safety: "Police, rescue and safety",
  regulators: "Regulators",
  land_records: "Land records",
  citizen_services: "Citizen services",
  overseas: "Overseas Pakistanis",
  statistics: "Statistics",
};

const STATUS_LABEL: Record<SiteStatus, string> = {
  verified: "Checked",
  cert_issue: "Certificate problem",
  unreachable_from_ci: "Not reachable by our checker",
  verified_via_archive: "Checked via archive",
};
const STATUS_HELP: Record<SiteStatus, string> = {
  verified: "The homepage loaded when last checked.",
  cert_issue: "The site loads, but its security certificate is incomplete, so some browsers may warn.",
  unreachable_from_ci: "Our automated check could not load it. It may block automated checks or connections from outside Pakistan.",
  verified_via_archive:
    "The site blocks our checker (it may block connections from outside Pakistan), so the official homepage was confirmed from a recent web archive snapshot instead.",
};

const hostOf = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

function statusChip(s: OfficialSite): Raw {
  const cls = s.status === "verified" ? "st-filled" : s.status === "cert_issue" || s.status === "verified_via_archive" ? "st-acting" : "st-unknown";
  const chip = html`<span class="chip ${cls}" title="${STATUS_HELP[s.status]} Last checked ${s.checked}.">${STATUS_LABEL[s.status]}</span>`;
  return s.archive_url ? html`${chip} <a class="hint" href="${safeHref(s.archive_url)}" target="_blank" rel="noopener noreferrer">snapshot</a>` : chip;
}

function siteLink(s: OfficialSite): Raw {
  return html`<a href="${safeHref(s.url)}" target="_blank" rel="noopener noreferrer">${hostOf(s.url)}</a>`;
}

const sites = (ctx: Ctx): readonly OfficialSite[] => ctx.ix.g.official_sites ?? [];

export function sourcesView(ctx: Ctx): View {
  const { ix } = ctx;
  const all = [...sites(ctx)].sort((a, b) => Object.keys(LEVEL_LABEL).indexOf(a.level) - Object.keys(LEVEL_LABEL).indexOf(b.level) || a.name.localeCompare(b.name));
  const checked = all.filter((s) => s.status === "verified").length;
  const viaArchive = all.filter((s) => s.status === "verified_via_archive").length;
  const body = html`
    <header class="pagehead"><div class="eyebrow">Official websites</div><h1>Official government websites</h1>
      <p class="lede">The official websites of federal, provincial and territorial bodies, each linked to the body it belongs to. Only government domains and the official domains of statutory bodies are listed.</p>
      <p class="hint">${all.length} websites · ${checked} loaded when last checked${viaArchive ? html`, ${viaArchive} confirmed from a web archive snapshot` : ""}. Fees, forms and deadlines change: always confirm on the official site. <a href="${ctx.repo}/issues/new?template=correction.yml" target="_blank" rel="noopener noreferrer">Report a wrong or missing website</a>.</p></header>
    <div class="toolbar filters">
      <input type="search" data-filter="sites" placeholder="Filter by name, website or service" aria-label="Filter official websites" />
      <label>Government <select data-filter="sites" data-facet="level" id="sites-level"><option value="">All</option>${Object.entries(LEVEL_LABEL).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
      <label>Topic <select data-filter="sites" data-facet="category" id="sites-category"><option value="">All</option>${Object.entries(CATEGORY_LABEL).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
      <span class="hint num" data-count="sites">${all.length} shown</span>
    </div>
    <div class="tablewrap"><table data-rows="sites">
      <thead><tr><th>Website</th><th>Government</th><th>Topic</th><th>Body in the graph</th><th>Status</th></tr></thead>
      <tbody>${all.map(
        (s) => html`<tr data-level="${s.level}" data-category="${s.category}">
          <td><b>${s.name}</b>${s.name_ur ? html` <span class="hint" lang="ur" dir="rtl">${s.name_ur}</span>` : ""}<div>${siteLink(s)}</div>${
            s.services?.length ? html`<div class="hint">${s.services.slice(0, 6).join(" · ")}</div>` : ""
          }</td>
          <td>${LEVEL_LABEL[s.level]}</td>
          <td>${CATEGORY_LABEL[s.category]}</td>
          <td>${s.body_id && ix.org.has(s.body_id) ? link(ix, s.body_id) : html`<span class="hint">—</span>`}</td>
          <td>${statusChip(s)}<div class="hint num">${s.checked}</div></td>
        </tr>`,
      )}</tbody>
    </table></div>`;
  return { title: "Official websites", body, mount: (root) => wireFilters(root) };
}

/** Rail panel on a body page: every registry site tied to the body. Empty when there are none. */
export function officialSitesPanel(ctx: Ctx, bodyId: string): Raw {
  const mine = sites(ctx).filter((s) => s.body_id === bodyId);
  if (!mine.length) return html``;
  return html`<div class="panel"><h3>Official websites</h3><ul class="plain">${mine.map(
    (s) => html`<li>${siteLink(s)} ${statusChip(s)}${s.name !== ctx.ix.org.get(bodyId)?.name ? html`<div class="hint">${s.name}</div>` : ""}</li>`,
  )}</ul><p class="hint"><a href="#/sources">All official websites</a></p></div>`;
}

export const KIND_LABEL: Record<ServiceKind, string> = {
  form: "Form",
  fee: "Fees",
  procedure: "How to apply",
  contact: "Contact",
  notification: "Notification",
  other: "Service page",
};

const sizeLabel = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Who runs the page: the body in the graph when there is one, else the registry site's name. */
function department(ctx: Ctx, it: ServiceItem): Raw {
  return ctx.ix.org.has(it.body_id) ? link(ctx.ix, it.body_id) : html`${sites(ctx).find((s) => s.id === it.site_id)?.name ?? it.site_id}`;
}

/** Results from the service index: title, department, kind, last-checked date and the official link. */
export function serviceResults(ctx: Ctx, hits: readonly ServiceHit[], total: number): Raw {
  if (!total) return html`<p class="hint">The index of official pages is empty in this build.</p>`;
  if (!hits.length) return html`<p class="hint">No page or document in our index of ${total.toLocaleString("en")} official pages matched. Try other words, or use the official websites above.</p>`;
  return html`<ol class="rels plain services">${hits.map(({ item: it }) => {
    const href = safeHref(it.url);
    const host = hostOf(it.url).split("/")[0];
    return html`<li class="rel" data-kind="${it.kind}"><div class="verb">${KIND_LABEL[it.kind]}${it.type === "pdf" ? " · PDF" : it.type === "doc" ? " · Word" : ""}</div><div>
      <a href="${href}" target="_blank" rel="noopener noreferrer" dir="auto"${it.language === "ur" ? html` lang="ur"` : ""}><b>${it.title}</b></a>
      <div class="hint">${department(ctx, it)} · <span class="mono">${host}</span> · ${it.archive_url ? "archived" : "checked"} <span class="num">${it.fetched_at.slice(0, 10)}</span>${it.pages ? ` · ${it.pages} page${it.pages === 1 ? "" : "s"}` : ""}${it.size && it.type !== "html" ? ` · ${sizeLabel(it.size)}` : ""}</div>
      ${it.excerpt ? html`<div class="desc" dir="auto">“${it.excerpt}”</div>` : ""}${
        it.archive_url
          ? html`<div class="hint">Read from a <a href="${safeHref(it.archive_url)}" target="_blank" rel="noopener noreferrer">web archive copy</a> taken on <span class="num">${it.fetched_at.slice(0, 10)}</span>: the official site does not load from outside Pakistan. Always confirm on the official page.</div>`
          : ""
      }</div></li>`;
  })}</ol>`;
}

let serviceIndex: Promise<ServiceIndex> | undefined;
function getServiceIndex(ctx: Ctx): Promise<ServiceIndex> {
  serviceIndex ??= loadServiceItems().then((items) => {
    const names = new Map(sites(ctx).map((s) => [s.id, s]));
    return new ServiceIndex(items, (it) => {
      const org = ctx.ix.org.get(it.body_id);
      const site = names.get(it.site_id);
      return [org?.name, org?.short_name, org?.name_ur, site?.name, site?.name_ur, ...(site?.services ?? [])].filter(Boolean).join(" ");
    });
  });
  return serviceIndex;
}

const EXAMPLES = ["How do I renew my CNIC?", "Passport fee", "Domicile certificate", "FBR NTN registration", "NTN tax filer", "BISP Kafaalat", "shanakhti card banwane ka tareeqa", "بجلی کا بل", "phone blocked PTA", "vehicle registration Lahore", "Who appoints the Chief Election Commissioner?", "Whom does NEPRA answer to?"];

export function findView(ctx: Ctx, q: string): View {
  const { ix } = ctx;
  const query = q.trim();
  const siteHits = query ? rankSites(sites(ctx), query, ix) : [];
  const records = query ? rankRecords(ix, query) : [];
  const question = query ? parseQuestion(query) : undefined;
  const resolved = question ? resolveSubject(ix, question) : undefined;
  const redacted = /\[(?:CNIC|phone number|number|passport number|email) removed\]/.test(query);
  const body = html`
    <header class="pagehead"><div class="eyebrow">Find a service</div><h1>${query ? html`Where to go for “${query}”` : "Find a government service"}</h1>
      <p class="lede">Type a question in English, اردو or Roman Urdu. You get links to the official websites, to forms, fees and procedures on them, and to the bodies responsible: never an answer written by us.</p></header>
    <div class="toolbar"><input id="find-q" type="search" value="${query}" placeholder="e.g. How do I renew my CNIC?" aria-label="Your question" dir="auto" autocomplete="off" /><button type="button" id="find-go">Find</button></div>
    ${
      !query
        ? html`<section><h2>Try</h2><div class="sectors">${EXAMPLES.map((e) => html`<a href="#/find?q=${encodeURIComponent(e)}" dir="auto">${e}</a>`)}</div></section>`
        : html`${redacted ? html`<p class="hint" role="status">Personal numbers and email addresses are removed from questions before they reach the address bar or your browser history. You don't need them to find a service.</p>` : ""}
      ${question ? recordedAnswer(ctx, question, resolved) : ""}
      <section><h2>Official websites</h2>${
        siteHits.length
          ? html`<div class="rels">${siteHits.map(
              (h) => html`<div class="rel"><div class="verb">${LEVEL_LABEL[h.site.level]}</div><div><b>${h.site.name}</b> · ${siteLink(h.site)} ${statusChip(h.site)}${
                h.site.body_id && ix.org.has(h.site.body_id) ? html`<div class="hint">Run by ${link(ix, h.site.body_id)}</div>` : ""
              }</div>${h.matched ? html`<div class="desc" dir="auto">Matched “${h.matched}”</div>` : ""}</div>`,
            )}</div>`
          : html`<p class="hint">No official website matched. Try fewer words, or browse <a href="#/sources">all official websites</a>.</p>`
      }</section>
      <section><h2>Pages and documents on official websites</h2><div id="service-results" aria-live="polite"><p class="hint">Searching the index of official pages…</p></div></section>
      <section><h2>In the graph</h2>${
        records.length
          ? html`<div class="rels">${records.map((r) => html`<div class="rel"><div class="verb">${r.kind}</div><div><a href="${hrefFor(ix, r.id)}">${r.label}</a></div>${r.sub ? html`<div class="desc">${r.sub}</div>` : ""}</div>`)}</div>`
          : html`<p class="hint">No body, office or law matched.</p>`
      }</section>
      <p class="hint">Results are links, not advice. Fees, forms and deadlines change: confirm on the official site before you act.</p>`
    }`;
  return {
    title: query ? `Find a service: ${query}` : "Find a service",
    body,
    mount: (root) => {
      const input = root.querySelector<HTMLInputElement>("#find-q")!;
      const go = () => {
        const v = input.value.trim();
        if (v) ctx.go(`/find?q=${encodeURIComponent(v)}`);
      };
      root.querySelector("#find-go")!.addEventListener("click", go);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") go();
      });
      const box = root.querySelector<HTMLElement>("#service-results");
      let live = true;
      if (box && query)
        getServiceIndex(ctx)
          .then((index) => {
            // safe: serviceResults escapes every value through html``
            if (live) box.innerHTML = serviceResults(ctx, index.search(query, 20), index.items.length).html;
          })
          .catch(() => {
            if (live) box.innerHTML = html`<p class="hint">The index of official pages could not be loaded.</p>`.html;
          });
      return () => {
        live = false;
      };
    },
  };
}

/** "Who appoints X" and "whom does X answer to", read only from relationships recorded in the graph. */
function recordedAnswer(ctx: Ctx, q: Question, r: Resolved | undefined): Raw {
  const { ix } = ctx;
  const heading = q.kind === "appointer" ? "Who appoints" : "Whom it answers to";
  if (!r) return html`<section><h2>${heading}</h2><p class="hint">No post or body in the graph matched “${q.subject}”.</p></section>`;
  const others = r.others.length
    ? html`<p class="hint">Not this one? ${r.others.map((id, i) => html`${i ? " · " : ""}${link(ix, id)}`)}</p>`
    : "";
  const readAs = html`<p class="hint">Read as ${link(ix, r.id)}. From the relationships recorded in the graph; the legal basis links to each law.</p>`;
  if (q.kind === "appointer") {
    const post = ix.post.get(r.id);
    const body = post
      ? html`<p>${appointmentSentence(ix, post)}.</p>${chain(ix, post.id)}${
          post.appointment?.removal ? html`<p><b>Removal:</b> ${post.appointment.removal}</p>` : ""
        }${post.appointment?.term ? html`<p><b>Term:</b> ${post.appointment.term}</p>` : ""}<h3>Legal basis</h3>${legalList(ix, post.appointment?.legal_basis)}`
      : html`<p class="hint">No appointment is recorded for this body's head yet.</p>`;
    return html`<section class="recorded"><h2>${heading}</h2>${readAs}${body}${others}</section>`;
  }
  const a = accountability(ix, r.id);
  const rows = [relationRows(ix, a.out, "out"), relationRows(ix, a.in, "in")];
  const any = a.out.length || a.in.length || a.parent || a.post?.appointment;
  return html`<section class="recorded"><h2>${heading}</h2>${readAs}${
    any
      ? html`<div class="rels">${rows}${a.parent ? html`<div class="rel"><div class="verb">part of</div><div>${link(ix, a.parent)}</div></div>` : ""}</div>${
          a.post?.appointment ? html`<p>${appointmentSentence(ix, a.post)}.</p>${a.post.appointment.removal ? html`<p><b>Removal:</b> ${a.post.appointment.removal}</p>` : ""}` : ""
        }${a.org && a.org !== r.id ? html`<p class="hint">Relations shown include those of ${link(ix, a.org)}, the body this post belongs to.</p>` : ""}`
      : html`<p class="hint">No accountability relationship is recorded for this yet.</p>`
  }${others}</section>`;
}
