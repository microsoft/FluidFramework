/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { resolve } from "node:path";
import { devices, type PlaywrightTestConfig } from "@playwright/test";

export const baseConfig: PlaywrightTestConfig = {
	testDir: "tests",
	forbidOnly: !!process.env.CI, // Fail the build on CI if `test.only` is left in the source code.
	retries: 0,
	timeout: 60_000,
	outputDir: "nyc/test-results",
	reporter: [["list"], [resolve(__dirname, "../scripts/playwright-reporter.cjs")]],
	use: {
		headless: true,
		launchOptions: {
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		},
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
};
