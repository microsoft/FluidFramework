/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config.cjs";

describe("table", () => {
	beforeAll(async () => {
		await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
		await page.waitForFunction(() => window["fluidStarted"]);
	}, 45000);

	beforeEach(async () => {
		await page.goto(globals.PATH, { waitUntil: "load" });
		await page.waitForFunction(() => window["fluidStarted"]);
	});

	it("The page loads and there's a textbox with placeholder Row ID", async () => {
		// Verify that our "add row" UI exists on the page as a simple smoke test to verify that the page has been loaded correctly
		await expect(page).toClick("button", { text: "Add Row" });
	});
});
