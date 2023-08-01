/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/// <reference types="jest-environment-puppeteer" />
/// <reference types="puppeteer" />
/// <reference types="jest" />

import { globals } from "../jest.config";
// import { launch as puppeteerArgs } from "../jest-puppeteer.config.js";
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
		// const browser = await puppeteer.launch({
		// 	headless: false,
		// 	launch.args: ["--disable-extensions-except=./dist/bundle", "--load-extension=./dist/bundle"],
		// });

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

		const appPage = await browser.newPage();
		await appPage.goto(globals.PATH, { waitUntil: "load" });

		const targets = await browser.targets();
		console.log("targets:", targets);
		const extensionTarget = targets.find((target) => target.type() === "service_worker");
		const partialExtensionUrl = extensionTarget?.url() || "";
		const [, , extensionId] = partialExtensionUrl.split("/");

		const extPage = await browser.newPage();
		const extensionUrl = `chrome-extension://${extensionId}/devtools.html`; // different -> devtools.html
		await extPage.goto(extensionUrl, { waitUntil: "load" });
		await extPage.bringToFront();

		// const targets = await browser.targets();
		// console.log("targets:", targets);
		// const extensionTarget = targets.find((target) => target.type() === "service_worker");
		// console.log("extensionTarget:", extensionTarget);
		// const partialExtensionUrl = extensionTarget?.url() || "";
		// console.log("partialExtensionUrl:", partialExtensionUrl);
		// const [, , extensionId] = partialExtensionUrl.split("/");
		// console.log("extensionId:", extensionId);

		// const extensionId = `figfgckchmklgfakpkagobfabojlmbfh`;

		// const extPage = await browser.newPage();
		// const extensionUrl = `chrome-extension://${extensionId}/`;
		// await extPage.goto(extensionUrl, { waitUntil: "load" });
	});
});
