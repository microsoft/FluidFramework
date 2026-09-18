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
			.locator('a[href="/docs/start/tree-start/"]');
		await expect(writtenDocsResult).toHaveAccessibleName("SharedTree Quick Start");
		await expect(writtenDocsResult).toHaveAttribute("href", "/docs/start/tree-start/");
		await expect(writtenDocsResult).toBeVisible();
	});

	test("Search returns generated API documentation", async ({ page }) => {
		await page.getByRole("button", { name: "Search" }).click();

		const searchInput = page.getByRole("searchbox");
		await searchInput.fill("FixRecursiveArraySchema");

		const apiDocsResult = page
			.getByRole("dialog")
			.locator('a[href="/docs/api/tree/fixrecursivearrayschema-typealias/"]');
		await expect(apiDocsResult).toHaveAccessibleName("FixRecursiveArraySchema TypeAlias");
		await expect(apiDocsResult).toBeVisible();
	});

	test("Search identifies an exact API item match", async ({ page }) => {
		await page.getByRole("button", { name: "Search" }).click();

		const searchInput = page.getByRole("searchbox");
		const exactApiQueries = [
			{ query: "SchemaFactory/", name: "SchemaFactory", title: "SchemaFactory Class" },
			{
				query: "FixRecursiveArraySchema",
				name: "FixRecursiveArraySchema",
				title: "FixRecursiveArraySchema TypeAlias",
			},
			{
				query: "sharedtreeoptions",
				name: "SharedTreeOptions",
				title: "SharedTreeOptions Interface",
			},
			{ query: "JsonAsTree", name: "JsonAsTree", title: "JsonAsTree Namespace" },
			{ query: "TreeStatus", name: "TreeStatus", title: "TreeStatus Enum" },
		];

		for (const { query, name, title } of exactApiQueries) {
			await searchInput.fill(query);

			const exactMatch = page
				.getByRole("dialog")
				.locator(`[data-api-item-name="${name}"]`)
				.first();
			await expect(exactMatch.locator(".api-exact-match-label")).toHaveText(
				"Exact API match",
			);
			await expect(exactMatch.getByRole("link", { name: title })).toBeVisible();
		}
	});

	test("Search labels documentation versions and prioritizes v3", async ({ page }) => {
		await page.getByRole("button", { name: "Search" }).click();

		const searchInput = page.getByRole("searchbox");
		await searchInput.fill("Fluid Framework Documentation");

		const results = page.getByRole("dialog").locator(".pf-result");
		await expect(results.first().locator(".api-result-version")).toHaveText("v3");
		await expect(
			results.locator(".api-result-version", { hasText: "v2" }).first(),
		).toBeVisible();
		await expect(
			results.locator(".api-result-version", { hasText: "v1" }).first(),
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

	test("Keyboard-activated docs sidebar links move focus to the new page content", async ({
		page,
	}) => {
		await page.goto("/docs/start/tutorial/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		const sidebarLink = page.locator('aside a[href="/docs/start/quick-start"]');

		await sidebarLink.focus();
		await page.keyboard.press("Enter");

		await expect(page).toHaveURL(/\/docs\/start\/quick-start\/?$/);
		await expect(page.locator("main")).toBeFocused();
		await expect(page.locator("main h1")).toHaveText("Quick Start");
	});

	test("Keyboard sidebar navigation does not focus an unrelated pointer navigation page", async ({
		page,
	}) => {
		await page.goto("/docs/start/tutorial/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		const quickStartLink = page.locator('aside a[href="/docs/start/quick-start"]');
		const communityLink = page.locator(".navbar").getByRole("link", { name: /Community/ });
		await quickStartLink.focus();
		await page.keyboard.press("Enter");
		await page.keyboard.press("Enter");

		const overlay = page.locator("#webpack-dev-server-client-overlay");
		if (await overlay.count()) {
			await overlay.evaluate((element) => element.remove());
		}

		await communityLink.click();
		await expect(page).toHaveURL(/\/community\/?$/);
		await page.waitForTimeout(100);
		await expect(page.locator("main")).not.toBeFocused();
	});

	test("Keyboard-expanding a sidebar category does not leak pending navigation to later pointer clicks", async ({
		page,
	}) => {
		await page.goto("/docs/start/tutorial/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		const buildCategory = page
			.locator("aside .menu__link")
			.filter({
				hasText: "Build With Fluid",
			})
			.first();
		const buildOverviewLink = page.locator('aside a[href="/docs/build/overview"]');

		await buildCategory.focus();
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(/\/docs\/start\/tutorial\/?$/);
		await page.waitForTimeout(100);
		await expect(page.locator("main")).not.toBeFocused();
		await expect(buildOverviewLink).toBeVisible();

		const overlay = page.locator("#webpack-dev-server-client-overlay");
		if (await overlay.count()) {
			await overlay.evaluate((element) => element.remove());
		}

		await buildOverviewLink.click();

		await expect(page).toHaveURL(/\/docs\/build\/overview\/?$/);
		await page.waitForTimeout(100);
		await expect(page.locator("main")).not.toBeFocused();
	});

	test("Modified Enter on a sidebar link does not leak pending navigation into later pointer navigation", async ({
		page,
	}) => {
		await page.goto("/docs/start/tutorial/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		const quickStartLink = page.locator('aside a[href="/docs/start/quick-start"]');
		const communityLink = page.locator(".navbar").getByRole("link", { name: /Community/ });

		await quickStartLink.focus();
		await page.keyboard.press("Shift+Enter");
		await expect(page).toHaveURL(/\/docs\/start\/tutorial\/?$/);

		const overlay = page.locator("#webpack-dev-server-client-overlay");
		if (await overlay.count()) {
			await overlay.evaluate((element) => element.remove());
		}

		await communityLink.click();
		await expect(page).toHaveURL(/\/community\/?$/);
		await page.waitForTimeout(100);
		await expect(page.locator("main")).not.toBeFocused();
	});

	test("Repeated Enter on a sidebar link does not leak pending navigation into later pointer navigation", async ({
		page,
	}) => {
		await page.goto("/docs/start/tutorial/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		const quickStartLink = page.locator('aside a[href="/docs/start/quick-start"]');
		const communityLink = page.locator(".navbar").getByRole("link", { name: /Community/ });

		await quickStartLink.focus();
		await quickStartLink.dispatchEvent("keydown", {
			key: "Enter",
			repeat: true,
			bubbles: true,
			cancelable: true,
		});

		const overlay = page.locator("#webpack-dev-server-client-overlay");
		if (await overlay.count()) {
			await overlay.evaluate((element) => element.remove());
		}

		await communityLink.click();
		await expect(page).toHaveURL(/\/community\/?$/);
		await page.waitForTimeout(100);
		await expect(page.locator("main")).not.toBeFocused();
	});
});
