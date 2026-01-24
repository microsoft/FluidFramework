/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import puppeteer, { Browser, Page } from "puppeteer";
import { globals } from "../jest.config.cjs";
import type { IBlobCollection } from "../src/container/index.js";

describe("blobs", () => {
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

	it("loads and there's a button with Add blob", async () => {
		// Validate there is a button that can be clicked
		await expect(page).toClick("button", { text: "Add blob" });
	});

	it("can attach and be loaded in a second container", async () => {
		// Validate there is a button that can be clicked
		await expect(page).toClick("button", { text: "Attach container" });
		// The url will update to include the id in the hash once the attach completes. We need to
		// wait for this because the attach proceeds async after clicking the attach button, otherwise
		// we'll try to load the additional container before the attach completes.
		await page.waitForFunction(() => window.location.hash.length > 0);
		const blobsCountP = page.evaluate(async () => {
			// Load an additional container, and use it to watch for an expected blob addition
			const container = await globalThis.loadAdditionalContainer();
			const blobCollection = (await container.getEntryPoint()) as IBlobCollection;
			return new Promise<number>((resolve) => {
				blobCollection.events.on("blobAdded", () => resolve(blobCollection.getBlobs().length));
			});
		});
		await expect(page).toClick("button", { text: "Add blob" });
		const blobsCount = await blobsCountP;
		expect(blobsCount).toBe(1);
	});

	afterEach(async () => {
		await page.close();
	});

	afterAll(async () => {
		await browser.close();
	});
});
