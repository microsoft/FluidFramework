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

/* Disabled for common window["foo"] access. */
/* eslint-disable @typescript-eslint/dot-notation */

/**
 * @param page - The page to load the presence tracker app on.
 * @param url - The URL to load the presence tracker app from.
 * @returns The session id of the loaded app.
 */
const loadPresenceTrackerApp = async (page: Page, url: string): Promise<string> => {
	const loadResponse = await page.goto(url, { waitUntil: "load" });
	// A null response indicates a navigation to the same URL with a different hash
	// and is not an actual page load (or resetting of state). In this case, we
	// need to force reload the page. https://pptr.dev/api/puppeteer.page.goto#remarks
	if (loadResponse === null) {
		await page.reload({ waitUntil: "load" });
	}

	// Be extra careful using check for hash expectation
	const targetUrl = new URL(url);
	const idMatch = targetUrl.hash.slice(1);
	const waitFunction = idMatch
		? (hash: string) => window["fluidContainerId"] === hash
		: () => (window["fluidContainerId"] ?? "") !== "";
	await page.waitForFunction(waitFunction, { timeout: 1500 }, idMatch).catch(async () => {
		const after = await page.evaluate(() => `${window["fluidContainerId"]}`);
		throw new Error(
			`failed waiting for app load to id ${idMatch ? idMatch : '!== ""'} (after timeout=${after})`,
		);
	});

	return page.evaluate(() => `${window["fluidSessionId"]}`);
};

/* eslint-enable @typescript-eslint/dot-notation */

// Most tests are passing when tinylicious is running. Those that aren't are individually skipped.
describe("presence-tracker", () => {
	let session1id: string;

	beforeAll(async () => {
		// Wait for the page to load first before running any tests giving a more generous timeout
		// so this time isn't attributed to the first test.
		await loadPresenceTrackerApp(page, globals.PATH);
	}, 45000);

	beforeEach(async () => {
		session1id = await loadPresenceTrackerApp(page, globals.PATH);
	});

	afterEach(() => {
		session1id = "session1id needs reloaded";
	});

	async function throwWithPageAttendeeData(message: string, page: Page) {
		const attendeeData = await page.evaluate(() => ({
			/* eslint-disable @typescript-eslint/dot-notation */
			attendeeCount: `${window["fluidSessionAttendeeCount"]}`,
			attendees: window["fluidSessionAttendees"] ?? {},
			attendeeJoinedCalled: `${window["fluidAttendeeJoinedCalled"]}`,
			attendeeDisconnectedCalled: `${window["fluidAttendeeDisconnectedCalled"]}`,
			/* eslint-enable @typescript-eslint/dot-notation */
		}));
		throw new Error(`${message} (${JSON.stringify(attendeeData)})`);
	}

	describe("Single client", () => {
		it("Document is connected", async () => {
			// Page's url should be updated to have document id
			expect(page.url()).not.toEqual(globals.PATH);
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
			await page
				// eslint-disable-next-line @typescript-eslint/dot-notation
				.waitForFunction(() => window["fluidSessionAttendeeCount"] === 1, {
					// While the expected state should be immediately true, this timeout
					// appears to apply to the entire evaluation period which may not return
					// in 50ms 6-9% of the time (even if the evaluation is a simple `true`).
					// All evaluations of state when this fails have show an attendee count
					// of 1. So use 100ms which appears reliable.
					timeout: 100,
				})
				.catch(async () => {
					await throwWithPageAttendeeData("Attendee count is not 1", page);
				});
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
			// Expect that page's session id is listed.
			expect(clientListHtml).toMatch(session1id);
		});
	});

	describe("Multiple clients", () => {
		let browser2: Browser;
		let page2: Page;
		let session2id: string;

		beforeAll(async () => {
			// Create a second browser instance.
			browser2 = await initializeBrowser();
			page2 = await browser2.newPage();
			// Prime the second browser instance under long timeout.
			// Use the "default" path to ensure an instance of app. At this
			// point `page.url()` is effectively random, unlike in beforeEach.
			await loadPresenceTrackerApp(page2, globals.PATH);
		}, 45000);

		beforeEach(async () => {
			// Page's url should be updated to have document id
			expect(page.url()).not.toEqual(globals.PATH);
			session2id = await loadPresenceTrackerApp(page2, page.url());
			// Both browser instances should be pointing to the same URL now.
			expect(page2.url()).toEqual(page.url());
		});

		afterEach(() => {
			session2id = "session2id needs reloaded";
		});

		afterAll(async () => {
			await browser2.close();
		});

		it("Second user can join", async () => {
			// Both browser instances should be pointing to the same URL now.
			expect(page2.url()).toEqual(page.url());
			await page2.waitForFunction(() => document.isConnected);
		});

		async function waitForAttendeeState(
			page: Page,
			expected: Record<string, string>,
			timeoutErrorMessage: string,
		) {
			/* Disabled for common window["foo"] access. */
			await page
				.waitForFunction(
					// Note: this is a block disable instead of line suppression as Biome reformats comment away from line
					/* eslint-disable @typescript-eslint/dot-notation */
					(expectation) =>
						(
							window["fluidSessionAttendeeCheck"] as (
								expected: Record<string, string>,
							) => boolean
						)(expectation),
					/* eslint-enable @typescript-eslint/dot-notation */
					{ timeout: 100 },
					expected,
				)
				.catch(async () => {
					await throwWithPageAttendeeData(timeoutErrorMessage, page);
				});
		}

		it("Second client shows two clients connected", async () => {
			await waitForAttendeeState(
				page2,
				{
					[session1id]: "Connected",
					[session2id]: "Connected",
				},
				"failed waiting for app to observe two connected attendees",
			);

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
			// Expect that page2's session id is listed.
			expect(clientListHtml).toMatch(session2id);
			// Expect that first page's session id is listed.
			expect(clientListHtml).toMatch(session1id);
		});

		it("First client shows two clients connected", async () => {
			await waitForAttendeeState(
				page,
				{
					[session1id]: "Connected",
					[session2id]: "Connected",
				},
				"failed waiting for app to observe two connected attendees",
			);
		});

		it("First client shows one client connected when second client leaves", async () => {
			// Setup
			await waitForAttendeeState(
				page,
				{
					[session1id]: "Connected",
					[session2id]: "Connected",
				},
				"failed waiting for app to observe two connected attendees",
			);

			// Act

			// Navigate the second client away.
			const response = await page2.goto("about:blank", { waitUntil: "load" });
			// Loosely verify that a navigation happened. Puppeteer docs note:
			//    "Navigation to about:blank or navigation to the same URL with a different hash will succeed and
			//    return null."
			expect(response).toBe(null);

			// Verify

			await waitForAttendeeState(
				page,
				{
					[session1id]: "Connected",
					[session2id]: "Disconnected",
				},
				"failed waiting for app to observe second attendee as disconnected",
			);
		});

		// TODO: AB#28502: presence-tracker example multi-client test should not be skipped
		it.skip("First client shows two clients connected in UI", async () => {
			await waitForAttendeeState(
				page,
				{
					[session1id]: "Connected",
					[session2id]: "Connected",
				},
				"failed waiting for app to observe two connected attendees",
			);

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
			// Expect that first page's session id is listed.
			expect(clientListHtml).toMatch(session1id);
			// Expect that page2's session id is listed.
			expect(clientListHtml).toMatch(session2id);
		});

		// TODO: AB#28502: presence-tracker example multi-client test should not be skipped
		// This test should not be enabled without the prior test being enabled as it
		// may have false positives. It has also been demonstrated to fail occasionally.
		// Occasional failures are likely due to same issue impact the prior "in UI" test.
		it.skip("First client shows one client connected in UI when second client leaves", async () => {
			// Setup
			await waitForAttendeeState(
				page,
				{
					[session1id]: "Connected",
					[session2id]: "Connected",
				},
				"failed waiting for app to observe two connected attendees",
			);

			// Act

			// Navigate the second client away.
			const response = await page2.goto("about:blank", { waitUntil: "load" });
			// Loosely verify that a navigation happened. Puppeteer docs note:
			//    "Navigation to about:blank or navigation to the same URL with a different hash will succeed and
			//    return null."
			expect(response).toBe(null);

			// Verify

			await waitForAttendeeState(
				page,
				{
					[session1id]: "Connected",
					[session2id]: "Disconnected",
				},
				"failed waiting for app to observe second attendee as disconnected",
			);

			// Get the client list from the first browser; it should have a single element.
			const elementHandle = await page.waitForFunction(() =>
				document.getElementById("focus-div"),
			);
			const clientListHtml = await page.evaluate(
				(element) => element?.innerHTML?.trim(),
				elementHandle,
			);
			expect(clientListHtml).toMatch(/^[^<]+$/);
			// Expect that first page's session id is listed.
			expect(clientListHtml).toMatch(session1id);
		});
	});
});
