/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Browser, Page } from "puppeteer";
import puppeteer from "puppeteer";

import { globals } from "../jest.config.cjs";

const initializeBrowser = async () => {
	const browser = await puppeteer.launch({
		// https://github.com/puppeteer/puppeteer/blob/master/docs/troubleshooting.md#setting-up-chrome-linux-sandbox
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
		// Use chrome-headless-shell because that's what the CI pipeline installs; see AB#7150.
		headless: "shell",
	});

	return browser;
};

// Most tests are passing when tinylicious is running. Those that aren't are individually skipped.
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

	describe("Single client", () => {
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
			expect(innerHTML).toMatch(/^[^<]+ has focus/);
		});

		it("First client shows single client connected", async () => {
			const elementHandle = await page.waitForFunction(() =>
				document.getElementById("focus-div"),
			);

			const clientListHtml = await page.evaluate(
				(element) => element?.innerHTML.trim(),
				elementHandle,
			);

			// There should only be a single client connected
			expect(clientListHtml).toMatch(/^[^<]+$/);
		});
	});

	describe("Multiple clients", () => {
		let browser2: Browser;
		let page2: Page;

		beforeAll(async () => {
			// Create a second browser instance and navigate to the session created by the first browser.
			browser2 = await initializeBrowser();
			page2 = await browser2.newPage();
		}, 45000);

		beforeEach(async () => {
			await page2.goto(page.url(), { waitUntil: "load" });
			await page2.waitForFunction(() => window["fluidStarted"]);
		});

		afterAll(async () => {
			await browser2.close();
		});

		it("Second user can join", async () => {
			// Both browser instances should be pointing to the same URL now.
			expect(page2.url()).toEqual(page.url());
		});

		it("Second client shows two clients connected", async () => {
			// Get the client list from the second browser instance; it should show two connected.
			const elementHandle = await page2.waitForFunction(() =>
				document.getElementById("focus-div"),
			);
			const clientListHtml = await page2.evaluate(
				(element) => element?.innerHTML?.trim(),
				elementHandle,
			);
			expect(clientListHtml).toMatch(/^[^<]+<br>[^<]+$/);
		});

		it.skip("First client shows two clients connected", async () => {
			// Get the client list from the first browser instance; it should show two connected.
			const elementHandle = await page.waitForFunction(() =>
				document.getElementById("focus-div"),
			);
			const clientListHtml = await page.evaluate(
				(element) => element?.innerHTML?.trim(),
				elementHandle,
			);
			expect(clientListHtml).toMatch(/^[^<]+<br>[^<]+$/);
		});

		it("First client shows one client connected when second client leaves", async () => {
			// Navigate the second client away
			await page2.goto(globals.PATH, { waitUntil: "load" });

			// Get the client list from the first browser; it should have a single element.
			const elementHandle = await page.waitForFunction(() =>
				document.getElementById("focus-div"),
			);
			const clientListHtml = await page.evaluate(
				(element) => element?.innerHTML?.trim(),
				elementHandle,
			);
			expect(clientListHtml).toMatch(/^[^<]+$/);
		});
	});
});
