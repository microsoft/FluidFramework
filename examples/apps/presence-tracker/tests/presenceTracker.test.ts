/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("Presence Tracker", () => {
	beforeAll(async () => {
		// Wait for the page to load first before running any tests
		// so this time isn't attributed to the first test
		await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
	}, 45000);

	beforeEach(async () => {
		await page.goto(globals.PATH, { waitUntil: "load" });
		// eslint-disable-next-line @typescript-eslint/dot-notation, @typescript-eslint/no-unsafe-return
		await page.waitFor(() => window["fluidStarted"]);
	});

	it("Document is connected", async () => {
		await page.waitForFunction(() => document.isConnected);
	});

	it("Focus Content exists", async () => {
		await page.waitForFunction(() => document.getElementById("focus-content"));
	});

	it("Focus Div exists", async () => {
		await page.waitForFunction(() => document.getElementById("focus-div"));
	});

	it("Mouse Content exists", async () => {
		await page.waitForFunction(() => document.getElementById("mouse-position"));
	});

	it("Current User is displayed", async () => {
		await page.waitForFunction(
			() => document.getElementById("focus-div")?.innerHTML.startsWith("Current user"),
			{ timeout: 10000 },
		);
	});

	it("Current User has focus after focusing", async () => {
		await page.click("*");
		await page.waitForFunction(
			() => document.getElementById("focus-div")?.innerHTML.endsWith("has focus"),
			{ timeout: 10000 },
		);
	});
});
