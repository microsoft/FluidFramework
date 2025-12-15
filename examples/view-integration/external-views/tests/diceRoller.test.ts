/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import puppeteer, { Browser, Page } from "puppeteer";
import { globals } from "../jest.config.cjs";
import type { IDiceRoller } from "../src/container/index.js";

describe("app-integration-external-views", () => {
	let browser: Browser;
	let page: Page;

	beforeEach(async () => {
		browser = await puppeteer.launch();
		page = await browser.newPage();
		await page.goto(globals.PATH);
	});

	it("loads and there's a button with Roll", async () => {
		// Validate there is a button that can be clicked
		await expect(page).toClick("button", { text: "Roll" });
	});

	it("raises an event in other connected containers", async () => {
		const diceValueP = page.evaluate(async () => {
			// Load an additional container, and use it to watch for an expected roll
			const container = await globalThis.loadAdditionalContainer();
			const diceRoller = (await container.getEntryPoint()) as IDiceRoller;
			return new Promise<number>((resolve) => {
				diceRoller.events.on("diceRolled", () => resolve(diceRoller.value));
			});
		});
		// Click the button, triggering a roll from the main container
		await expect(page).toClick("button", { text: "Roll" });
		const diceValue = await diceValueP;
		expect(diceValue).toBeGreaterThanOrEqual(1);
		expect(diceValue).toBeLessThanOrEqual(6);
	});

	afterEach(async () => {
		await browser.close();
	});
});
