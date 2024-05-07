/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config.cjs";

describe("Bubblebench", () => {
	/**
	 * Bubble bench is currently at a state where it fails to run in a normal state with
	 * 2 clients due to the inability of the front end application to observe and react
	 * accordingly to backpressure on the server. Once the backpressure feature has been
	 * added to sharedtree and implemented in bubble bench, these tests should pass.
	 */
	describe.skip("SimpleTree", () => {
		beforeAll(async () => {
			// Wait for the page to load first before running any tests
			// so this time isn't attributed to the first test
			await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
			await page.waitForFunction(() => window["fluidStarted"]);
		}, 45000);

		beforeEach(async () => {
			await page.goto(globals.PATH, { waitUntil: "load" });
			await page.waitForFunction(() => window["fluidStarted"]);
		}, 50000);

		it("The page loads and displays current FPS", async () => {
			// Validate there is a button that can be clicked
			await expect(page).toMatchTextContent("FPS", { timeout: 0 });
		}, 20000);
	});
});
