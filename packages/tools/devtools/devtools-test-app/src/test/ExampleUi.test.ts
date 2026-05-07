/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { retryWithEventualValue } from "@fluidframework/test-utils/internal";
import { expect, test, type Page } from "@playwright/test";

test.describe("End to end tests", () => {
	/**
	 * Gets the value of the text form backed by our CollaborativeTextArea.
	 *
	 * @remarks Assumes there is only one `text-area` element on the page.
	 *
	 * @param expectedValue - The value we expect the value of the text area to be.
	 */
	async function getTextFormValue(page: Page, expectedValue: string): Promise<string> {
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

	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		// eslint-disable-next-line @typescript-eslint/dot-notation
		await page.waitForFunction(() => window["fluidStarted"]);
		await page.waitForSelector("textarea");
	});

	test("Smoke: verify test app can be launched", async ({ page }) => {
		// Verify by checking for text area associated with the SharedString.
		const textArea = await getTextFormValue(page, "");
		expect(textArea).toEqual("");
	});
});
