/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test, expect, type BrowserContext, type Page } from "@playwright/test";

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
	const targetUrl = new URL(url, page.url());
	const idMatch = targetUrl.hash.slice(1);
	const waitFunction = idMatch
		? (_hash: string) => window["fluidContainerId"] === _hash
		: (_hash: string) => (window["fluidContainerId"] ?? "") !== "";
	await page.waitForFunction(waitFunction, idMatch, { timeout: 1500 }).catch(async () => {
		const after = await page.evaluate(() => `${window["fluidContainerId"]}`);
		throw new Error(
			`failed waiting for app load to id ${idMatch ? idMatch : '!== ""'} (after timeout=${after})`,
		);
	});

	return page.evaluate(() => `${window["fluidSessionId"]}`);
};

/* eslint-enable @typescript-eslint/dot-notation */

// Most tests are passing when tinylicious is running. Those that aren't are individually skipped.
test.describe("presence-tracker", () => {
	test.describe.configure({ mode: "serial" });

	let page: Page;
	let session1id: string;

	test.beforeAll(async ({ browser }) => {
		// Wait for the page to load first before running any tests giving a more generous timeout
		// so this time isn't attributed to the first test.
		page = await browser.newPage();
		await loadPresenceTrackerApp(page, "/");
	});

	test.afterAll(async () => {
		await page.close();
	});

	test.beforeEach(async () => {
		session1id = await loadPresenceTrackerApp(page, "/");
	});

	test.afterEach(() => {
		session1id = "session1id needs reloaded";
	});

	test.describe("Single client", () => {
		test("Document is connected", async () => {
			// Page's url should be updated to have document id
			expect(page.url()).toContain("#");
			await page.waitForFunction(() => document.isConnected);
		});

		test("Focus content element exists", async () => {
			await page.waitForFunction(() => document.getElementById("focus-content"));
		});

		test("Focus div exists", async () => {
			await page.waitForFunction(() => document.getElementById("focus-div"));
		});

		test("Mouse position element exists", async () => {
			await page.waitForFunction(() => document.getElementById("mouse-position"));
		});

		test("Current user has focus", async () => {
			const elementHandle = await page.waitForFunction(() =>
				document.getElementById("focus-div"),
			);
			const innerHTML = await page.evaluate(
				(element) => element?.innerHTML.trim(),
				elementHandle,
			);
			expect(innerHTML).toMatch(/^[^<]+ has focus/);
		});

		test("First client shows single client connected", async () => {
			// eslint-disable-next-line @typescript-eslint/dot-notation, @typescript-eslint/no-unsafe-return
			const attendeeCount = await page.evaluate(() => window["fluidSessionAttendeeCount"]);
			expect(attendeeCount).toBe(1);

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

	test.describe("Multiple clients", () => {
		let context2: BrowserContext;
		let page2: Page;
		let session2id: string;

		test.beforeAll(async ({ browser }) => {
			// Create a second browser context.
			context2 = await browser.newContext();
			page2 = await context2.newPage();
			// Prime the second browser context under long timeout.
			// Use the "default" path to ensure an instance of app. At this
			// point `page.url()` is effectively random, unlike in beforeEach.
			await loadPresenceTrackerApp(page2, "/");
		});

		test.afterAll(async () => {
			await context2.close();
		});

		test.beforeEach(async () => {
			// Page's url should be updated to have document id
			expect(page.url()).toContain("#");
			session2id = await loadPresenceTrackerApp(page2, page.url());
			// Both browser instances should be pointing to the same URL now.
			expect(page2.url()).toEqual(page.url());
		});

		test.afterEach(() => {
			session2id = "session2id needs reloaded";
		});

		test("Second user can join", async () => {
			// Both browser instances should be pointing to the same URL now.
			expect(page2.url()).toEqual(page.url());
			await page2.waitForFunction(() => document.isConnected);
		});

		async function waitForAttendeeState(
			targetPage: Page,
			expected: Record<string, string>,
			timeoutErrorMessage: string,
		) {
			/* Disabled for common window["foo"] access. */
			/* eslint-disable @typescript-eslint/dot-notation */
			await targetPage
				.waitForFunction(
					(expectation) =>
						(
							window["fluidSessionAttendeeCheck"] as (
								expected: Record<string, string>,
							) => boolean
						)(expectation),
					expected,
					{ timeout: 300 },
				)
				.catch(async () => {
					const attendeeData = await targetPage.evaluate(() => ({
						attendeeCount: `${window["fluidSessionAttendeeCount"]}`,
						attendees: window["fluidSessionAttendees"] ?? {},
						attendeeConnectedCalled: `${window["fluidattendeeConnectedCalled"]}`,
						attendeeDisconnectedCalled: `${window["fluidAttendeeDisconnectedCalled"]}`,
					}));
					throw new Error(`${timeoutErrorMessage} (${JSON.stringify(attendeeData)})`);
				});
			/* eslint-enable @typescript-eslint/dot-notation */
		}

		test("Second client shows two clients connected", async () => {
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

		test("First client shows two clients connected", async () => {
			await waitForAttendeeState(
				page,
				{
					[session1id]: "Connected",
					[session2id]: "Connected",
				},
				"failed waiting for app to observe two connected attendees",
			);
		});

		test("First client shows one client connected when second client leaves", async () => {
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
			// Loosely verify that a navigation happened. Playwright docs note that
			// navigation to about:blank returns null.
			expect(response).toBeNull();

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
		test.skip("First client shows two clients connected in UI", async () => {
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
		test.skip("First client shows one client connected in UI when second client leaves", async () => {
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
			const response2 = await page2.goto("about:blank", { waitUntil: "load" });
			// Loosely verify that a navigation happened. Playwright docs note that
			// navigation to about:blank returns null.
			expect(response2).toBeNull();

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
