/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config.cjs";

describe("staging", () => {
	beforeAll(async () => {
		// Wait for the page to load first before running any tests
		// so this time isn't attributed to the first test
		await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
		await page.waitForFunction(() => window["fluidStarted"]);
	}, 45000);

	describe("Smoke test", () => {
		beforeEach(async () => {
			await page.goto(globals.PATH, { waitUntil: "load" });
			await page.waitForFunction(() => window["fluidStarted"]);
		});

		it("loads and there's an input", async () => {
			// Validate the input shows up
			await page.waitForSelector("input");
		});
	});
});
