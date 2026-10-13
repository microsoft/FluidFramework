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

	test.describe("Embedded video", () => {
		test.beforeEach(async ({ page }) => {
			await page.route("https://www.youtube-nocookie.com/**", async (route) =>
				route.fulfill({
					contentType: "text/html",
					body: `<!doctype html>
						<title>Video</title>
						<button>Play or pause</button>
						<a href="#video">Video title</a>
						<button>Copy link</button>`,
				}),
			);
			await page.goto("/", { waitUntil: "domcontentloaded" });
			await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");
			await expect(
				page.frameLocator(".youtube-video > iframe").getByRole("button").first(),
			).toBeVisible();

			// Use adjacent controls so changes to the homepage do not change this test's tab order.
			await page.locator(".youtube-video").evaluate((video) => {
				const before = document.createElement("button");
				before.textContent = "Before video";
				video.before(before);
				const after = document.createElement("button");
				after.textContent = "After video";
				video.after(after);
			});
		});

		test("Preview has one keyboard stop in both directions", async ({ page }) => {
			const before = page.getByRole("button", { name: "Before video" });
			const after = page.getByRole("button", { name: "After video" });
			const playButton = page.getByRole("button", { name: "Play video" });
			const video = page.locator(".youtube-video");
			const videoPlayer = video.locator("iframe");

			await expect(videoPlayer).toHaveAttribute("tabindex", "-1");
			await expect(videoPlayer).toHaveAttribute("aria-hidden", "true");
			await expect(videoPlayer).toHaveJSProperty("inert", true);

			await before.focus();
			await page.keyboard.press("Tab");
			await expect(playButton).toBeFocused();
			await expect(video).toHaveCSS("outline-style", "solid");
			await expect(video).toHaveCSS("outline-width", "3px");
			await page.keyboard.press("Tab");
			await expect(after).toBeFocused();
			await page.keyboard.press("Shift+Tab");
			await expect(playButton).toBeFocused();
			await page.keyboard.press("Shift+Tab");
			await expect(before).toBeFocused();
		});

		for (const action of ["Enter", "Space", "click"]) {
			test(`${action} activates the player and permits Tab navigation`, async ({ page }) => {
				const playButton = page.getByRole("button", { name: "Play video" });
				const video = page.locator(".youtube-video");
				const videoPlayer = video.locator("iframe");
				const player = page.frameLocator(".youtube-video > iframe");

				if (action === "click") {
					await playButton.click();
				} else {
					await page.getByRole("button", { name: "Before video" }).focus();
					await page.keyboard.press("Tab");
					await expect(playButton).toBeFocused();
					await page.keyboard.press(action);
				}

				await expect(playButton).toHaveCount(0);
				await expect(videoPlayer).toHaveAttribute("src", /[&?]autoplay=1/);
				await expect(videoPlayer).toHaveAttribute("tabindex", "0");
				await expect(videoPlayer).toHaveAttribute("aria-hidden", "false");
				await expect(videoPlayer).toHaveJSProperty("inert", false);
				await expect(videoPlayer).toBeFocused();
				await expect(video).toHaveCSS("outline-style", "solid");
				await expect(video).toHaveCSS("outline-width", "3px");

				for (const name of ["Play or pause", "Video title", "Copy link"]) {
					await page.keyboard.press("Tab");
					await expect(player.getByText(name, { exact: true })).toBeFocused();
				}
				await expect(video).toHaveCSS("outline-style", "solid");
				await page.keyboard.press("Tab");
				await expect(page.getByRole("button", { name: "After video" })).toBeFocused();
				await expect(video).toHaveCSS("outline-style", "none");
			});
		}
	});
});
