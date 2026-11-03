import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 90000,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "../artifacts/browser-results",
  use: {
    baseURL: "http://localhost:3001",
    browserName: "chromium",
    channel: "chrome",
    viewport: { width: 1440, height: 1050 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: { args: ["--disable-dev-shm-usage", "--no-sandbox"] },
  },
});
