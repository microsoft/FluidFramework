/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test, expect } from "@playwright/test";

/**
 * {@link https://www.w3.org/TR/wai-aria-1.2/#aria-setsize | `aria-setsize`} and
 * {@link https://www.w3.org/TR/wai-aria-1.2/#aria-posinset | `aria-posinset`} are only supported on
 * a limited set of roles (`listitem`, `menuitem`, `option`, `row`, `tab`, `treeitem`, ...). They are
 * not among the supported states and properties of the
 * {@link https://www.w3.org/TR/wai-aria-1.2/#link | `link` role}, which an `<a href>` carries
 * implicitly per {@link https://www.w3.org/TR/html-aria/#el-a | ARIA in HTML}. Setting them there
 * misrepresents the element to assistive technology, violating
 * {@link https://www.w3.org/WAI/WCAG22/Understanding/name-role-value | WCAG 4.1.2 (Name, Role, Value)}.
 *
 * The docs version dropdown renders its items as `<a>` elements inside `<li>` elements, so the
 * surrounding list conveys set size and position natively.
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

	test("Links without an explicit role do not carry aria-setsize or aria-posinset", async ({
		page,
	}) => {
		await page.goto(docsPageWithVersionDropdown, { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		// Only `<a href>` elements without an explicit `role` have the implicit `link` role, which
		// does not support these attributes. Elements that opt into another role (e.g. `menuitem`,
		// `treeitem`) may legitimately use them.
		expect(await page.locator("a[href]:not([role])[aria-setsize]").count()).toBe(0);
		expect(await page.locator("a[href]:not([role])[aria-posinset]").count()).toBe(0);
	});
});
