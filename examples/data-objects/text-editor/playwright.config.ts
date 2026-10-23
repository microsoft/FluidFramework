/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createRequire } from "node:module";

import { getTestPort } from "@fluidframework/test-tools";
import { defineConfig } from "@playwright/test";

import { baseConfig } from "../../playwright.config.base.js";

const { name } = createRequire(import.meta.url)("./package.json") as { name: string };

// The repository assigns a stable port to each package.
// This prevents port conflicts in CI.
const testPort = getTestPort(name);
const baseURL = `http://localhost:${testPort}`;

export default defineConfig(baseConfig, {
	use: { baseURL },
	// The browser tests use a real collaboration service. Start Tinylicious and the app first.
	webServer: [
		{
			command: "cross-env logger__level=crit npm run tinylicious",
			port: 7070,
			// Reuse a Tinylicious server that is already running.
			reuseExistingServer: true,
		},
		{
			// Webpack writes compile errors to the server output.
			// The browser overlay is disabled.
			// Therefore, compile errors cannot cover the UI during a test.
			command: `npm run start -- --no-hot --no-live-reload --no-client-overlay --port ${testPort}`,
			url: baseURL,
			reuseExistingServer: false,
		},
	],
});
