import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

function resolveCachedExecutablePath(): string | undefined {
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  }
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return undefined;
  const cachedShell = path.join(
    localAppData,
    "ms-playwright",
    "chromium_headless_shell-1234",
    "chrome-headless-shell-win64",
    "chrome-headless-shell.exe"
  );
  if (fs.existsSync(cachedShell)) return cachedShell;
  const cachedChrome = path.join(
    localAppData,
    "ms-playwright",
    "chromium-1234",
    "chrome-win64",
    "chrome.exe"
  );
  return fs.existsSync(cachedChrome) ? cachedChrome : undefined;
}

const executablePath = resolveCachedExecutablePath();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run start -- -H 127.0.0.1 -p 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
