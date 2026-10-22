import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests: npm run test:e2e after npm run build.
 * No browser is downloaded. Locally, CHROME_PATH points at a Chromium already on the machine;
 * in CI the runner's system Chrome is used.
 */
const executablePath = process.env.CHROME_PATH;
/**
 * The preview server's port (E2E_PORT, default 4173). The tests always start their own server and
 * never reuse one already listening: on a shared machine that could be another checkout's build, which
 * gives results for the wrong code. If the port is taken, the run stops with an error; set E2E_PORT.
 */
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}/`,
    ...(executablePath ? { launchOptions: { executablePath } } : { channel: "chrome" }),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 800 }, isMobile: false } },
  ],
  webServer: {
    command: `npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
  },
});
