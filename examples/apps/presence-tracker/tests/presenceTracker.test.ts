/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config.cjs";

describe("presence-tracker", () => {
	beforeAll(async () => {
		// Wait for the page to load first before running any tests
		// so this time isn't attributed to the first test
		await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
		await page.waitForFunction(() => window["fluidStarted"]);
	}, 45000);

	beforeEach(async () => {
		await page.goto(globals.PATH, { waitUntil: "load" });
		await page.waitForFunction(() => window["fluidStarted"]);
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

	it("Pointer Content exists", async () => {
		await page.waitForFunction(() => document.getElementById("pointer-position"));
	});

	it("Current User is displayed", async () => {
		const elementHandle = await page.waitForFunction(() =>
			document.getElementById("focus-div"),
		);
		const innerHTML = await page.evaluate(
			(element) => element?.innerHTML.trim(),
			elementHandle,
		);
		console.log(innerHTML?.startsWith("Current user"));
		expect(innerHTML).toMatch(/^Current user:/);
	});

	it("Current User is missing focus", async () => {
		const elementHandle = await page.waitForFunction(() =>
			document.getElementById("focus-div"),
		);
		const innerHTML = await page.evaluate(
			(element) => element?.innerHTML.trim(),
			elementHandle,
		);
		expect(innerHTML?.endsWith("has focus")).toBe(true);
	});
});
