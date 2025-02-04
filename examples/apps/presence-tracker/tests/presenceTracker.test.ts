/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Browser, Page } from "puppeteer";
import { launch } from "puppeteer";

import { globals } from "../jest.config.cjs";

const initializeBrowser = async () => {
	const browser = await launch({
		// https://github.com/puppeteer/puppeteer/blob/master/docs/troubleshooting.md#setting-up-chrome-linux-sandbox
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
		// output browser console to cmd line
		dumpio: process.env.FLUID_TEST_VERBOSE !== undefined,
		// Use chrome-headless-shell because that's what the CI pipeline installs; see AB#7150.
		headless: "shell",
	});

	return browser;
};

/**
 * @param page The page to load the presence tracker app on.
 */
const loadPresenceTrackerApp = async (page: Page, url: string) => {
	await page.goto(url, { waitUntil: "load" });
	// eslint-disable-next-line @typescript-eslint/dot-notation, @typescript-eslint/no-unsafe-return
	await page.waitForFunction(() => window["fluidStarted"]);
};

// Most tests are passing when tinylicious is running. Those that aren't are individually skipped.
describe("presence-tracker", () => {
	beforeAll(async () => {
		// Wait for the page to load first before running any tests giving a more generous timeout
		// so this time isn't attributed to the first test.
		await loadPresenceTrackerApp(page, globals.PATH);
	}, 45000);

	beforeEach(async () => {
		await loadPresenceTrackerApp(page, globals.PATH);
	});

	describe("Single client", () => {
		it("Document is connected", async () => {
			await page.waitForFunction(() => document.isConnected);
		});

		it("Focus content element exists", async () => {
			await page.waitForFunction(() => document.getElementById("focus-content"));
		});

		it("Focus div exists", async () => {
			await page.waitForFunction(() => document.getElementById("focus-div"));
		});

		it("Mouse position element exists", async () => {
			await page.waitForFunction(() => document.getElementById("mouse-position"));
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

			// There should only be a single client connected; verify by asserting there's no <br> tag in the innerHtml, which
			// means a single client.
			expect(clientListHtml).toMatch(/^[^<]+$/);
		});
	});

	describe("Multiple clients", () => {
		let browser2: Browser;
		let page2: Page;

		beforeAll(async () => {
			// Create a second browser instance.
			browser2 = await initializeBrowser();
			page2 = await browser2.newPage();
			// Like the 1-client tests, we confirm at least one successful page load with a longer timeout before running the suite.
			// TODO:AB#28502: It's unclear this longer timeout is necessary, but the test suite failed at least once on timeout
			// during the subsequent beforeEach hook, and loading the page once could help ensure browser cache is populated.
			await loadPresenceTrackerApp(page2, globals.PATH);
		}, 45000);

		beforeEach(async () => {
			await loadPresenceTrackerApp(page2, page.url());
		});

		afterAll(async () => {
			await browser2.close();
		});

		// TODO:AB#28502: This test case passes all the time, but considering the remainder of this suite has issues where browser2 doesn't
		// actually connect to the same session as browser1, it should be audited so that it's not a false positive.
		it.skip("Second user can join", async () => {
			// Both browser instances should be pointing to the same URL now.
			expect(page2.url()).toEqual(page.url());
		});

		// TODO:AB#28502: There is a false positive with this test when `loadPresenceTrackerApp` in `beforeAll` is removed or sent to `page.url()`.
		// In those cases, the second session observed on page2 is not from the first session.
		it.skip("Second client shows two clients connected", async () => {
			// Get the client list from the second browser instance; it should show two connected.
			const elementHandle = await page2.waitForFunction(() =>
				document.getElementById("focus-div"),
			);
			const clientListHtml = await page2.evaluate(
				(element) => element?.innerHTML?.trim(),
				elementHandle,
			);

			// Assert that there is a single <br> tag and no other HTML tags in the text, which indicates that two clients are
			// connected.
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
			// Assert that there is a single <br> tag and no other HTML tags in the text, which indicates that two clients are
			// connected.
			expect(clientListHtml).toMatch(/^[^<]+<br>[^<]+$/);
		});

		// While this test passes, it's a false pass because the first client is always failing to see more than one
		// client. See previous test.
		it.skip("First client shows one client connected when second client leaves", async () => {
			// Navigate the second client away.
			const response = await page2.goto(globals.PATH, { waitUntil: "load" });

			// Verify that a navigation happened. Protecting against this behavior from the puppeteer docs:
			//    "Navigation to about:blank or navigation to the same URL with a different hash will succeed and
			//    return null."
			// We want to make sure a real navigation happened.
			expect(response).not.toBe(null);

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
