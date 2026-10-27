import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Cortex PWA.
 *
 * Uses WebKit (Safari's engine) — the same engine as real iOS Safari.
 * This gives us real Safari CSS rendering, real safe-area handling,
 * and real offline behavior — without an iPhone.
 *
 * NOT COVERED:
 *  - iOS-specific runtime behaviors (standalone status bar rendering,
 *    install prompt flow) — those need a physical iPhone.
 *  - Real notch hardware — safe-area insets are emulated by viewport.
 *
 * Run via: pnpm test:pwa
 * Requires dev server running on localhost:3000 (pnpm dev, or build+start).
 */
export default defineConfig({
  testDir: "./tests/pwa",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "iPhone 14 Pro",
      use: {
        ...devices["iPhone 14 Pro"],
      },
    },
    {
      name: "iPhone 14",
      use: {
        ...devices["iPhone 14"],
      },
    },
    {
      name: "iPhone SE",
      use: {
        ...devices["iPhone SE"],
      },
    },
    {
      name: "Android Pixel 7",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
});
