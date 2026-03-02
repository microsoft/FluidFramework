/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import puppeteer, { Browser, Page } from "puppeteer";
import { globals } from "../jest.config.cjs";

describe("app-integration-container-views", () => {
	let browser: Browser;
	let page: Page;

	beforeAll(async () => {
		// Launch the browser once for all tests
		// Use chrome-headless-shell since some tests don't work as-is with the new headless mode.
		// AB#7150: Remove this once we have fixed the tests.
		browser = await puppeteer.launch({ headless: "shell" });
		// Load the page once to avoid a cold load on first test - otherwise the first test takes
		// significantly longer to load. This way we can extend just the timeout for the cold load.
		page = await browser.newPage();
		await page.goto(globals.PATH);
		await page.waitForFunction(() => typeof globalThis.loadAdditionalContainer === "function");
		await page.close();
	}, 20_000);

	beforeEach(async () => {
		page = await browser.newPage();
		await page.goto(globals.PATH);
		await page.waitForFunction(() => typeof globalThis.loadAdditionalContainer === "function");
	});

	it("loads and there's a button with Roll", async () => {
		// Validate there is a button that can be clicked
		await expect(page).toClick("button", { text: "Roll" });
	});

	afterEach(async () => {
		await page.close();
	});

	afterAll(async () => {
		await browser.close();
	});
});
