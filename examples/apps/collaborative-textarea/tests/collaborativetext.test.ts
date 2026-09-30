/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test, expect, type Page } from "@playwright/test";
import { retryWithEventualValue } from "@fluidframework/test-utils/internal";

test.describe("collaborativetext", () => {
	const getValue = async (page: Page, index: number, expectedValue: string) =>
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

	const setText = async (page: Page, index: number, text: string) => {
		return page.evaluate(
			({ i, t }: { i: number; t: string }) => {
				const divs = document.getElementsByClassName("text-area");
				const textAreaElements = divs[i].getElementsByTagName("textarea");
				const textarea = textAreaElements[0] as HTMLTextAreaElement;
				if (textarea) {
					textarea.focus();
					textarea.setRangeText(t);
					textarea.setSelectionRange(t.length, t.length);

					// We need to trigger an event since setting the text range directly
					// doesn't cause an update.
					const ev = document.createEvent("HTMLEvents");
					ev.initEvent("input", true, false);
					textarea.dispatchEvent(ev);
				}
			},
			{ i: index, t: text },
		);
	};

	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		await page.waitForFunction(() => window["fluidStarted"]);
		await page.waitForSelector(".text-area");
	});

	test("Initial textarea is empty", async ({ page }) => {
		const ta1 = await getValue(page, 0, "");
		expect(ta1).toEqual("");

		const ta2 = await getValue(page, 1, "");
		expect(ta2).toEqual("");
	});

	test("User1 types hello", async ({ page }) => {
		const ta1 = await getValue(page, 0, "");
		expect(ta1).toEqual("");

		setText(page, 0, "hello");

		const ta12 = await getValue(page, 0, "hello");
		expect(ta12).toEqual("hello");

		const ta2 = await getValue(page, 1, "hello");
		expect(ta2).toEqual("hello");
	});
});
