/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createRequire } from "node:module";
import { defineConfig } from "@playwright/test";
import { getTestPort } from "@fluidframework/test-tools";
import { baseConfig } from "../../playwright.config.base.js";

const { name } = createRequire(import.meta.url)("./package.json") as { name: string };
const testPort = getTestPort(name);
const baseURL = `http://localhost:${testPort}`;

export default defineConfig(baseConfig, {
	use: { baseURL },
	webServer: {
		command: `npm run start:test -- --no-live-reload --port ${testPort}`,
		url: baseURL,
		reuseExistingServer: false,
	},
});
