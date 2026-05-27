/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test } from "@playwright/test";

/* eslint-disable @typescript-eslint/dot-notation */

test.describe("table", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		await page.waitForFunction(() => window["fluidStarted"]);
	});

	test("The page loads and there's a textbox with placeholder Row ID", async ({ page }) => {
		// Verify that our "add row" UI exists on the page as a simple smoke test to verify that the page has been loaded correctly
		await page.getByRole("button", { name: "Add Row" }).first().click();
	});
});
