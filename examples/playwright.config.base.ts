/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { devices, type PlaywrightTestConfig } from "@playwright/test";

export const baseConfig: PlaywrightTestConfig = {
	testDir: "tests",
	forbidOnly: !!process.env.CI,
	retries: 0,
	timeout: 60_000,
	outputDir: "nyc/test-results",
	reporter: [["list"], ["junit", { outputFile: "nyc/junit-report.xml" }]],
	use: {
		headless: true,
		launchOptions: {
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		},
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
};
