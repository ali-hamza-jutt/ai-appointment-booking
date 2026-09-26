import { defineConfig, devices } from "@playwright/test";

const API_PORT = 4100;
const WEB_PORT = 3100;
const FAKE_MISTRAL_PORT = 4010;
const isCI = Boolean(process.env.CI);

export const API_URL = `http://localhost:${API_PORT}/api`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

/**
 * Runs the real API and web app against a fake Mistral server, so the chat
 * flow is exercised end to end without network calls. The API uses the
 * database in DATABASE_URL (server/.env locally); tests create their own data.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: WEB_URL,
    timezoneId: "UTC",
    locale: "en-GB",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Lets a machine with a preinstalled Chromium skip `playwright install`.
        ...(process.env.E2E_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: [
    {
      command: "node support/fake-mistral.mjs",
      port: FAKE_MISTRAL_PORT,
      env: { FAKE_MISTRAL_PORT: String(FAKE_MISTRAL_PORT) },
      reuseExistingServer: !isCI,
    },
    {
      command: "npx tsx src/server.ts",
      cwd: "../server",
      url: `${API_URL}/health`,
      timeout: 120_000,
      reuseExistingServer: !isCI,
      env: {
        PORT: String(API_PORT),
        WEB_ORIGIN: WEB_URL,
        MISTRAL_API_KEY: "e2e-fake-key",
        MISTRAL_API_URL: `http://localhost:${FAKE_MISTRAL_PORT}/v1`,
        // Verification emails and codes are logged rather than sent.
        NODE_ENV: "development",
      },
    },
    {
      command: "npm run build && npm run start -- --port " + WEB_PORT,
      cwd: "../web",
      url: WEB_URL,
      timeout: 300_000,
      reuseExistingServer: !isCI,
      env: { NEXT_PUBLIC_API_BASE_URL: API_URL },
    },
  ],
});
