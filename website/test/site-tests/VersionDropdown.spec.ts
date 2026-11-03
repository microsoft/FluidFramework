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

	for (const openingKey of ["Enter", "Space"]) {
		test(`navigates and selects a version after ${openingKey} opens the menu`, async ({
			page,
		}) => {
			const trigger = page.getByRole("button", { name: "Select documentation version" });
			const versionItems = page.locator(".version-dropdown__item");
			const lastIndex = (await versionItems.count()) - 1;

			expect(lastIndex).toBeGreaterThan(0);
			await trigger.focus();
			await page.keyboard.press(openingKey);
			await expect(versionItems.first()).toBeVisible();

			for (const [key, index] of [
				["ArrowDown", 0],
				["ArrowDown", 1],
				["ArrowUp", 0],
				["End", lastIndex],
				["ArrowDown", 0],
				["ArrowUp", lastIndex],
				["Home", 0],
				["End", lastIndex],
			] as const) {
				await page.keyboard.press(key);
				await expect(versionItems.nth(index)).toBeFocused();
			}

			const destination = await versionItems
				.last()
				.evaluate((link: HTMLAnchorElement) => link.href);
			expect(destination).not.toBe(page.url());
			await page.keyboard.press("Enter");
			await expect(page).toHaveURL(destination);
		});
	}

	test("navigation keys do not open a closed menu", async ({ page }) => {
		const trigger = page.getByRole("button", { name: "Select documentation version" });
		const firstItem = page.locator(".version-dropdown__item").first();

		await trigger.focus();
		for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
			await page.keyboard.press(key);
			await expect(trigger).toBeFocused();
			await expect(trigger).toHaveAttribute("aria-expanded", "false");
			await expect(firstItem).toBeHidden();
		}
	});

	test("arrow keys work in a hover-open menu", async ({ page }) => {
		const trigger = page.getByRole("button", { name: "Select documentation version" });
		const firstItem = page.locator(".version-dropdown__item").first();

		await trigger.hover();
		await expect(firstItem).toBeVisible();
		await expect(trigger).toHaveAttribute("aria-expanded", "false");
		await trigger.focus();
		await page.keyboard.press("ArrowDown");
		await expect(firstItem).toBeFocused();
	});

	test("Tab immediately after ArrowUp leaves the menu without delayed focus", async ({
		page,
	}) => {
		const trigger = page.getByRole("button", { name: "Select documentation version" });
		const firstItem = page.locator(".version-dropdown__item").first();
		const docsLink = page.locator(".navbar").getByRole("link", { name: "Docs", exact: true });

		await trigger.focus();
		await page.keyboard.press("Enter");
		await expect(firstItem).toBeVisible();
		await page.keyboard.press("ArrowUp");
		await page.keyboard.press("Tab");
		await expect(trigger).toHaveAttribute("aria-expanded", "false");
		await expect(firstItem).toBeHidden();
		await expect(docsLink).toBeFocused();
	});

	test("Shift+Tab returns to the trigger without delayed focus", async ({ page }) => {
		const trigger = page.getByRole("button", { name: "Select documentation version" });
		const firstItem = page.locator(".version-dropdown__item").first();

		await trigger.focus();
		await page.keyboard.press("Enter");
		await expect(firstItem).toBeVisible();
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Shift+Tab");
		await page.keyboard.press("Enter");
		await expect(trigger).toHaveAttribute("aria-expanded", "false");
		await expect(firstItem).toBeHidden();
		await expect(trigger).toBeFocused();
	});

	test("mobile navigation keeps its existing keyboard behavior", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.getByRole("button", { name: "Toggle navigation bar" }).click();
		await page.getByRole("button", { name: "Back to main menu" }).click();

		const dropdown = page.locator(".navbar-sidebar .version-dropdown-wrapper");
		const firstItem = dropdown.locator(".version-dropdown__item").first();

		await expect(firstItem).toBeVisible();
		await firstItem.focus();
		for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
			await page.keyboard.press(key);
			await expect(firstItem).toBeFocused();
		}
	});
});
