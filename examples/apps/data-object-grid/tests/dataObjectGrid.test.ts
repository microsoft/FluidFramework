/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test } from "@playwright/test";

test.describe("data-object-grid", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		await page.waitForFunction(() => window["fluidStarted"]);
	});

	test("There's a button to be clicked", async ({ page }) => {
		await page.getByRole("button", { name: "Edit: true" }).first().click();
	});
});
