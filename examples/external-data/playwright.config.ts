/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createRequire } from "node:module";
import { defineConfig } from "@playwright/test";
import { getTestPort } from "@fluidframework/test-tools";
import { baseConfig } from "../playwright.config.base.js";

const { name } = createRequire(import.meta.url)("./package.json") as { name: string };
const testPort = getTestPort(name);
const baseURL = `http://localhost:${testPort}`;

export default defineConfig(baseConfig, {
	// These tests start their own services on fixed ports (e.g. 5236), so they cannot run
	// in parallel without colliding on EADDRINUSE. Run sequentially in a single worker.
	fullyParallel: false,
	workers: 1,
	use: { baseURL },
	webServer: {
		command: `npm run start:client:test -- --port ${testPort}`,
		url: baseURL,
		reuseExistingServer: !process.env.CI,
	},
});
