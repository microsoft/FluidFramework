/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createRequire } from "node:module";
import { defineConfig, devices } from "@playwright/test";
import { getTestPort } from "@fluidframework/test-tools";

const { name } = createRequire(import.meta.url)("./package.json") as { name: string };
const testPort = getTestPort(name);
const baseURL = `http://localhost:${testPort}`;

export default defineConfig({
	testDir: "tests",
	// These tests start their own services on fixed ports (e.g. 5236), so they cannot run
	// in parallel without colliding on EADDRINUSE. Run sequentially in a single worker.
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: 0,
	timeout: 60_000,
	reporter: [["list"], ["junit", { outputFile: "nyc/junit-report.xml" }]],
	use: {
		baseURL,
		headless: true,
		launchOptions: {
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		},
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: `npm run start:client:test -- --port ${testPort}`,
		url: baseURL,
		reuseExistingServer: !process.env.CI,
	},
});
