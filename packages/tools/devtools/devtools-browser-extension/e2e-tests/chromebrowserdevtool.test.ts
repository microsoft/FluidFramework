/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";
import { retryWithEventualValue } from "@fluidframework/test-utils";

describe("End to end tests", () => {
	const getValue = async (index: number, expectedValue: string) =>
		retryWithEventualValue(
			() =>
				page.evaluate((i: number) => {
					const divs = document.getElementsByClassName("text-area");
					const textAreaElements = divs[i].getElementsByTagName("textarea");
					const textarea = textAreaElements[0] as HTMLTextAreaElement;
					if (textarea) {
						return textarea.value;
					}
					return "-----undefined-----";
				}, index),
			(actualValue) => actualValue === expectedValue,
			"not propagated" /* defaultValue */,
		);

	beforeAll(async () => {
		// Wait for the page to load first before running any tests
		// so this time isn't attributed to the first test
		await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
	}, 10000);

	beforeEach(async () => {
		await page.goto(globals.PATH, { waitUntil: "load" });
		await page.waitForSelector(".text-area");
	});

	it("Verify textarea is created", async () => {
		const textArea = await getValue(0, "");
		expect(textArea).toEqual("");
	});

	// it("Verify Devtools extension is opened", async () => {
	// 	//TODO
	// 	const targets = await browser.targets();
	// 	console.log(targets);
	// 	// chrome-extension://inmobceohkedafljagjfnbojplmlmgbk/devtools_app.html
	// 	// document.querySelector("#containers-menu-section");
	// 	// document.querySelector("#telemetry-menu-section");
	// });
});
