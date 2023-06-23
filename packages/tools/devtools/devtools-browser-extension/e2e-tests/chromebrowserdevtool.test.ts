/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";
import { retryWithEventualValue } from "@fluidframework/test-utils";
// import { exec } from "child_process";

describe("chrome browser...", () => {
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
		console.log("Page loaded!");
	}, 10000);

	beforeEach(async () => {
		await page.goto(globals.PATH, { waitUntil: "load" });
		await page.waitFor(() => window["fluidStarted"]);
		console.log("fluid started");
		await page.waitForSelector(".text-area");
		console.log("found text-area");
	});

	// afterAll(async () => {
	// 	await page.close();
	// 	await browser.close();
	// });

	it("Verify textarea is created", async () => {
		const ta1 = await getValue(0, "");
		console.log("Got value");
		expect(ta1).toEqual("");
		console.log("Verified");
	});
});
