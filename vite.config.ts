import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// `vite build`               → dist/ (static site; deploy anywhere, e.g. GitHub Pages)
// `vite build --mode single` → dist-single/index.html (one self-contained file)
export default defineConfig(({ mode }) => ({
  base: "./",
  define: { __SINGLE__: JSON.stringify(mode === "single") },
  plugins: mode === "single" ? [viteSingleFile()] : [],
  build: {
    outDir: mode === "single" ? "dist-single" : "dist",
    chunkSizeWarningLimit: 2500,
  },
}));
