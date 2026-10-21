import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { basemap } from "../scripts/build-basemap.ts";

describe("base map", () => {
  it("src/geo/basemap.json matches what scripts/build-basemap.ts makes from the atlas", () => {
    const file = readFileSync(new URL("../src/geo/basemap.json", import.meta.url), "utf8");
    expect(file).toBe(JSON.stringify(basemap()) + "\n");
  });
});
