/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { retryWithEventualValue } from "@fluidframework/test-utils/internal";

import { globals } from "../../jest.config.cjs";

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
			/* callback: */ async () =>
				page.evaluate(() => {
					const divs = document.querySelectorAll(".example-app-text-area");
					const textAreaElements = divs[0].querySelectorAll("textarea");
					const textarea = textAreaElements[0];
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
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		await page.waitForFunction(() => globalThis.fluidStarted);
	}, 45_000);

	beforeEach(async () => {
		await page.goto(globals.PATH, { waitUntil: "load" });
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		await page.waitForFunction(() => globalThis.fluidStarted);
		await page.waitForSelector("textarea");
	});

	it("Smoke: verify test app can be launched", async () => {
		// Verify by checking for text area associated with the SharedString.
		const textArea = await getTextFormValue("");
		expect(textArea).toEqual("");
	});
});
