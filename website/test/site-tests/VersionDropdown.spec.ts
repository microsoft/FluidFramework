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
		test(`supports arrow and boundary keys after ${openingKey} opens the menu`, async ({
			page,
		}) => {
			const trigger = page.getByRole("button", { name: "Select documentation version" });
			const versionItems = page.locator(".version-dropdown__item");
			const firstItem = versionItems.first();
			const lastItem = versionItems.last();

			expect(await versionItems.count()).toBeGreaterThan(1);
			await trigger.focus();
			await page.keyboard.press(openingKey);
			await expect(trigger).toHaveAttribute("aria-expanded", "true");
			await expect(firstItem).toBeVisible();

			await page.keyboard.press("ArrowDown");
			await expect(firstItem).toBeFocused();

			await page.keyboard.press("ArrowDown");
			await expect(versionItems.nth(1)).toBeFocused();

			await page.keyboard.press("ArrowUp");
			await expect(firstItem).toBeFocused();

			await page.keyboard.press("End");
			await expect(lastItem).toBeFocused();

			await page.keyboard.press("ArrowDown");
			await expect(firstItem).toBeFocused();

			await page.keyboard.press("ArrowUp");
			await expect(lastItem).toBeFocused();

			await page.keyboard.press("Home");
			await expect(firstItem).toBeFocused();
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

	for (const key of ["Enter", "Space"]) {
		test(`${key} toggles the link trigger without navigation`, async ({ page }) => {
			await page.goto("/docs/start/tree-start/?dropdown-link-test=true");
			await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");
			const initialUrl = page.url();
			const trigger = page.getByRole("button", { name: "Select documentation version" });
			const firstItem = page.locator(".version-dropdown__item").first();

			await expect(trigger).toHaveAttribute("href", "/docs/start/tree-start");
			await trigger.focus();
			await page.keyboard.press(key);
			await expect(trigger).toHaveAttribute("aria-expanded", "true");
			await expect(firstItem).toBeVisible();
			await expect(trigger).toBeFocused();
			await expect(page).toHaveURL(initialUrl);

			await page.keyboard.press(key);
			await expect(trigger).toHaveAttribute("aria-expanded", "false");
			await expect(firstItem).toBeHidden();
			await expect(page).toHaveURL(initialUrl);
		});
	}

	test("a pointer click follows the link trigger's destination", async ({ page }) => {
		await page.goto("/docs/start/tree-start/?dropdown-link-test=true");
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");
		const trigger = page.getByRole("button", { name: "Select documentation version" });

		await expect(trigger).toHaveAttribute("href", "/docs/start/tree-start");
		await trigger.click();
		await expect(page).toHaveURL("/docs/start/tree-start");
	});

	test("Enter follows the version link selected with arrow keys", async ({ page }) => {
		const trigger = page.getByRole("button", { name: "Select documentation version" });
		const lastItem = page.locator(".version-dropdown__item").last();
		const destination = await lastItem.evaluate((link: HTMLAnchorElement) => link.href);

		expect(destination).not.toBe(page.url());
		await trigger.focus();
		await page.keyboard.press("Enter");
		await expect(lastItem).toBeVisible();
		await page.keyboard.press("ArrowUp");
		await expect(lastItem).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(destination);
	});

	test("hover behavior remains under Docusaurus control", async ({ page }) => {
		const trigger = page.getByRole("button", { name: "Select documentation version" });
		const firstItem = page.locator(".version-dropdown__item").first();

		await trigger.hover();
		await expect(firstItem).toBeVisible();
		await trigger.focus();
		await page.keyboard.press("ArrowDown");
		await expect(firstItem).toBeFocused();
		await page.mouse.move(0, 0);
		await expect(firstItem).toBeHidden();

		await trigger.focus();
		await page.keyboard.press("Enter");
		await trigger.hover();
		await expect(trigger).toHaveAttribute("aria-expanded", "true");
		await expect(firstItem).toBeVisible();
		await page.mouse.move(0, 0);
		await expect(firstItem).toBeVisible();
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

	test("a click outside the dropdown dismisses a keyboard-open menu", async ({ page }) => {
		const trigger = page.getByRole("button", { name: "Select documentation version" });
		const firstItem = page.locator(".version-dropdown__item").first();

		await trigger.focus();
		await page.keyboard.press("Enter");
		await expect(firstItem).toBeVisible();
		await page.keyboard.press("ArrowDown");
		await expect(firstItem).toBeFocused();
		await expect(firstItem).toBeVisible();
		await expect(trigger).toHaveAttribute("aria-expanded", "true");

		await page.getByRole("heading", { level: 1 }).click();
		await expect(trigger).toHaveAttribute("aria-expanded", "false");
		await expect(firstItem).toBeHidden();
	});

	test("Tab follows the normal order through the open menu", async ({ page }) => {
		const trigger = page.getByRole("button", { name: "Select documentation version" });
		const versionItems = page.locator(".version-dropdown__item");

		await trigger.focus();
		await page.keyboard.press("Enter");
		await expect(versionItems.first()).toBeVisible();
		for (const item of await versionItems.all()) {
			await page.keyboard.press("Tab");
			await expect(item).toBeFocused();
		}
		await page.keyboard.press("Tab");
		await expect(trigger).toHaveAttribute("aria-expanded", "false");
		await expect(
			page.locator(".navbar").getByRole("link", { name: "Docs", exact: true }),
		).toBeFocused();
	});

	test("mobile navigation keeps its existing keyboard behavior", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.getByRole("button", { name: "Toggle navigation bar" }).click();
		await page.getByRole("button", { name: "Back to main menu" }).click();

		const dropdown = page.locator(".navbar-sidebar .version-dropdown-wrapper");
		const firstItem = dropdown.locator(".version-dropdown__item").first();
		const collapseButton = dropdown.getByRole("button", { name: "Collapse the dropdown" });

		await expect(firstItem).toBeVisible();
		await firstItem.focus();
		for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
			await page.keyboard.press(key);
			await expect(firstItem).toBeFocused();
		}

		await collapseButton.focus();
		await page.keyboard.press("Enter");
		await expect(firstItem).toBeHidden();
		const expandButton = dropdown.getByRole("button", { name: "Expand the dropdown" });
		await expect(expandButton).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(firstItem).toBeVisible();
	});
});
