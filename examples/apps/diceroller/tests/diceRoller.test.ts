/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidMountableViewEntryPoint } from "@fluid-example/example-utils";
import puppeteer, { Browser, Page } from "puppeteer";

import { globals } from "../jest.config.cjs";
import type { IDiceRoller } from "../src/container/main.js";

describe("diceroller", () => {
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

	it("The page loads and there's a button with Roll", async () => {
		// Validate there is a button that can be clicked
		await expect(page).toClick("button", { text: "Roll" });
	});

	it("raises an event in other connected containers", async () => {
		const diceValueP = page.evaluate(async () => {
			// Load an additional container, and use it to watch for an expected roll
			const container = await globalThis.loadAdditionalContainer();
			const { getDefaultDataObject } =
				(await container.getEntryPoint()) as IFluidMountableViewEntryPoint;
			const diceRoller = (await getDefaultDataObject()) as IDiceRoller;
			return new Promise<number>((resolve) => {
				diceRoller.on("diceRolled", () => resolve(diceRoller.value));
			});
		});
		// Click the button, triggering a roll from the main container
		await expect(page).toClick("button", { text: "Roll" });
		const diceValue = await diceValueP;
		expect(diceValue).toBeGreaterThanOrEqual(1);
		expect(diceValue).toBeLessThanOrEqual(6);
	});

	afterEach(async () => {
		await page.close();
	});

	afterAll(async () => {
		await browser.close();
	});
});
