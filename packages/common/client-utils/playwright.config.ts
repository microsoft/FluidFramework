/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	// Run against the built test output (matches the pattern used by mocha:esm tests).
	testDir: "lib/test/playwright",
	forbidOnly: !!process.env.CI,
	retries: 0,
	timeout: 60_000,
	outputDir: "nyc/test-results",
	reporter: [
		["list"],
		[fileURLToPath(new URL("../../../scripts/playwright-reporter.cjs", import.meta.url))],
	],
	use: {
		headless: true,
		launchOptions: {
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		},
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
