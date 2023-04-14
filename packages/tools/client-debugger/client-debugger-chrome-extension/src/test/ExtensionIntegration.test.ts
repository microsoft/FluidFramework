/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import Path from "path";

import Puppeteer, { Browser, Page } from "puppeteer";

// Paths are relative to dist/test
const extensionPath = Path.resolve(__dirname, "..");
// const backgroundScriptPath = Path.join("..", "background", "BackgroundScript.js");
// const devtoolsScriptPath = Path.join("..", "devtools", "DevtoolsScript.js");
// const contentScriptPath = Path.join("..", "content", "ContentScript.js");

describe("Devtools Chromium extension integration tests", () => {
	let browser: Browser | undefined;
	let page: Page | undefined;

	beforeAll(async () => {
		browser = await Puppeteer.launch({
			headless: true,
			slowMo: 250,
			devtools: true,
			args: [
				// https://github.com/puppeteer/puppeteer/blob/master/docs/troubleshooting.md#setting-up-chrome-linux-sandbox
				"--no-sandbox",
				"--disable-setuid-sandbox",
				// Tell puppeteer we want to load the web extension
				`--disable-extensions-except=${extensionPath}`,
				`--load-extension=${extensionPath}`,
				"--show-component-extension-options",
			],
		});

		// Creates a new tab
		page = await browser.newPage();

		// navigates to some specific page
		await page.goto("https://google.com");
	});

	afterAll(async () => {
		// Tear down the browser
		await browser!.close();
	});

	// eslint-disable-next-line jest/expect-expect
	it("Smoke test", async () => {
		expect(true).toBe(true);
	});
});
