/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test } from "@playwright/test";

test.describe("Version dropdown keyboard navigation", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/docs/start/tree-start/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");
	});

	test("supports disclosure and list navigation keys", async ({ page }) => {
		const trigger = page.getByRole("button", { name: "Select documentation version" });
		const versionItems = page.locator(".version-dropdown__item");
		const firstItem = versionItems.first();
		const lastItem = versionItems.last();

		expect(await versionItems.count()).toBeGreaterThan(1);
		await trigger.focus();

		await page.keyboard.press("ArrowDown");
		await expect(trigger).toHaveAttribute("aria-expanded", "true");
		await expect(firstItem).toBeFocused();

		await page.keyboard.press("End");
		await expect(lastItem).toBeFocused();

		await page.keyboard.press("ArrowDown");
		await expect(firstItem).toBeFocused();

		await page.keyboard.press("ArrowUp");
		await expect(lastItem).toBeFocused();

		await page.keyboard.press("Home");
		await expect(firstItem).toBeFocused();

		await page.keyboard.press("Escape");
		await expect(trigger).toBeFocused();
		await expect(trigger).toHaveAttribute("aria-expanded", "false");

		await page.keyboard.press("ArrowUp");
		await expect(lastItem).toBeFocused();

		await page.keyboard.press("Escape");
		await page.keyboard.press("Enter");
		await expect(trigger).toHaveAttribute("aria-expanded", "true");

		await page.keyboard.press("Enter");
		await expect(trigger).toHaveAttribute("aria-expanded", "false");
	});
});
