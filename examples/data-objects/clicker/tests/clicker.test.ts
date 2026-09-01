/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { retryWithEventualValue } from "@fluidframework/test-utils/internal";
import { expect, test, type Page } from "@playwright/test";

/* eslint-disable @typescript-eslint/dot-notation */

test.describe("clicker", () => {
	const getValue = async (page: Page, index: number, expectedValue: string) =>
		retryWithEventualValue(
			() =>
				page.evaluate((i: number) => {
					const clickerElements = document.getElementsByClassName("clicker-value-class");
					const clicker = clickerElements[i] as HTMLDivElement;
					if (clicker) {
						return clicker.innerText;
					}

					return "";
				}, index),
			(actualValue) => actualValue === expectedValue,
			"not propagated" /* defaultValue */,
		);

	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		await page.waitForFunction(() => window["fluidStarted"]);
	});

	test("There's a button to be clicked", async ({ page }) => {
		await page.getByRole("button", { name: "+" }).first().click();
	});

	test("Clicking the button updates both users", async ({ page }) => {
		// Validate both users have 0 as their value
		const preValue = await getValue(page, 0, "0");
		expect(preValue).toEqual("0");
		const preValue2 = await getValue(page, 1, "0");
		expect(preValue2).toEqual("0");

		// Click the button
		await page.getByRole("button", { name: "+" }).first().click();
		await page.waitForFunction(
			() =>
				(document.querySelector(".clicker-value-class") as HTMLDivElement).innerText.includes(
					"1",
				),
			undefined,
			{ timeout: 1000 },
		);

		// Validate both users have 1 as their value
		const postValue = await getValue(page, 0, "1");
		expect(postValue).toEqual("1");
		const postValue2 = await getValue(page, 1, "1");
		expect(postValue2).toEqual("1");
	});

	test("Clicking the button after refresh updates both users", async ({ page }) => {
		await page.reload({ waitUntil: "load" });
		await page.waitForFunction(() => window["fluidStarted"]);

		// Validate both users have 0 as their value
		const preValue = await getValue(page, 0, "0");
		expect(preValue).toEqual("0");
		const preValue2 = await getValue(page, 1, "0");
		expect(preValue2).toEqual("0");

		// Click the button
		await page.getByRole("button", { name: "+" }).first().click();
		await page.waitForFunction(
			() =>
				(document.querySelector(".clicker-value-class") as HTMLDivElement).innerText.includes(
					"1",
				),
			undefined,
			{ timeout: 1000 },
		);

		// Validate both users have 1 as their value
		const postValue = await getValue(page, 0, "1");
		expect(postValue).toEqual("1");
		const postValue2 = await getValue(page, 1, "1");
		expect(postValue2).toEqual("1");
	});
});
