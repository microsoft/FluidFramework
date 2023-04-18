/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import Path from "path";

import Puppeteer, { Browser, Page, Target } from "puppeteer";

// Paths are relative to src/test
const extensionPath = Path.resolve(__dirname, "..", "..", "dist");

describe("Devtools Chromium extension integration tests", () => {
	let browser: Browser | undefined;
	let page: Page | undefined;

	beforeAll(async () => {
		browser = await Puppeteer.launch({
			headless: false,
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
	}, 10_000);

	beforeEach(async () => {
		const targets = await browser!.targets();

		const backgroundTarget: Target | undefined = targets.find(
			(_target) => _target.type() === "service_worker",
		);

		if (backgroundTarget === undefined) {
			throw new Error("Could not find background page.");
		}

		const backgroundWorker = await backgroundTarget.worker();

		// Creates a new tab
		page = await browser!.newPage();
		await page.goto(`file://${__dirname}/index.html`, { waitUntil: "load" });
	});

	afterEach(async () => {
		await page?.close();
	});

	afterAll(async () => {
		// Tear down the browser
		await browser?.close();
	});

	// eslint-disable-next-line jest/expect-expect
	it("Smoke test", async () => {
		// TODO: extract ID to constant
		await page!.waitForSelector("#fluid-devtools-view"); // Will fail if not found
	}, 150_000);
});
