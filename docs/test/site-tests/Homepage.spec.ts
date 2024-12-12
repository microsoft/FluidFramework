/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
	test("Load the homepage (smoke test)", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		expect(await page.title()).toBe("Fluid Framework");
	});
});
