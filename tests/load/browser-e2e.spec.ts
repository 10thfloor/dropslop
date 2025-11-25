import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

// Configuration from environment
const USERS = Number.parseInt(process.env.USERS || "10", 10);
const DROP_ID = process.env.DROP_ID || "demo-drop-1";
const BASE_URL = process.env.BASE_URL || "http://localhost:3005";
const RAMP_UP = Number.parseInt(process.env.RAMP_UP || "5", 10);

// Output directory for all test artifacts
const OUTPUT_DIR = path.join(process.cwd(), "tests/load/results");
const METRICS_FILE = path.join(OUTPUT_DIR, "metrics.jsonl");

// Initialize output directory and metrics file
test.beforeAll(async () => {
  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  // Clear previous metrics file
  try {
    fs.unlinkSync(METRICS_FILE);
  } catch {
    // File doesn't exist, that's fine
  }
});

function recordMetric(data: Record<string, unknown>) {
  const line = `${JSON.stringify({ ...data, timestamp: Date.now() })}\n`;
  fs.appendFileSync(METRICS_FILE, line);
}

// Calculate delay for ramp-up
function getRampUpDelay(userIndex: number): number {
  if (RAMP_UP === 0) return 0;
  return (userIndex / USERS) * RAMP_UP * 1000;
}

test.describe("Product Drop Load Test", () => {
  test.describe.configure({ mode: "parallel" });

  // Generate a test for each virtual user
  for (let i = 0; i < USERS; i++) {
    test(`User ${i + 1} - Complete Registration Flow`, async ({ page }) => {
      const startTime = Date.now();
      const testUserId = `load-user-${i}-${Date.now()}`;

      // Ramp-up delay to stagger users
      const delay = getRampUpDelay(i);
      if (delay > 0) {
        await page.waitForTimeout(delay);
      }

      try {
        // Step 1: Navigate to the drop page
        // NOTE: Don't use "networkidle" - SSE keeps connection open forever
        const navStart = Date.now();
        await page.goto(`${BASE_URL}/drop/${DROP_ID}`, {
          waitUntil: "domcontentloaded",
        });

        // Wait for the page to fully hydrate (SSE connected indicator shows "DROP ACTIVE")
        await expect(page.getByText("DROP ACTIVE")).toBeVisible({
          timeout: 15000,
        });
        const navDuration = Date.now() - navStart;

        // Step 2: Wait for the "ENTER THE DROP" button to be enabled
        const enterButton = page.getByRole("button", {
          name: /ENTER THE DROP/i,
        });
        await expect(enterButton).toBeEnabled({ timeout: 5000 });

        // Step 3: Click the enter button
        const clickStart = Date.now();
        await enterButton.click();

        // Step 4: Wait for registration to complete - look for success states
        // Note: We skip checking for "Solving..." text as it can disappear too fast
        // Either "REGISTERED" button text or success position message
        const registrationComplete = await Promise.race([
          // Success: Button shows "REGISTERED"
          page
            .getByRole("button", { name: /REGISTERED/i })
            .waitFor({ timeout: 60000 })
            .then(() => "success" as const),

          // Success: Position message appears
          page
            .getByText(/You're in! Position #\d+/i)
            .waitFor({ timeout: 60000 })
            .then(() => "success" as const),

          // Error: Error message appears
          page
            .getByText(/failed|error|Invalid/i)
            .waitFor({ timeout: 60000 })
            .then(() => "error" as const),

          // Timeout fallback
          page.waitForTimeout(60000).then(() => "timeout" as const),
        ]);

        const registrationDuration = Date.now() - clickStart;

        if (registrationComplete === "success") {
          // Extract position if visible
          let position: number | undefined;
          const positionText = await page
            .getByText(/Position #(\d+)/i)
            .textContent()
            .catch(() => null);
          if (positionText) {
            const match = positionText.match(/Position #(\d+)/i);
            if (match) position = Number.parseInt(match[1], 10);
          }

          recordMetric({
            userId: testUserId,
            userIndex: i,
            success: true,
            navDuration,
            registrationDuration,
            totalDuration: Date.now() - startTime,
            position,
          });
        } else {
          // Capture error message if any
          const errorText = await page
            .locator('[class*="error"], [class*="red"]')
            .first()
            .textContent()
            .catch(() => "Unknown error");

          recordMetric({
            userId: testUserId,
            userIndex: i,
            success: false,
            navDuration,
            registrationDuration,
            totalDuration: Date.now() - startTime,
            error:
              registrationComplete === "timeout"
                ? "Registration timeout"
                : errorText,
          });
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // Take a screenshot for debugging
        await page
          .screenshot({
            path: path.join(OUTPUT_DIR, `error-user-${i}.png`),
          })
          .catch(() => {});

        recordMetric({
          userId: testUserId,
          userIndex: i,
          success: false,
          totalDuration: Date.now() - startTime,
          error: errorMessage,
        });

        throw error;
      }
    });
  }

  // Print summary after all tests
  test.afterAll(async () => {
    // Wait for all metrics to be written
    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      const content = fs.readFileSync(METRICS_FILE, "utf-8").trim();
      if (!content) {
        console.log("\n⚠️ No metrics recorded\n");
        return;
      }

      const lines = content.split("\n");
      const metrics = lines.map((line) => JSON.parse(line));

      const successful = metrics.filter((m) => m.success);
      const failed = metrics.filter((m) => !m.success);

      // Calculate latency percentiles
      const regLatencies = successful
        .map((m) => m.registrationDuration)
        .filter((n): n is number => typeof n === "number")
        .sort((a, b) => a - b);

      const totalLatencies = successful
        .map((m) => m.totalDuration)
        .filter((n): n is number => typeof n === "number")
        .sort((a, b) => a - b);

      const percentile = (arr: number[], p: number) =>
        arr[Math.floor(arr.length * p)] || 0;

      console.log("\n");
      console.log("╔════════════════════════════════════════════════════════╗");
      console.log("║            🎯 LOAD TEST RESULTS                        ║");
      console.log("╠════════════════════════════════════════════════════════╣");
      console.log("║  Configuration:                                        ║");
      console.log(
        `║    Users:            ${USERS.toString().padStart(
          4
        )}                                ║`
      );
      console.log(
        `║    Ramp-up:          ${RAMP_UP.toString().padStart(
          4
        )}s                               ║`
      );
      console.log(
        `║    Drop ID:          ${DROP_ID.padEnd(20).slice(
          0,
          20
        )}              ║`
      );
      console.log("╠════════════════════════════════════════════════════════╣");
      console.log("║  Results:                                              ║");
      console.log(
        `║    Total:            ${metrics.length
          .toString()
          .padStart(4)}                                ║`
      );
      console.log(
        `║    ✅ Successful:    ${successful.length.toString().padStart(4)} (${(
          (successful.length / metrics.length) *
          100
        ).toFixed(0)}%)                           ║`
      );
      console.log(
        `║    ❌ Failed:        ${failed.length
          .toString()
          .padStart(4)}                                ║`
      );
      console.log("╠════════════════════════════════════════════════════════╣");

      if (regLatencies.length > 0) {
        console.log(
          "║  Registration Latency (ms):                            ║"
        );
        console.log(
          `║    p50:              ${percentile(regLatencies, 0.5)
            .toString()
            .padStart(5)}                              ║`
        );
        console.log(
          `║    p95:              ${percentile(regLatencies, 0.95)
            .toString()
            .padStart(5)}                              ║`
        );
        console.log(
          `║    p99:              ${percentile(regLatencies, 0.99)
            .toString()
            .padStart(5)}                              ║`
        );
        console.log(
          `║    Max:              ${(regLatencies[regLatencies.length - 1] || 0)
            .toString()
            .padStart(5)}                              ║`
        );
        console.log(
          "╠════════════════════════════════════════════════════════╣"
        );
        console.log(
          "║  Total E2E Latency (ms):                               ║"
        );
        console.log(
          `║    p50:              ${percentile(totalLatencies, 0.5)
            .toString()
            .padStart(5)}                              ║`
        );
        console.log(
          `║    p95:              ${percentile(totalLatencies, 0.95)
            .toString()
            .padStart(5)}                              ║`
        );
      }

      console.log("╚════════════════════════════════════════════════════════╝");

      if (failed.length > 0) {
        console.log("\n❌ Error Summary:");
        const errorCounts: Record<string, number> = {};
        for (const f of failed) {
          const err = (f.error as string) || "Unknown";
          errorCounts[err] = (errorCounts[err] || 0) + 1;
        }
        for (const [err, count] of Object.entries(errorCounts)) {
          console.log(`   ${count}x: ${err.slice(0, 60)}`);
        }
      }

      // Show positions distribution
      const positions = successful
        .map((m) => m.position)
        .filter((p): p is number => typeof p === "number");
      if (positions.length > 0) {
        console.log(
          `\n📊 Position range: #${Math.min(...positions)} - #${Math.max(
            ...positions
          )}`
        );
      }

      console.log("\n");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Failed to read metrics:", e);
      }
    }
  });
});
