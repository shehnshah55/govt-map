import "./fonts.css";
import "./styles.css";
import graphData from "../public/data/graph.json";
import type { Graph, Sector } from "./schema.ts";
import { GraphIndex } from "./lib/graph-index.ts";
import { esc, raw } from "./ui/dom.ts";
import { hrefFor, type Ctx, type View } from "./views/common.ts";
import { lawView, orgView, personView, placeView, postView } from "./views/entities.ts";
import { directoryView, electedView, officialsView } from "./views/directory.ts";
import { appointmentsView, mapView, parliamentView, treeView, verificationView } from "./views/insight.ts";
import { figureEvidenceView, figuresView } from "./views/figures.ts";
import { familiesView, familyView } from "./views/families.ts";
import { askView, sourcesView } from "./views/sources.ts";
import { aboutView, accountabilityView, exploreView, homeView, lawsView, searchView, sectorView, sectorsView } from "./views/pages.ts";

declare const __SINGLE__: boolean;
const REPO = "https://github.com/shehnshah55/govt-map";

const ix = new GraphIndex(graphData as unknown as Graph);
const app = document.getElementById("app")!;
let cleanup: void | (() => void);
let current = "/";

const ctx: Ctx = { ix, repo: REPO, go: navigate };

function route(path: string): View | undefined {
  const [p, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const seg = p.split("/").filter(Boolean).map(decodeURIComponent);
  switch (seg[0]) {
    case undefined:
      return homeView(ctx);
    case "org":
    case "departments": // CivLab-style alias: /departments/<id>
      return orgView(ctx, seg[1]);
    case "post":
      return postView(ctx, seg[1]);
    case "person":
      return personView(ctx, seg[1]);
    case "place":
      return placeView(ctx, seg[1]);
    case "law":
      return lawView(ctx, seg[1]);
    case "laws":
      return lawsView(ctx);
    case "explore":
      return exploreView(ctx, params);
    case "sectors":
      return sectorsView(ctx);
    case "sector":
      return sectorView(ctx, seg[1] as Sector);
    case "directory":
      return directoryView(ctx, seg[1]);
    case "elected":
      return electedView(ctx);
    case "officials":
      return officialsView(ctx, seg[1]);
    case "parliament":
      return parliamentView(ctx);
    case "appointments":
      return appointmentsView(ctx);
    case "tree":
      return treeView(ctx);
    case "map":
      return mapView(ctx);
    case "verification":
      return verificationView(ctx);
    case "accountability":
      return accountabilityView(ctx);
    case "families":
      return familiesView(ctx);
    case "family":
      return familyView(ctx, seg[1]);
    case "figures":
      return seg[1] ? figureEvidenceView(ctx, seg[1], seg[2] ?? "", params) : figuresView(ctx, params);
    case "search":
      return searchView(ctx, params.get("q") ?? "");
    case "ask":
      return askView(ctx, params.get("q") ?? "");
    case "sources":
      return sourcesView(ctx);
    case "about":
      return aboutView(ctx, __SINGLE__);
  }
  return undefined;
}

function render(path: string) {
  current = path;
  if (typeof cleanup === "function") cleanup();
  cleanup = undefined;
  const view = route(path) ?? {
    title: "Not found",
    // safe: the only dynamic value, the path from the address bar, passes through esc()
    body: raw(`<header class="pagehead"><h1>Not found</h1><p class="lede">Nothing in the graph matches <span class="mono">${esc(path)}</span>. Try the search box.</p></header>`),
  };
  app.innerHTML = view.body.html;
  document.title = view.title === "Pakistan Government Graph" ? view.title : `${view.title} · Pakistan Government Graph`;
  document.querySelectorAll<HTMLAnchorElement>(".nav a").forEach((a) => {
    const target = a.getAttribute("href")!.slice(1);
    a.toggleAttribute("aria-current", target !== "/" && path.startsWith(target));
    if (a.hasAttribute("aria-current")) a.setAttribute("aria-current", "page");
  });
  document.querySelectorAll<HTMLDetailsElement>(".nav details").forEach((d) => (d.open = false));
  window.scrollTo(0, 0);
  cleanup = view.mount?.(app) ?? undefined;
}

/** Hash routing with an in-memory fallback for sandboxed frames that block history writes. */
function navigate(path: string) {
  if (path === current) return;
  try {
    history.pushState(null, "", `#${path}`);
  } catch {
    /* sandboxed: keep state in memory */
  }
  render(path);
}

document.addEventListener("click", (e) => {
  const a = (e.target as Element).closest?.("a");
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const href = a.getAttribute("href");
  if (!href?.startsWith("#/")) return;
  e.preventDefault();
  navigate(href.slice(1));
});
window.addEventListener("popstate", () => render(location.hash.slice(1) || "/"));
window.addEventListener("hashchange", () => {
  const p = location.hash.slice(1) || "/";
  if (p !== current) render(p);
});

// ── search box with suggestions ─────────────────────────────────────────────
const input = document.getElementById("q") as HTMLInputElement;
const box = document.getElementById("suggest")!;
let sel = -1;
function showSuggestions() {
  const results = ix.search(input.value, 9);
  sel = -1;
  box.hidden = !results.length;
  box.innerHTML = results
    .map((r) => `<a href="${esc(hrefFor(ix, r.id))}" role="option"><span class="chip">${esc(r.kind === "jurisdiction" ? "place" : r.kind === "organization" ? "body" : r.kind === "position" ? "post" : r.kind)}</span><span>${esc(r.label)}</span>${r.sub ? `<span class="sub">${esc(r.sub)}</span>` : ""}</a>`)
    .join("");
}
input.addEventListener("input", showSuggestions);
input.addEventListener("focus", () => input.value && showSuggestions());
input.addEventListener("keydown", (e) => {
  const items = [...box.querySelectorAll<HTMLAnchorElement>("a")];
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    sel = Math.max(-1, Math.min(items.length - 1, sel + (e.key === "ArrowDown" ? 1 : -1)));
    items.forEach((a, i) => a.setAttribute("aria-selected", String(i === sel)));
  } else if (e.key === "Enter") {
    e.preventDefault();
    const target = items[sel]?.getAttribute("href") ?? `#/search?q=${encodeURIComponent(input.value)}`;
    box.hidden = true;
    input.blur();
    navigate(target.slice(1));
  } else if (e.key === "Escape") {
    box.hidden = true;
  }
});
document.addEventListener("click", (e) => {
  if (!(e.target as Element).closest?.(".searchbox")) box.hidden = true;
  else if ((e.target as Element).closest?.("#suggest a")) box.hidden = true;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== input && !(e.target as Element).closest?.("input,select,textarea")) {
    e.preventDefault();
    input.focus();
  }
});

// ── theme toggle (per-viewer convenience) ───────────────────────────────────
const toggle = document.getElementById("theme")!;
function applyTheme(t: string | null) {
  if (t) document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
}
try {
  applyTheme(localStorage.getItem("pgg-theme"));
} catch {
  /* storage unavailable */
}
toggle.addEventListener("click", () => {
  const dark = document.documentElement.getAttribute("data-theme") === "dark" || (!document.documentElement.hasAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
  const next = dark ? "light" : "dark";
  applyTheme(next);
  try {
    localStorage.setItem("pgg-theme", next);
  } catch {
    /* ignore */
  }
  render(current); // graph colours are read from CSS tokens at mount
});

render(location.hash.slice(1) || "/");
