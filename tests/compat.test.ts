import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL("../src", import.meta.url).pathname;
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith(".ts") ? [join(dir, f)] : []));

describe("browser compatibility", () => {
  it("no browser code uses a regular-expression lookbehind", () => {
    // Safari before 16.4 (iPhones that can't update past iOS 15) cannot parse "(?<=" or "(?<!": one
    // anywhere in the bundle stops the whole site from loading there. Capture the character instead.
    const found = files(SRC).flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .map((line, i) => [line, i + 1] as const)
        .filter(([line]) => /\(\?<[=!]/.test(line))
        .map(([, n]) => `${f.slice(SRC.length + 1)}:${n}`),
    );
    expect(found).toEqual([]);
  });
});
