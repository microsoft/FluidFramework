/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { retryWithEventualValue } from "@fluidframework/test-utils/internal";
import { expect, test, type Page } from "@playwright/test";

/* eslint-disable @typescript-eslint/dot-notation */

test.describe("ToDo", () => {
	const getItemUrl = async (page: Page, index: number) =>
		retryWithEventualValue(
			() =>
				page.evaluate((i: number) => {
					const openInNewTabButtons = document.querySelectorAll("button[name=OpenInNewTab]");
					const button = openInNewTabButtons[i] as HTMLDivElement;
					if (button) {
						// TODO: Would be better to actually click the button and verify it opens in a
						// new tab correctly.
						return `${window.location.href}/${button.id}`;
					}

					return "";
				}, index),
			(actualValue) => actualValue.length !== 0,
			"not propagated" /* defaultValue */,
		);

	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		await page.waitForFunction(() => window["fluidStarted"]);
	});

	test("TodoItems can be added", async ({ page }) => {
		await page.locator("input[name=itemName]").first().fill("TodoItem1");
		await page.locator("button[name=createItem]").first().click();
		await page.locator("input[name=itemName]").first().fill("TodoItem2");
		await page.locator("button[name=createItem]").first().click();

		const result = await page.evaluate(() => {
			let itemLists = document.body.querySelectorAll(".todo-item-list");
			let items = itemLists[0].childNodes;
			return items.length === 2;
		});

		expect(result).toBeTruthy();
	});

	test("TodoItem has detailed text", async ({ page }) => {
		// Add item
		await page.locator("input[name=itemName]").first().fill("ToDoDetails");
		await page.locator("button[name=createItem]").first().click();

		// Expand details
		await page.locator("button[name=toggleDetailsVisible]").first().click();

		// Check details exist
		const foundDetails = await page.evaluate(() => {
			const details = document.querySelector("textarea");
			return details !== null && details !== undefined;
		});
		expect(foundDetails).toBeTruthy();

		// Hide details and check they disappear
		await page.locator("button[name=toggleDetailsVisible]").first().click();
		const hiddenDetails = await page.evaluate(() => {
			const details = document.querySelector("textarea");
			return details === null || details === undefined;
		});
		expect(hiddenDetails).toBeTruthy();
	});

	test("TodoItem routing", async ({ page }) => {
		await page.locator("input[name=itemName]").first().fill("ToDoItem1");
		await page.locator("button[name=createItem]").first().click();
		await page.locator("input[name=itemName]").first().fill("ToDoItem2");
		await page.locator("button[name=createItem]").first().click();

		const itemUrl = await getItemUrl(page, 0);
		await page.goto(itemUrl, { waitUntil: "load" });
		await page.waitForFunction(() => window["fluidStarted"]);
		const result = await page.evaluate(() => {
			let itemLists = document.body.querySelectorAll(".todo-item");
			let items = itemLists[0].childNodes;
			return items.length === 1;
		});

		expect(result).toBeTruthy();
	});
});
