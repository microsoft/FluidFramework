/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createRequire } from "node:module";

import { getTestPort } from "@fluidframework/test-tools";
import { defineConfig } from "@playwright/test";

import { baseConfig } from "../../playwright.config.base.js";

const { name } = createRequire(import.meta.url)("./package.json") as { name: string };
const testPort = getTestPort(name);
const baseURL = `http://localhost:${testPort}`;

export default defineConfig(baseConfig, {
	tsconfig: "./tsconfig.json",
	reporter: [["list"], ["junit", { outputFile: "nyc/playwright-junit-report.xml" }]],
	use: { baseURL },
	webServer: {
		command: `npm run start -- --port ${testPort}`,
		url: baseURL,
		reuseExistingServer: false,
	},
});
