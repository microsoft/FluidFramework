/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test, expect } from "@playwright/test";

test.describe("Nav", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
	});

	// TODO:AB#24415: Fix and re-enable
	test("Nav contains the expected links", async ({ page }) => {
		const docsLink = page.getByRole("link", { name: /Docs/ });
		await expect(docsLink).toHaveAttribute("href", "/docs/");

		const communityLink = page.locator(".navbar").getByRole("link", { name: /Community/ });
		await expect(communityLink).toHaveAttribute("href", "/community/");

		const supportLink = page.getByRole("link", { name: /Support/ });
		await expect(supportLink).toHaveAttribute("href", "/support/");
	});
});
