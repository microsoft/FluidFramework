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

	test.describe("Container information", () => {
		test.beforeEach(async ({ page }) => {
			await page.getByRole("button", { name: "Close", exact: true }).click();
			await page.getByRole("button", { name: /Shared Container/ }).click();
		});

		async function resizeDevtoolsPanel(page: Page, width: number): Promise<void> {
			const panel = page.getByTestId("devtools-panel");
			const bounds = await panel.boundingBox();
			if (bounds === null) {
				throw new Error("The Devtools panel is not visible.");
			}

			await page.locator(".devtools-resize-handle").hover();
			await page.mouse.down();
			await page.mouse.move(bounds.x + bounds.width - width, bounds.y + bounds.height / 2);
			await page.mouse.up();
			await expect(panel).toHaveCSS("width", `${width}px`);
		}

		for (const { viewport, panelWidth } of [
			{ viewport: { width: 1280, height: 720 }, panelWidth: 500 },
			{ viewport: { width: 1280, height: 720 }, panelWidth: 320 },
			{ viewport: { width: 320, height: 256 }, panelWidth: 320 },
			{ viewport: { width: 640, height: 160 }, panelWidth: 500 },
		]) {
			test(`Status information does not cover the heading at ${viewport.width}x${viewport.height} with a ${panelWidth}px panel`, async ({
				page,
			}) => {
				const isDefaultLayout = viewport.width === 1280 && panelWidth === 500;
				await resizeDevtoolsPanel(page, panelWidth);
				await page.setViewportSize(viewport);
				const panel = page.getByTestId("devtools-panel");
				await expect(panel).toHaveCSS("width", `${panelWidth}px`);
				await expect
					.poll(async () =>
						panel.evaluate((element) => {
							const bounds = element.getBoundingClientRect();
							return bounds.x >= 0 && bounds.right <= window.innerWidth;
						}),
					)
					.toBe(true);

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

				if (isDefaultLayout) {
					await expect
						.poll(async () =>
							information.evaluate((element) => element.getBoundingClientRect().width),
						)
						.toBeGreaterThanOrEqual(250);
					expect(
						await information.evaluate(
							(element) => element.scrollHeight <= element.clientHeight,
						),
					).toBe(true);
				}

				await information.hover();
				await expect(information).toBeVisible();
				expect(
					await information.evaluate((element) => element.scrollWidth <= element.clientWidth),
				).toBe(true);
				if (viewport.height === 160) {
					await expect(information).toHaveCSS("overflow-y", "auto");
					expect(
						await information.evaluate(
							(element) => element.scrollHeight > element.clientHeight,
						),
					).toBe(true);
				}
				await page.keyboard.press("Tab");
				await expect(information.getByRole("link")).toBeFocused();
				await expect(information.getByRole("link")).toBeInViewport({ ratio: 1 });
				await page.keyboard.press("Escape");
				await expect(information).toBeHidden();
				await expect(statusButton).toBeFocused();

				if (isDefaultLayout) {
					await statusButton.click();
					await expect(information).toBeVisible();
					await page.keyboard.press("Escape");
					await expect(information).toBeHidden();
					await expect(statusButton).toBeFocused();
				}
			});
		}

		for (const panelWidth of [500, 320]) {
			for (const { label, content } of [
				{ label: "Client ID", content: /ID assigned by the Fluid/ },
				{ label: "User ID", content: /Represents the application-specific user identifier/ },
			]) {
				test(`${label} information has no scrollbars with a ${panelWidth}px panel`, async ({
					page,
				}) => {
					await resizeDevtoolsPanel(page, panelWidth);
					const button = page.getByRole("button", { name: `${label} information` });
					await button.focus();
					await page.keyboard.press("Space");

					const information = page.getByRole("note");
					await expect(information).toBeVisible();
					await expect(information).toContainText(content);
					await expect(information).toHaveCSS("white-space", "normal");
					await expect(information).toHaveCSS("overflow-x", "visible");
					await expect(information).toHaveCSS("overflow-y", "visible");
					expect(
						await information.evaluate((element) => {
							const bounds = element.getBoundingClientRect();
							const textBounds = [...element.childNodes]
								.filter((node) => node.nodeType === Node.TEXT_NODE)
								.flatMap((node) => {
									const range = document.createRange();
									range.selectNodeContents(node);
									return [...range.getClientRects()];
								});
							return (
								textBounds.length > 0 &&
								textBounds.every(
									(text) =>
										text.left >= bounds.left &&
										text.top >= bounds.top &&
										text.right <= bounds.right &&
										text.bottom <= bounds.bottom,
								)
							);
						}),
					).toBe(true);
					await information.hover();
					await expect(information).toBeVisible();
					await page.keyboard.press("Escape");
					await expect(information).toBeHidden();
					await expect(button).toBeFocused();
				});
			}
		}
	});
});
