/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import { strict as assert } from "node:assert";

import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		expect(await page.title()).toBe("Hello from Fluid Framework | Fluid Framework");
	});

	test("Load the homepage (smoke test)", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
	});
});
