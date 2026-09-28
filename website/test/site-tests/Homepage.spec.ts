/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
	test("Load the homepage (smoke test)", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		expect(await page.title()).toBe("Fluid Framework");
	});

	test("Video title truncates clearly and reveals its full text on focus", async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 720 });
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		const videoTitle = "Fluid Framework - Build collaborative apps fast!";
		const titleLink = page.getByRole("link", { name: videoTitle });
		await expect(titleLink).toBeVisible();
		await expect(titleLink).toHaveAttribute(
			"href",
			"https://www.youtube.com/watch?v=fjRfTdIYzWg",
		);
		await expect(titleLink).toHaveCSS("overflow", "hidden");
		await expect(titleLink).toHaveCSS("text-overflow", "ellipsis");
		await expect(titleLink).toHaveCSS("white-space", "nowrap");
		expect(
			await titleLink.evaluate((element) => element.scrollWidth > element.clientWidth),
		).toBe(true);

		await titleLink.focus();
		await expect(titleLink).toBeFocused();
		await expect(titleLink).toHaveCSS("white-space", "normal");
		await expect(titleLink).toHaveCSS("overflow", "visible");
		expect(
			await titleLink.evaluate((element) => element.scrollWidth <= element.clientWidth),
		).toBe(true);
	});
});
