import { createHash } from "node:crypto";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * The single-file build inlines the app's script, fonts and data, so the policy in index.html
 * ('self' only) would block it. This gives that build its own policy: inline scripts are allowed
 * by their SHA-256 hash (never 'unsafe-inline'), and fonts by data: URL.
 */
function singleFileCsp(): Plugin {
  return {
    name: "single-file-csp",
    enforce: "post",
    generateBundle(_options, bundle) {
      const page = bundle["index.html"];
      if (!page || page.type !== "asset") return;
      let html = String(page.source);
      const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
        .filter(([tag]) => !/\ssrc=/.test(tag.slice(0, tag.indexOf(">"))))
        .map(([, body]) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
      if (!hashes.length) this.error("single-file build has no inline script to hash");
      const before = html;
      html = html.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/, (_m, a, policy: string, b) =>
        a +
        policy
          .replace("script-src 'self'", `script-src ${hashes.join(" ")}`)
          .replace("font-src 'self'", "font-src data:") +
          b,
      );
      if (html === before) this.error("single-file build: Content-Security-Policy meta not found in index.html");
      page.source = html;
    },
  };
}

// `vite build`               → dist/ (static site; deploy anywhere, e.g. GitHub Pages)
// `vite build --mode single` → dist-single/index.html (one self-contained file)
export default defineConfig(({ mode }) => ({
  base: "./",
  define: { __SINGLE__: JSON.stringify(mode === "single") },
  plugins: mode === "single" ? [viteSingleFile(), singleFileCsp()] : [],
  build: {
    outDir: mode === "single" ? "dist-single" : "dist",
    chunkSizeWarningLimit: 2500,
  },
}));
