/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test } from "@playwright/test";

/* eslint-disable @typescript-eslint/dot-notation */

test.describe("Bubblebench", () => {
	test.describe("SimpleTree", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto("/", { waitUntil: "load" });
			await page.waitForFunction(() => window["fluidStarted"]);
		});

		test("The page loads and displays current FPS", async ({ page }) => {
			await expect(page.getByText("FPS").first()).toBeVisible();
		});
	});
});
