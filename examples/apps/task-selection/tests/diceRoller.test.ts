/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test } from "@playwright/test";

test.describe("diceRoller", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		await page.waitForFunction(() => window["fluidStarted"]);
	});

	test("loads and there's a button with Roll", async ({ page }) => {
		await page.getByRole("button", { name: "Roll" }).first().click();
	});
});
