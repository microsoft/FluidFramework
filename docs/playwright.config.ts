/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defineConfig, devices } from "@playwright/test";

const frontendPort = 3000;
const frontEndUrl = `http://localhost:${frontendPort}`;

export default defineConfig({
	// Look for test files in the "test" directory, relative to this configuration file.
	testDir: "test",

	// Fail the build on CI if you accidentally left test.only in the source code.
	forbidOnly: !!process.env.CI,

	// Don't retry on failure.
	retries: 0,

	// Reporter to use
	reporter: [
		// Console output
		["line"],
		// JUnit XML report file output for CI
		["junit", { outputFile: "test-results/junit-report.xml" }],
	],

	use: {
		// Base URL to use in actions like `await page.goto('/')`.
		baseURL: frontEndUrl,

		// Collect trace when retrying the failed test.
		trace: "on-first-retry",

		// Generate screenshots when a test fails
		screenshot: "only-on-failure",
	},
	// Configure projects for major browsers.
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	// Run your local dev server before starting the tests.
	webServer: [
		// Run front-end dev server
		{
			command: "npm run serve -- --no-open",
			url: frontEndUrl,
			reuseExistingServer: !process.env.CI,
		},
	],
});
