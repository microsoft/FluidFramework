/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config.cjs";

describe("taskList", () => {
	beforeAll(async () => {
		// Wait for the page to load first before running any tests
		// so this time isn't attributed to the first test
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
		await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/dot-notation
		await page.waitForFunction(() => window["fluidStarted"]);
	}, 45_000);
	beforeEach(async () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
		await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/dot-notation
		await page.waitForFunction(() => window["fluidStarted"]);
	});

	it.skip("loads and there's an input", async () => {
		// Validate the input shows up
		await page.waitForSelector("input");
	});
});
