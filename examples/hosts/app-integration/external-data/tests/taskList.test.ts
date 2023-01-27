/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("taskList", () => {
	beforeAll(async () => {
		// Wait for the page to load first before running any tests
		// so this time isn't attributed to the first test
		await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
	}, 45_000);

	beforeEach(async () => {
		await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/dot-notation
		await page.waitFor(() => window["fluidStarted"]);
	});

	it("loads and there's an input", async () => {
		// Validate the input shows up
		await page.waitForSelector("input");
	});
});
