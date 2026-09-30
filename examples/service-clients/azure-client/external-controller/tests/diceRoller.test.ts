/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test } from "@playwright/test";

test.describe("external-controller-diceRoller", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		await page.waitForFunction(
			() => (window as unknown as { fluidStarted: unknown }).fluidStarted,
		);
	});

	test("loads and there's a button with Roll", async ({ page }) => {
		// Validate there is a button that can be clicked
		await page.getByRole("button", { name: "Roll" }).first().click();
	});
});
