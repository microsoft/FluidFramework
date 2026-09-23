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

	test("Embedded video preview has one keyboard stop and transfers focus to the player", async ({
		page,
	}) => {
		await page.route("https://www.youtube-nocookie.com/**", async (route) =>
			route.fulfill({
				contentType: "text/html",
				body: "<!doctype html><title>Video</title>",
			}),
		);
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		const playButton = page.getByRole("button", {
			name: "Play Fluid Framework overview video",
		});
		const videoPlayer = page.getByTitle("Fluid Framework - Build collaborative apps fast!");

		await expect(playButton).toBeVisible();
		await expect(videoPlayer).toHaveAttribute("tabindex", "-1");
		await expect(videoPlayer).toHaveAttribute("aria-hidden", "true");

		await playButton.focus();
		await expect(playButton).toBeFocused();
		await page.keyboard.press("Enter");

		await expect(playButton).toHaveCount(0);
		await expect(videoPlayer).toHaveAttribute("src", /[&?]autoplay=1/);
		await expect(videoPlayer).toHaveAttribute("tabindex", "0");
		await expect(videoPlayer).toHaveAttribute("aria-hidden", "false");
		await expect(videoPlayer).toBeFocused();
	});

	test("Embedded video preview remains pointer-activatable", async ({ page }) => {
		await page.route("https://www.youtube-nocookie.com/**", async (route) =>
			route.fulfill({
				contentType: "text/html",
				body: "<!doctype html><title>Video</title>",
			}),
		);
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		await page.getByRole("button", { name: "Play Fluid Framework overview video" }).click();

		const videoPlayer = page.getByTitle("Fluid Framework - Build collaborative apps fast!");
		await expect(videoPlayer).toHaveAttribute("src", /[&?]autoplay=1/);
		await expect(videoPlayer).toBeFocused();
	});
});
