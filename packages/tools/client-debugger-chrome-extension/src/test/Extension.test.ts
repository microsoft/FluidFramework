/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// eslint-disable-next-line unicorn/import-style, unicorn/prefer-node-protocol
import * as Path from "path";
import Puppeteer from "puppeteer";

// Relative to dist/test
const extensionBuildPath = Path.resolve(__dirname, "..");

const testPageUrl = "http://localhost:8080/";

describe("Debugger Browser Extension tests", () => {
	let browser: Puppeteer.Browser | undefined;
	let page: Puppeteer.Page | undefined;

	beforeEach(async () => {
		// Launch the browser and navigate to the app page.
		browser = await Puppeteer.launch({
			// slowMo: 250,
			headless: false, // extension are allowed only in head-full mode
			args: [
				`--load-extension=${extensionBuildPath}`,
				"--no-sandbox",
				"--disable-setuid-sandbox",
			],
		});

		page = await browser.newPage();
		await page.goto(testPageUrl);
	});

	afterEach(async () => {
		await browser?.close();
		// eslint-disable-next-line require-atomic-updates
		browser = undefined;
	});

	it("Debugger only appears after being activated", () => {
		// Verify the debugger is not visible
		// Simulate click of extension button
		// Verify debugger is visible
		// Simulate click of extension button
		// Verify debugger is not visible
		expect(true).toBe(true); // TODO
	});
});
