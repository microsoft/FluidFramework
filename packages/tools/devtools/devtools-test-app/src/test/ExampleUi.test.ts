/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { retryWithEventualValue } from "@fluidframework/test-utils/internal";
import { expect, test, type Page } from "@playwright/test";

test.describe("End to end tests", () => {
	/**
	 * Gets the value of the text form backed by our CollaborativeTextArea.
	 *
	 * @remarks Assumes there is only one `text-area` element on the page.
	 *
	 * @param expectedValue - The value we expect the value of the text area to be.
	 */
	async function getTextFormValue(page: Page, expectedValue: string): Promise<string> {
		return retryWithEventualValue(
			/* callback: */ async () =>
				page.evaluate(() => {
					const divs = document.querySelectorAll(".example-app-text-area");
					const textAreaElements = divs[0].querySelectorAll("textarea");
					const textarea = textAreaElements[0];
					return textarea?.value;
				}),
			/* check: */ (actualValue) => actualValue === expectedValue,
			/* defaultValue: */ "not propagated",
		);
	}

	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		await page.waitForFunction(
			() => (window as unknown as { fluidStarted: unknown }).fluidStarted,
		);
		await page.waitForSelector("textarea");
	});

	test("Smoke: verify test app can be launched", async ({ page }) => {
		// Verify by checking for text area associated with the SharedString.
		const textArea = await getTextFormValue(page, "");
		expect(textArea).toEqual("");
	});

	for (const viewport of [
		{ width: 1280, height: 720 },
		{ width: 640, height: 360 },
		{ width: 480, height: 280 },
		{ width: 320, height: 256 },
		{ width: 640, height: 160 },
	]) {
		test(`Status information does not cover the heading at ${viewport.width}x${viewport.height}`, async ({
			page,
		}) => {
			await page.getByRole("button", { name: "Close", exact: true }).click();
			await page.getByRole("button", { name: /Shared Container/ }).click();
			await page.setViewportSize(viewport);

			const heading = page.getByRole("heading", { name: "Shared Container", level: 2 });
			const statusButton = page.getByRole("button", { name: "Status information" });
			await statusButton.focus();
			await page.keyboard.press("Enter");

			const information = page.getByRole("note");
			await expect(information).toBeVisible();
			await expect(information).toHaveCSS("white-space", "normal");
			await expect
				.poll(async () => {
					const headingBounds = await heading.boundingBox();
					const buttonBounds = await statusButton.boundingBox();
					const informationBounds = await information.boundingBox();
					expect(headingBounds).not.toBeNull();
					expect(buttonBounds).not.toBeNull();
					expect(informationBounds).not.toBeNull();
					return (
						headingBounds !== null &&
						buttonBounds !== null &&
						informationBounds !== null &&
						informationBounds.y >= headingBounds.y + headingBounds.height &&
						informationBounds.y >= buttonBounds.y + buttonBounds.height &&
						informationBounds.x >= 0 &&
						informationBounds.x + informationBounds.width <= viewport.width + 1 &&
						informationBounds.y + informationBounds.height <= viewport.height + 1
					);
				})
				.toBe(true);

			await information.hover();
			await expect(information).toBeVisible();
			expect(
				await information.evaluate((element) => element.scrollWidth <= element.clientWidth),
			).toBe(true);
			await page.keyboard.press("Tab");
			await expect(information.getByRole("link")).toBeFocused();
			await page.keyboard.press("Escape");
			await expect(information).toBeHidden();
			await expect(statusButton).toBeFocused();

			await statusButton.click();
			await expect(information).toBeVisible();
			await page.keyboard.press("Escape");
			await expect(information).toBeHidden();
			await expect(statusButton).toBeFocused();
		});
	}
});
