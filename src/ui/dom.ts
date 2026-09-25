/** Tiny HTML-string helpers. Every interpolated value must pass through esc(). */
export const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Tagged template that escapes interpolations unless they are wrapped with raw(). */
export class Raw {
  constructor(readonly html: string) {}
  toString() {
    return this.html;
  }
}
export const raw = (html: string) => new Raw(html);

export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
  let out = strings[0];
  values.forEach((v, i) => {
    out += render(v) + strings[i + 1];
  });
  return new Raw(out);
}

function render(v: unknown): string {
  if (v instanceof Raw) return v.html;
  if (Array.isArray(v)) return v.map(render).join("");
  if (v === false || v == null) return "";
  return esc(v);
}

export const when = (cond: unknown, fn: () => Raw | string): Raw | string => (cond ? fn() : "");

export function routeHref(route: string) {
  return `#${route}`;
}
