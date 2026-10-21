/** Official websites (#/sources), the "Official websites" panel on body pages, and Find a service (#/find). */
import type { OfficialSite, SiteCategory, SiteLevel, SiteStatus } from "../schema.ts";
import { rankRecords, rankSites } from "../lib/find.ts";
import { safeHref } from "../lib/safe-url.ts";
import { html, type Raw } from "../ui/dom.ts";
import { hrefFor, link, type Ctx, type View } from "./common.ts";
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
};
const STATUS_HELP: Record<SiteStatus, string> = {
  verified: "The homepage loaded when last checked.",
  cert_issue: "The site loads, but its security certificate is incomplete, so some browsers may warn.",
  unreachable_from_ci: "Our automated check could not load it. It may block automated checks or connections from outside Pakistan.",
};

const hostOf = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

function statusChip(s: OfficialSite): Raw {
  const cls = s.status === "verified" ? "st-filled" : s.status === "cert_issue" ? "st-acting" : "st-unknown";
  return html`<span class="chip ${cls}" title="${STATUS_HELP[s.status]} Last checked ${s.checked}.">${STATUS_LABEL[s.status]}</span>`;
}

function siteLink(s: OfficialSite): Raw {
  return html`<a href="${safeHref(s.url)}" target="_blank" rel="noopener noreferrer">${hostOf(s.url)}</a>`;
}

const sites = (ctx: Ctx): readonly OfficialSite[] => ctx.ix.g.official_sites ?? [];

export function sourcesView(ctx: Ctx): View {
  const { ix } = ctx;
  const all = [...sites(ctx)].sort((a, b) => Object.keys(LEVEL_LABEL).indexOf(a.level) - Object.keys(LEVEL_LABEL).indexOf(b.level) || a.name.localeCompare(b.name));
  const checked = all.filter((s) => s.status === "verified").length;
  const body = html`
    <header class="pagehead"><div class="eyebrow">Official websites</div><h1>Official government websites</h1>
      <p class="lede">The official websites of federal, provincial and territorial bodies, each linked to the body it belongs to. Only government domains and the official domains of statutory bodies are listed.</p>
      <p class="hint">${all.length} websites · ${checked} loaded when last checked. Fees, forms and deadlines change: always confirm on the official site. <a href="${ctx.repo}/issues/new?template=correction.yml" target="_blank" rel="noopener noreferrer">Report a wrong or missing website</a>.</p></header>
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

const EXAMPLES = ["How do I renew my CNIC?", "Passport fee", "NTN tax filer", "BISP Kafaalat", "shanakhti card banwane ka tareeqa", "بجلی کا بل", "phone blocked PTA", "vehicle registration Lahore"];

export function findView(ctx: Ctx, q: string): View {
  const { ix } = ctx;
  const query = q.trim();
  const siteHits = query ? rankSites(sites(ctx), query, ix) : [];
  const records = query ? rankRecords(ix, query) : [];
  const body = html`
    <header class="pagehead"><div class="eyebrow">Find a service</div><h1>${query ? html`Where to go for “${query}”` : "Find a government service"}</h1>
      <p class="lede">Type a question in English, اردو or Roman Urdu. You get links to the official websites and the bodies responsible, never an answer written by us.</p></header>
    <div class="toolbar"><input id="find-q" type="search" value="${query}" placeholder="e.g. How do I renew my CNIC?" aria-label="Your question" dir="auto" autocomplete="off" /><button type="button" id="find-go">Find</button></div>
    ${
      !query
        ? html`<section><h2>Try</h2><div class="sectors">${EXAMPLES.map((e) => html`<a href="#/find?q=${encodeURIComponent(e)}" dir="auto">${e}</a>`)}</div></section>`
        : html`
      <section><h2>Official websites</h2>${
        siteHits.length
          ? html`<div class="rels">${siteHits.map(
              (h) => html`<div class="rel"><div class="verb">${LEVEL_LABEL[h.site.level]}</div><div><b>${h.site.name}</b> · ${siteLink(h.site)} ${statusChip(h.site)}${
                h.site.body_id && ix.org.has(h.site.body_id) ? html`<div class="hint">Run by ${link(ix, h.site.body_id)}</div>` : ""
              }</div>${h.matched ? html`<div class="desc" dir="auto">Matched “${h.matched}”</div>` : ""}</div>`,
            )}</div>`
          : html`<p class="hint">No official website matched. Try fewer words, or browse <a href="#/sources">all official websites</a>.</p>`
      }</section>
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
    },
  };
}
