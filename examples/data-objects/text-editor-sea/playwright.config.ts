/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defineConfig } from "@playwright/test";

import { baseConfig } from "../../playwright.config.base.js";

const testPort = 8082;
const baseURL = `http://localhost:${testPort}`;

export default defineConfig(baseConfig, {
	use: { baseURL },
	webServer: {
		// Webpack writes compile errors to the server output.
		// The browser overlay is disabled.
		// Therefore, compile errors cannot cover the UI during a test.
		command: `npm run start -- --no-hot --no-live-reload --no-client-overlay --port ${testPort}`,
		url: baseURL,
		reuseExistingServer: true,
	},
});
