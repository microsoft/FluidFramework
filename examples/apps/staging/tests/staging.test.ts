/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test } from "@playwright/test";

test.describe("staging", () => {
	test.describe("Smoke test", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto("/", { waitUntil: "load" });
			await page.waitForFunction(() => window["fluidStarted"]);
		});

		test("loads and there's an input", async ({ page }) => {
			await page.waitForSelector("input");
		});
	});
});
