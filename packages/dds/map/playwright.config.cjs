/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { defineConfig } = require("@playwright/test");

const os = require("os");
const path = require("path");

module.exports = defineConfig({
	testDir: "./src/test/mocha",
	testMatch: "**/browser.test.cjs",
	timeout: 30000,
	outputDir: path.join(os.tmpdir(), "playwright-temp"), // Use system temp directory
	use: {
		headless: true,
		screenshot: "off", // Disable screenshots
		video: "off", // Disable video recording
		trace: "off", // Disable trace collection
	},
	webServer: {
		command: "npm run test:browser:serve",
		port: 8080,
		timeout: 120000,
		reuseExistingServer: true,
	},
});
