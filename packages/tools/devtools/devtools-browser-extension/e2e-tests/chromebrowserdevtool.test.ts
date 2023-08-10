/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/// <reference types="jest-environment-puppeteer" />
/// <reference types="puppeteer" />
/// <reference types="jest" />

import { globals } from "../jest.config";
import { retryWithEventualValue } from "@fluidframework/test-utils";
import { IMessageRelay, GetTabId, handleIncomingMessage } from "@fluid-experimental/devtools-core";
import { useMessageRelay } from "@fluid-experimental/devtools-view";
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
		await page.waitFor(() => window["fluidStarted"]); // verify if this only launches the application
		await page.waitForSelector(".text-area");

		// load the extension
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
			// Request tab ID
			window.postMessage({
				type: "TEST_GET_TAB_ID"
			});

			return new Promise<number>((resolve, reject) => {
				window.addEventListener('message', event => {
					const message = event.data;
					if (message.type === "TEST_TAB_ID") {
						resolve(message.data.tabId);
					}
				});
			})

			// return new Promise<number>((resolve, reject) => {
			// 	window.onmessage(event => {
			// 		const message = event.data;
			// 		if (message.type === "TEST_TAB_ID") {
			// 			resolve(message.data.tabId);
			// 		}
			// 	});
			// })
		});

		// Target extension and launch in Chromium.
		const targets = await browser.targets();
		const extensionTarget = targets.find((target) => target.type() === "service_worker");
		const partialExtensionUrl = extensionTarget?.url() || "";
		const [, , extensionId] = partialExtensionUrl.split("/");
		console.log(extensionId); 

		const extPage = await browser.newPage();

		// Send GetTabID message asking for active tab and wait for response with tab ID.
		const messageRelay: IMessageRelay = useMessageRelay();
		messageRelay.postMessage(GetTabId.createMessage(GetTabId.MessageType)); // Content Script 

		// Incoming message handler
		// function messageHandler(message: PostTabId): void {
		// 	handleIncomingMessage(message, inboundMessageHandlers, {
		// 		context: loggingContext,
		// 	});
		// }

		// messageRelay.on("message", messageHandler);

		// // POST to Inspected Page.
		// if (isDevtoolsMessage(message) && message.type === "POST_TAB_ID") {
		// 	browser.runtime.onMessage.addListener((message: string) => {
		// 		const activeTabId = message.data as unknown as number; // TODO: Create Message Type for Post

		// 		window!.postMessage(activeTabId, "*"); // Inspected
		// 	});
		// }

		// const tabId = globalThis.TEST_TAB_ID_OVERRIDE;

		console.log(tabId); // set the retrieved tabId as GLOBAL variable.

		// Set the mock Tab ID in the extension page so Devtools script picks it up when we navigate to extension URL
		await extPage.evaluate((_tabId) => {
			(window as any).TEST_TAB_ID_OVERRIDE = _tabId;
		}, tabId);

		// TODO: Figure out how to use tabID whnen opening the extension.
		const extensionUrl = `chrome-extension:/devtools/devtools.html`;
		await extPage.goto(extensionUrl, { waitUntil: "load" });
		await extPage.bringToFront();

		// TODO: Write unit tests.
	});
});
