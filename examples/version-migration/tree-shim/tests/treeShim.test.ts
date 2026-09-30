/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test } from "@playwright/test";

/* eslint-disable @typescript-eslint/dot-notation */

test.describe("tree-shim", () => {
	test.describe("Smoke test", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto("/", { waitUntil: "load" });
			await page.waitForFunction(() => window["fluidStarted"]);
		});

		test("loads and there's an input", async ({ page }) => {
			// Validate the input shows up
			await page.waitForSelector("input");
		});
	});
});
