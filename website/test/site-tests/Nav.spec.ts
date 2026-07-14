/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test, expect } from "@playwright/test";

test.describe("Nav", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");
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

	test("Navbar buttons are vertically centered", async ({ page }) => {
		const searchButton = page.getByRole("button", { name: "Search" });
		const colorModeButton = page.getByRole("button", {
			name: /Switch between dark and light mode/,
		});

		const getVerticalCenter = (element: Element): number => {
			const bounds = element.getBoundingClientRect();
			return bounds.top + bounds.height / 2;
		};

		const searchButtonCenter = await searchButton.evaluate(getVerticalCenter);
		const colorModeButtonCenter = await colorModeButton.evaluate(getVerticalCenter);
		expect(Math.abs(searchButtonCenter - colorModeButtonCenter)).toBeLessThanOrEqual(1);
	});

	test("Search returns written documentation", async ({ page }) => {
		await page.getByRole("button", { name: "Search" }).click();

		const searchInput = page.getByRole("searchbox");
		await searchInput.fill("SharedTree Quick Start");

		const writtenDocsResult = page
			.getByRole("dialog")
			.getByRole("link", { name: "SharedTree Quick Start", exact: true });
		await expect(writtenDocsResult).toHaveAttribute("href", "/docs/start/tree-start/");
		await expect(writtenDocsResult).toBeVisible();
	});

	test("Search returns generated API documentation", async ({ page }) => {
		await page.getByRole("button", { name: "Search" }).click();

		const searchInput = page.getByRole("searchbox");
		await searchInput.fill("SharedTreeOptions Interface");

		const apiDocsResult = page
			.getByRole("dialog")
			.locator('a[href="/docs/api/fluid-framework/sharedtreeoptions-interface/"]');
		await expect(apiDocsResult).toHaveAccessibleName("SharedTreeOptions Interface");
		await expect(apiDocsResult).toBeVisible();
	});

	test("Search labels documentation versions and prioritizes v2", async ({ page }) => {
		await page.getByRole("button", { name: "Search" }).click();

		const searchInput = page.getByRole("searchbox");
		await searchInput.fill("Fluid Framework Documentation");

		const results = page.getByRole("dialog").locator(".pf-result");
		await expect(results.first().locator(".pf-result-version")).toHaveText("v2");
		await expect(
			results.locator(".pf-result-version", { hasText: "v1" }).first(),
		).toBeVisible();
	});

	test("Search opens after client-side navigation", async ({ page }) => {
		await page
			.locator(".navbar")
			.getByRole("link", { name: /Community/ })
			.click();
		await expect(page).toHaveURL(/\/community\//);

		await page.getByRole("button", { name: "Search" }).click();

		await expect(page.getByRole("searchbox")).toBeVisible();
	});
});
