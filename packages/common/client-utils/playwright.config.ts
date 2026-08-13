/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	// Run against the built test output (matches the pattern used by mocha:esm tests).
	testDir: "lib/test/playwright",
	forbidOnly: !!process.env.CI,
	retries: 0,
	timeout: 60_000,
	reporter: [["list"], ["junit", { outputFile: "nyc/junit-report.xml" }]],
	use: {
		headless: true,
		launchOptions: {
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		},
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
