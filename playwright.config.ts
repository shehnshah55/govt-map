import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests: npm run test:e2e after npm run build.
 * No browser is downloaded. Locally, CHROME_PATH points at a Chromium already on the machine;
 * in CI the runner's system Chrome is used.
 */
const executablePath = process.env.CHROME_PATH;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173/",
    ...(executablePath ? { launchOptions: { executablePath } } : { channel: "chrome" }),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 800 }, isMobile: false } },
  ],
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/",
    reuseExistingServer: !process.env.CI,
  },
});
