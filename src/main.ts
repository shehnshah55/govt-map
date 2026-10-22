import "./fonts.css";
import "./styles.css";
// the graph as text, parsed once: JSON.parse is far faster than evaluating the same data as a JS object literal
import graphText from "../public/data/graph.json?raw";
import type { Graph, Sector } from "./schema.ts";
import { GraphIndex } from "./lib/graph-index.ts";
import { esc, raw } from "./ui/dom.ts";
import { hrefFor, labelKey, type Ctx, type View } from "./views/common.ts";
import { lawView, orgView, personView, placeView, postView } from "./views/entities.ts";
import { directoryView, electedView, officialsView } from "./views/directory.ts";
import { appointmentsView, mapView, parliamentView, treeView, verificationView } from "./views/insight.ts";
import { figureEvidenceView, figuresView } from "./views/figures.ts";
import { FIGURE_IDS } from "./lib/analytics.ts";
import { familiesView, familyView } from "./views/families.ts";
import { findView, sourcesView } from "./views/sources.ts";
import { redirectOldPath } from "./lib/find.ts";
import { aboutView, accountabilityView, exploreView, homeView, lawsView, searchView, sectorView, sectorsView } from "./views/pages.ts";

declare const __SINGLE__: boolean;
const REPO = "https://github.com/shehnshah55/govt-map";

const ix = new GraphIndex(JSON.parse(graphText) as Graph);
const app = document.getElementById("app")!;
let cleanup: void | (() => void);
let current = "/";

const ctx: Ctx = { ix, repo: REPO, go: navigate };

/** Pages that show classification labels get the key to them under the page heading. */
const LABELLED = new Set(["org", "departments", "post", "person", "place", "law", "laws", "tree", "map", "officials", "directory", "appointments", "accountability", "elected", "sector"]);

function route(path: string): View | undefined {
  const view = page(path);
  const segs = path.split("?")[0].split("/").filter(Boolean);
  // the figures page has none, but its evidence lists (#/figures/<figure>/<bar>) do
  const labelled = LABELLED.has(segs[0] ?? "") || (segs[0] === "figures" && segs.length >= 3);
  if (!view || !labelled) return view;
  // safe: both parts are already-rendered markup (escaped by html``); this only places the key after the page header
  const at = view.body.html.indexOf("</header>");
  const body = at < 0 ? view.body.html + labelKey().html : view.body.html.slice(0, at + 9) + labelKey().html + view.body.html.slice(at + 9);
  return { ...view, body: raw(body) };
}

function page(path: string): View | undefined {
  const [p, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  // a stray "%" in a link would make decodeURIComponent throw half-way through a render
  const seg = p.split("/").filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  switch (seg[0]) {
    case undefined:
      return homeView(ctx);
    case "org":
    case "departments": // alias: /departments/<id>
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
      // #/figures/<figure> without a bar (the home page's tiles) opens the page at that chart
      if (seg[1] && !seg[2]) return FIGURE_IDS.includes(seg[1]) ? figuresView(ctx, params, seg[1]) : undefined;
      return seg[1] ? figureEvidenceView(ctx, seg[1], seg[2], params) : figuresView(ctx, params);
    case "search":
      return searchView(ctx, (params.get("q") ?? "").slice(0, 200));
    case "find":
      return findView(ctx, params.get("q") ?? "");
    case "sources":
      return sourcesView(ctx);
    case "about":
      return aboutView(ctx, __SINGLE__);
  }
  return undefined;
}

/** Puts keyboard and screen-reader focus on the page's heading, so a new page is announced. */
function focusHeading() {
  const target = app.querySelector<HTMLElement>("h1") ?? app;
  target.tabIndex = -1;
  target.focus({ preventScroll: true });
}

/** A selector for the focused control, so a filter that redraws its own page can keep focus on it. */
function focusedControl(): string | undefined {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !app.contains(el)) return undefined;
  if (el.id) return `#${CSS.escape(el.id)}`;
  for (const attr of ["data-href", "data-tab", "data-unit"]) {
    const v = el.getAttribute(attr);
    if (v !== null) return `[${attr}="${CSS.escape(v)}"]`;
  }
  return undefined;
}

/** `moveFocus`: after a navigation the old focus is gone with the old page, so it goes to the new heading. */
function render(path: string, moveFocus = false) {
  const control = moveFocus ? focusedControl() : undefined;
  const moved = redirectOldPath(path);
  if (moved) {
    path = moved;
    try {
      history.replaceState(null, "", `#${path}`);
    } catch {
      /* sandboxed: keep state in memory */
    }
  }
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
  if (!moveFocus || app.contains(document.activeElement)) return; // a view that focused something itself keeps it
  // a control that redrew its own page (the Explore filters) keeps focus; otherwise the new page's heading takes it
  const same = control ? app.querySelector<HTMLElement>(control) : null;
  if (same) same.focus();
  else focusHeading();
}

/** Hash routing with an in-memory fallback for sandboxed frames that block history writes. */
function navigate(path: string) {
  if (path === current) return;
  try {
    history.pushState(null, "", `#${path}`);
  } catch {
    /* sandboxed: keep state in memory */
  }
  render(path, true);
}

document.addEventListener("click", (e) => {
  const a = (e.target as Element).closest?.("a");
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const href = a.getAttribute("href");
  if (href === "#app") {
    // the skip link: "#app" is not a route, so focus the content instead of navigating
    e.preventDefault();
    focusHeading();
    return;
  }
  if (!href?.startsWith("#/")) return;
  e.preventDefault();
  navigate(href.slice(1));
});
/** The route in the address bar. "#app" is the skip link's target, not a route: it means the page already shown. */
function hashRoute() {
  const p = location.hash.slice(1) || "/";
  return p === "app" ? current : p;
}
window.addEventListener("popstate", () => render(hashRoute(), true));
window.addEventListener("hashchange", () => {
  if (location.hash === "#app") {
    // reached without the click handler (e.g. typed): stay on the page and go to its content
    try {
      history.replaceState(null, "", `#${current}`);
    } catch {
      /* sandboxed */
    }
    focusHeading();
    return;
  }
  const p = hashRoute();
  if (p !== current) render(p, true);
});

// ── search box with suggestions ─────────────────────────────────────────────
const input = document.getElementById("q") as HTMLInputElement;
const box = document.getElementById("suggest")!;
let sel = -1;
/** The suggestion list is a combobox popup: keep aria-expanded and the active option in step with it. */
function setOpen(open: boolean) {
  box.hidden = !open;
  input.setAttribute("aria-expanded", String(open));
  // a closed list has no highlighted option: Enter then searches for what was typed
  if (!open) select(-1);
}
function select(i: number) {
  sel = i;
  const items = [...box.querySelectorAll<HTMLAnchorElement>("a")];
  items.forEach((a, k) => a.setAttribute("aria-selected", String(k === sel)));
  if (items[sel]) input.setAttribute("aria-activedescendant", items[sel].id);
  else input.removeAttribute("aria-activedescendant");
}
function showSuggestions() {
  const results = ix.search(input.value, 9);
  box.innerHTML = results
    .map((r) => `<a href="${esc(hrefFor(ix, r.id))}" role="option"><span class="chip">${esc(r.kind === "jurisdiction" ? "place" : r.kind === "organization" ? "body" : r.kind === "position" ? "post" : r.kind)}</span><span>${esc(r.label)}</span>${r.sub ? `<span class="sub">${esc(r.sub)}</span>` : ""}</a>`)
    .join("");
  box.querySelectorAll("a").forEach((a, i) => (a.id = `suggest-${i}`));
  setOpen(results.length > 0);
  select(-1);
}
input.addEventListener("input", showSuggestions);
input.addEventListener("focus", () => input.value && showSuggestions());
input.addEventListener("keydown", (e) => {
  const items = [...box.querySelectorAll<HTMLAnchorElement>("a")];
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (box.hidden) {
      if (input.value) showSuggestions();
      return;
    }
    select(Math.max(-1, Math.min(items.length - 1, sel + (e.key === "ArrowDown" ? 1 : -1))));
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (sel < 0 && !input.value.trim()) return;
    const target = items[sel]?.getAttribute("href") ?? `#/search?q=${encodeURIComponent(input.value)}`;
    setOpen(false);
    input.blur();
    navigate(target.slice(1));
  } else if (e.key === "Escape" && !box.hidden) {
    // the first Escape closes the list and keeps the text; a second one clears the field as usual
    e.preventDefault();
    setOpen(false);
  }
});
document.addEventListener("click", (e) => {
  if (!(e.target as Element).closest?.(".searchbox")) setOpen(false);
  else if ((e.target as Element).closest?.("#suggest a")) setOpen(false);
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

if (location.hash === "#app") {
  // a skip link opened in a new tab
  try {
    history.replaceState(null, "", "#/");
  } catch {
    /* sandboxed */
  }
}
render(hashRoute());
