/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test, expect } from "@playwright/test";

/**
 * `aria-setsize` and `aria-posinset` are only valid on a limited set of roles (`listitem`,
 * `menuitem`, `option`, `row`, `tab`, `treeitem`, ...). They are *not* valid on the implicit
 * `link` role of an `<a href>`, and axe-core reports them under `aria-allowed-attr` (WCAG 4.1.2).
 *
 * The version dropdown previously set both on its `<a>` items, which produced 10 failures in an
 * Accessibility Insights scan of fluidframework.com. Docusaurus already renders those items inside
 * `<li>` elements, so the surrounding list conveys set size and position natively.
 *
 * These tests guard against reintroducing the invalid attributes.
 */
test.describe("Accessibility", () => {
	// A page that renders the docs version dropdown (only shown on doc pages).
	const docsPageWithVersionDropdown = "/docs/start/tree-start/";

	test("Version dropdown items do not use list ARIA attributes reserved for other roles", async ({
		page,
	}) => {
		await page.goto(docsPageWithVersionDropdown, { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		const versionItems = page.locator(".version-dropdown__item");
		await expect(versionItems.first()).toBeAttached();

		expect(await page.locator(".version-dropdown__item[aria-setsize]").count()).toBe(0);
		expect(await page.locator(".version-dropdown__item[aria-posinset]").count()).toBe(0);
	});

	test("Version dropdown items are exposed as links inside a list", async ({ page }) => {
		await page.goto(docsPageWithVersionDropdown, { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		const versionItem = page.locator(".version-dropdown__item").first();
		await expect(versionItem).toHaveRole("link");
		// The parent <li> is what conveys "item N of M" to assistive technology.
		await expect(versionItem.locator("xpath=..")).toHaveRole("listitem");
	});

	test("No link on a docs page carries aria-setsize or aria-posinset", async ({ page }) => {
		await page.goto(docsPageWithVersionDropdown, { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		expect(await page.locator("a[href][aria-setsize]").count()).toBe(0);
		expect(await page.locator("a[href][aria-posinset]").count()).toBe(0);
		expect(await page.locator("a[href][aria-level]").count()).toBe(0);
	});
});
