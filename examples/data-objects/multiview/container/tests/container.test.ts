/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { test } from "@playwright/test";

/* eslint-disable @typescript-eslint/dot-notation */

test.describe("CoordinateContainerRuntimeFactory", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		await page.waitForFunction(() => window["fluidStarted"]);
	});

	test("The page loads and the expected number of slider controls are present", async ({
		page,
	}) => {
		const numSliders = await page.evaluate(() => {
			return document.querySelectorAll("input[type=range]").length;
		});
		// 2 sides, 11 slider views, 2 sliders per view
		assert.strictEqual(numSliders, 44);
	});
});
