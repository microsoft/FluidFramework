/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import puppeteer, { Browser, Page } from "puppeteer";
import { globals } from "../jest.config.cjs";
import type { IClaimsDataObject } from "../src/container/index.js";

describe("claims-example", () => {
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

	it("The page loads and there is a Claim button", async () => {
		// Validate there is a button that can be clicked
		await expect(page).toClick("button", { text: "Claim" });
	});

	it("propagates a claim and resolves the handle in other connected containers", async () => {
		const key = "shared-key";
		const ownerP = page.evaluate(async (claimKey: string) => {
			// Load an additional container, and use it to watch for the expected claim
			const container = await globalThis.loadAdditionalContainer();
			const claimsDataObject = (await container.getEntryPoint()) as IClaimsDataObject;
			return new Promise<string | undefined>((resolve) => {
				claimsDataObject.on("claimsChanged", () => {
					// The other client resolves the claimed handle to the same backing
					// directory and reads the owner recorded on it.
					if (claimsDataObject.claimedKeys.includes(claimKey)) {
						resolve(claimsDataObject.getOwner(claimKey));
					}
				});
			});
		}, key);

		// Type a key and claim it from the main container.
		await expect(page).toFill("input", key);
		await expect(page).toClick("button", { text: "Claim" });
		const owner = await ownerP;
		expect(typeof owner).toBe("string");
	});

	afterEach(async () => {
		await page.close();
	});

	afterAll(async () => {
		await browser.close();
	});
});
