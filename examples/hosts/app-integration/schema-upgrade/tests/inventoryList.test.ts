/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

// Tests disabled -- requires Tinylicious to be running, which our test environment doesn't do.
describe("inventoryList", () => {
	beforeAll(async () => {
		// Wait for the page to load first before running any tests
		// so this time isn't attributed to the first test
		await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
	}, 45000);

	beforeEach(async () => {
		await page.goto(globals.PATH, { waitUntil: "load" });
		await page.waitFor(() => window["fluidStarted"]);
	});

	it("loads and there's an input", async () => {
		// Validate the input shows up
		await page.waitForSelector("input");
	});

	it("can click the migrate debug button", async () => {
		// Validate there is a button that can be clicked
		await expect(page).toClick("button", { text: '"two"' });
	});

	it("shows the correct code version at pageload", async () => {
		// Validate the migration status shows "one"
		await page.waitForSelector(".migration-status");
		const containsOne = await page.evaluate(() => {
			const migrationStatusElement = document.querySelector(".migration-status");
			return migrationStatusElement?.textContent?.includes("one") === true;
		});
		await expect(containsOne).toEqual(true);
	});

	it("migrates and shows the correct code version after migration", async () => {
		// Validate the migration status shows "one" initially
		await page.waitForSelector(".migration-status");
		const leftContainsOne = await page.evaluate(() => {
			const migrationStatusElements = document.querySelectorAll(".migration-status");
			return migrationStatusElements[0]?.textContent?.includes("one") === true;
		});
		const rightContainsOne = await page.evaluate(() => {
			const migrationStatusElements = document.querySelectorAll(".migration-status");
			return migrationStatusElements[1]?.textContent?.includes("one") === true;
		});
		await expect(leftContainsOne).toEqual(true);
		await expect(rightContainsOne).toEqual(true);

		await expect(page).toClick("button", { text: '"two"' });

		await new Promise((resolve) => {
			setTimeout(resolve, 500);
		});

		// Validate the migration status shows "two" after the migration
		const leftContainsTwo = await page.evaluate(() => {
			const migrationStatusElements = document.querySelectorAll(".migration-status");
			return migrationStatusElements[0]?.textContent?.includes("two") === true;
		});
		const rightContainsTwo = await page.evaluate(() => {
			const migrationStatusElements = document.querySelectorAll(".migration-status");
			return migrationStatusElements[1]?.textContent?.includes("two") === true;
		});
		await expect(leftContainsTwo).toEqual(true);
		await expect(rightContainsTwo).toEqual(true);
	});
});
