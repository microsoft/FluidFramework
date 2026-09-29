/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test } from "@playwright/test";

const navigationItems = [
	"Home",
	"Private Container",
	"Shared Container",
	"Events",
	"Op Latency",
	"Settings",
];

for (const colorScheme of ["light", "dark"] as const) {
	for (const forcedColors of ["active", "none"] as const) {
		test.describe(`Menu with ${colorScheme} colors and forced colors ${forcedColors}`, () => {
			test("Selection remains visible after focus moves away", async ({ page }) => {
				await page.emulateMedia({ colorScheme, forcedColors });
				await page.goto("/", { waitUntil: "load" });
				const devtools = page.locator("devtools");
				await devtools.getByRole("button", { name: "Close", exact: true }).click();

				for (const name of navigationItems) {
					const item = devtools.getByRole("button", { name: new RegExp(`^${name}(?:$| )`) });
					await item.click();
					await page.keyboard.press("Tab");
					await page.mouse.move(0, 0);

					await expect(item).not.toBeFocused();
					await expect(item).toHaveAttribute("aria-current", "page");
					await expect(devtools.locator('[aria-current="page"]')).toHaveCount(1);

					const marker = await item.evaluate((element) => {
						const style = getComputedStyle(element, "::before");
						return {
							content: style.content,
							width: style.borderInlineStartWidth,
							height: Number.parseFloat(style.height),
							style: style.borderInlineStartStyle,
							color: style.borderInlineStartColor,
							background: getComputedStyle(element).backgroundColor,
						};
					});

					if (forcedColors === "active") {
						expect(marker.content).toBe('""');
						expect(marker.width).toBe("3px");
						expect(marker.height).toBeGreaterThan(0);
						expect(marker.style).toBe("solid");
						expect(marker.color).not.toBe(marker.background);

						await item.hover();
						expect(
							await item.evaluate(
								(element) => getComputedStyle(element, "::before").borderInlineStartWidth,
							),
						).toBe("3px");
					} else {
						expect(marker.content).toBe("none");
					}

					for (const otherName of navigationItems.filter((value) => value !== name)) {
						const otherItem = devtools.getByRole("button", {
							name: new RegExp(`^${otherName}(?:$| )`),
						});
						await expect(otherItem).not.toHaveAttribute("aria-current", "page");
						expect(
							await otherItem.evaluate(
								(element) => getComputedStyle(element, "::before").content,
							),
						).toBe("none");
					}
				}
			});
		});
	}
}
