import { defineConfig } from "vitest/config";

// Unit and data tests only; browser tests in e2e/ run with Playwright (npm run test:e2e).
export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
