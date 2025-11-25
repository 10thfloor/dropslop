import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // Output all artifacts to tests/load/results
  outputDir: "./tests/load/results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Browser tests are heavier - limit parallelism
  workers: process.env.CI ? 1 : Math.min(Number(process.env.WORKERS) || 4, 8),
  reporter: "list",
  use: {
    // Use the Next.js app URL
    baseURL: process.env.BASE_URL || "http://localhost:3005",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  // 2 minutes per test - PoW can take time under load
  timeout: 120000,
  // Action timeouts for individual operations
  expect: {
    timeout: 30000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
