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

	test("YouTube video uses an accessible click-to-load facade", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		const videoId = "fjRfTdIYzWg";
		const playButton = page.getByRole("button", {
			name: "Play video: Fluid Framework - Build collaborative apps fast!",
		});
		await expect(playButton).toBeVisible();
		await expect(page.locator(".ffcom-video-container iframe")).toHaveCount(0);

		await playButton.focus();
		await expect(playButton).toBeFocused();

		await playButton.click();
		const videoFrame = page.locator(".ffcom-video-container iframe");
		await expect(videoFrame).toBeAttached();
		await expect(videoFrame).toHaveAttribute(
			"src",
			new RegExp(`youtube-nocookie\\.com/embed/${videoId}`),
		);
	});
});
