/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defineConfig } from "@playwright/test";

import { baseConfig } from "../../playwright.config.base.js";

const preset = process.env.SEA_LOADER_PRESET ?? "split";
if (preset !== "split" && preset !== "combined") {
	throw new Error("SEA_LOADER_PRESET must be split or combined");
}
const baseURL = process.env.INVENTORY_TEST_URL ?? "http://localhost:8091";

// eslint-disable-next-line import-x/no-default-export -- Playwright requires a default configuration export.
export default defineConfig({
	...baseConfig,
	workers: 1,
	use: {
		...baseConfig.use,
		baseURL,
		launchOptions: {
			...baseConfig.use?.launchOptions,
			...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH === undefined
				? {}
				: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }),
		},
	},
	webServer: {
		command: `pnpm start --port 8091 --host 0.0.0.0 --env seaPreset=${preset}`,
		url: baseURL,
		reuseExistingServer: process.env.CI === undefined || process.env.CI === "",
		timeout: 120_000,
	},
});
