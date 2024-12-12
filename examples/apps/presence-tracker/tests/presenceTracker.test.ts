/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import puppeteer, { type Page } from "puppeteer";

import { globals } from "../jest.config.cjs";

let page2: Page;

const initializeBrowser = async () => {
	const browser = await puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
	});

	return browser;
};

describe("presence-tracker", () => {
	beforeAll(async () => {
		// Wait for the page to load first before running any tests
		// so this time isn't attributed to the first test
		await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
		await page.waitForFunction(() => (window as any).fluidStarted as unknown);
	}, 45000);

	beforeEach(async () => {
		await page.goto(globals.PATH, { waitUntil: "load" });
		await page.waitForFunction(() => (window as any).fluidStarted as unknown);
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
		const elementHandle = await page.waitForFunction(() =>
			document.getElementById("focus-div"),
		);
		const innerHTML = await page.evaluate(
			(element) => element?.innerHTML.trim(),
			elementHandle,
		);
		expect(innerHTML).toMatch(/^User session .*?: has focus/);
	});

	it("Current user has focus", async () => {
		const elementHandle = await page.waitForFunction(() =>
			document.getElementById("focus-div"),
		);
		const innerHTML = await page.evaluate(
			(element) => element?.innerHTML.trim(),
			elementHandle,
		);
		expect(innerHTML?.endsWith("has focus")).toBe(true);
	});

	describe("Multiple users", () => {
		beforeEach(async () => {
			await page.goto(globals.PATH, { waitUntil: "load" });
			await page.waitForFunction(() => (window as any).fluidStarted as unknown);

			const secondBrowser = await initializeBrowser();
			page2 = await secondBrowser.newPage();
			await page2.goto(page.url(), { waitUntil: "load" });
			await page2.waitForFunction(() => (window as any).fluidStarted as unknown);
		});

		it("Second user can join", async () => {
			const elementHandle = await page.waitForFunction(() =>
				document.getElementById("focus-div"),
			);

			let innerHTML = await page.evaluate(
				(element) => element?.innerHTML.trim(),
				elementHandle,
			);
			// console.log(`page: ${page.url()}, page2: ${page2.url()}`);
			expect(page2.url()).toEqual(page.url());
			console.log(innerHTML);

			const elementHandle2 = await page2.waitForFunction(() =>
				document.getElementById("focus-div"),
			);
			innerHTML = await page.evaluate(
				(element) => element?.innerHTML?.trim(),
				elementHandle2,
			);
			console.log(innerHTML);

			expect(innerHTML?.split("<br>").length).toEqual(2);

			// Navigate the second user away
			await page2.browser().close();

			innerHTML = await page2.evaluate((element) => element?.innerHTML.trim(), elementHandle);
			expect(innerHTML).not.toMatch(/.*<br>.*/);
		});
	});
});
