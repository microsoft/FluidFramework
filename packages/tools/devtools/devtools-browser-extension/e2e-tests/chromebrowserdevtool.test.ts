/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/// <reference types="jest-environment-puppeteer" />
/// <reference types="puppeteer" />
/// <reference types="jest" />

import { globals } from "../jest.config";
import { retryWithEventualValue } from "@fluidframework/test-utils";
import puppeteer from "puppeteer";

describe("End to end tests", () => {
	/**
	 * Gets the value of the text form backed by our CollaborativeTextArea.
	 *
	 * @remarks Assumes there is only one `text-area` element on the page.
	 *
	 * @param expectedValue - The value we expect the value of the text area to be.
	 */
	async function getTextFormValue(expectedValue: string): Promise<string> {
		return retryWithEventualValue(
			/* callback: */ () =>
				page.evaluate(() => {
					const divs = document.getElementsByClassName("text-area");
					const textAreaElements = divs[0].getElementsByTagName("textarea");
					const textarea = textAreaElements[0] as HTMLTextAreaElement;
					return textarea?.value;
				}),
			/* check: */ (actualValue) => actualValue === expectedValue,
			/* defaultValue: */ "not propagated",
		);
	}

	beforeAll(async () => {
		// Wait for the page to load first before running any tests
		// so this time isn't attributed to the first test
		await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
	}, 45000);

	beforeEach(async () => {
		await page.goto(globals.PATH, { waitUntil: "load" });
		await page.waitForFunction(() => window["fluidStarted"]);
		await page.waitForSelector(".text-area");
	});

	it("Smoke: verify test app can be launched", async () => {
		// Verify by checking for text area associated with the SharedString.
		const textArea = await getTextFormValue("");
		expect(textArea).toEqual("");
	});

	// TODO
	it("Determine if telemetry pane is rendered on the extension", async () => {
		// Set up config for the jest-puppeteer test.
		// TODO: Clean up for repetitive config setting.
		const browser = await puppeteer.launch({
			headless: false,
			args: [
				// https://github.com/puppeteer/puppeteer/blob/master/docs/troubleshooting.md#setting-up-chrome-linux-sandbox
				"--no-sandbox",
				"--disable-setuid-sandbox",

				// Ensure our extension is loaded into the browser environment
				"--disable-extensions-except=./dist/bundle",
				"--load-extension=./dist/bundle",
			],
		});

		// Launch application page.
		const appPage = await browser.newPage();
		await appPage.goto(globals.PATH, { waitUntil: "load" });

		// Get Tab ID from the running extension scripts (content and background) associated with the app page
		const tabId = await appPage.evaluate(() => {
			// Request TabId to Content Script
			console.log("PAGE: Posting Message to CONTENT SCRIPT");

			window.postMessage({
				type: "TEST_GET_TAB_ID",
			});

			console.log("PAGE: Completedd Posting Message to CONTENT SCRIPT");

			// Receive TabId from ContentScript
			return new Promise<number>((resolve, reject) => {
				window.addEventListener("message", (event) => {
					const message = event.data;
					if (message.type === "TEST_TAB_ID") {
						resolve(message.data.tabId);
					}
				});
			});
		});

		// Target extension and launch in Chromium.
		const targets = await browser.targets();
		const extensionTarget = targets.find((target) => target.type() === "service_worker");
		const partialExtensionUrl = extensionTarget?.url() || "";
		const [, , extensionId] = partialExtensionUrl.split("/");

		const extPage = await browser.newPage();

		console.log("PAGE: Attempting to set global tabId");

		// Set the mock Tab ID in the extension page so Devtools script picks it up when we navigate to extension URL
		await extPage.evaluate((_tabId) => {
			(window as any).TEST_TAB_ID_OVERRIDE = _tabId;

			console.log(`PAGE: Completed setting the global tabId to ${_tabId}`);
		}, tabId);

		const extensionUrl = `chrome-extension://${extensionId}/devtools/devtools.html`;
		await extPage.goto(extensionUrl, { waitUntil: "load" });
		await extPage.bringToFront();
	});
});
