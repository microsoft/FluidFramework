/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { retryWithEventualValue } from "@fluidframework/test-utils/internal";
import { expect, test, type Locator, type Page } from "@playwright/test";

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

	test.describe("Container information", () => {
		async function expectInformationBelowHeading(
			page: Page,
			button: Locator,
			expectScrolling = false,
		): Promise<void> {
			await button.click();
			const information = page.getByRole("note");
			await expect(information).toBeVisible();
			// Measure the final position, not the entrance animation.
			await information.evaluate(async (element) => {
				await Promise.all(
					element.getAnimations().map(async (animation) => animation.finished),
				);
			});
			const heading = page.getByRole("heading", { name: "Shared Container", level: 2 });
			await expect
				.poll(async () => {
					const headingBounds = await heading.boundingBox();
					const buttonBounds = await button.boundingBox();
					const informationBounds = await information.boundingBox();
					return (
						headingBounds !== null &&
						buttonBounds !== null &&
						informationBounds !== null &&
						informationBounds.y >= headingBounds.y + headingBounds.height &&
						informationBounds.y >= buttonBounds.y + buttonBounds.height
					);
				})
				.toBe(true);
			expect(
				await information.evaluate((element) => element.scrollWidth <= element.clientWidth),
			).toBe(true);
			if (page.viewportSize()?.height === 720) {
				expect(
					await information.evaluate(
						(element) => element.scrollHeight <= element.clientHeight,
					),
				).toBe(true);
			}
			if (expectScrolling) {
				expect(
					await information.evaluate(
						(element) => element.getBoundingClientRect().bottom - window.innerHeight,
					),
				).toBeLessThanOrEqual(1);
				expect(
					await information.evaluate((element) => element.scrollHeight > element.clientHeight),
				).toBe(true);
				await information.evaluate((element) => {
					element.scrollTop = element.scrollHeight;
				});
				await expect(
					information.getByText(/A client with write permissions/),
				).toBeInViewport();
			}
			await page.keyboard.press("Escape");
			await expect(information).toBeHidden();
		}

		for (const height of [720, 400]) {
			test(`Information opens below its button and the heading at 1280x${height}`, async ({
				page,
			}) => {
				await page.setViewportSize({ width: 1280, height });
				await page.getByRole("button", { name: "Close", exact: true }).click();
				await page.getByRole("button", { name: /Shared Container/ }).click();
				for (const label of height === 720 ? ["Status", "Client ID", "User ID"] : []) {
					await expectInformationBelowHeading(
						page,
						page.getByRole("button", { name: `${label} information`, exact: true }),
					);
				}

				await page.getByRole("tab", { name: "Audience", exact: true }).click();
				for (const { table, labels } of [
					{
						table: "Audience state table",
						labels: height === 720 ? ["Mode", "Scopes", "Client ID", "User ID"] : ["Mode"],
					},
					{ table: "Audience history table", labels: height === 720 ? ["Client ID"] : [] },
				]) {
					for (const label of labels) {
						await expectInformationBelowHeading(
							page,
							page
								.getByRole("table", { name: table, exact: true })
								.getByRole("button", { name: `${label} information`, exact: true }),
							height === 400 && label === "Mode",
						);
					}
				}
			});
		}
	});
});
