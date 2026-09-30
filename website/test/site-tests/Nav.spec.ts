/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test, expect } from "@playwright/test";
import type { Locator, Page, Route } from "@playwright/test";

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
});

async function openSidebar(page: Page, width: number, path: string): Promise<Locator> {
	await page.setViewportSize({ width, height: 720 });
	await page.goto(path, { waitUntil: "domcontentloaded" });
	await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");
	// Docusaurus uses a closable navbar menu below 996px.
	if (width < 996) {
		await page.getByRole("button", { name: "Toggle navigation bar" }).press("Enter");
	}
	const sidebar = page.locator(width < 996 ? ".navbar-sidebar" : "aside");
	await expect(sidebar).toBeVisible();
	return sidebar;
}

/**
 * Runs assertions while keyboard navigation to Quick Start waits for its scripts.
 * Releases the scripts even if an assertion fails.
 */
async function withPendingQuickStart(
	page: Page,
	width: number,
	assertPending: (sidebar: Locator) => Promise<void>,
): Promise<void> {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "connection", {
			value: { effectiveType: "4g", saveData: true },
		});
	});
	const sidebar = await openSidebar(page, width, "/docs/start/tutorial/");
	const pendingScripts: Route[] = [];
	const holdScript = (route: Route): void => {
		pendingScripts.push(route);
	};
	await page.route("**/*.js", holdScript);
	try {
		await sidebar.locator('a[href="/docs/start/quick-start"]').press("Enter");
		await expect(page).toHaveURL(/\/docs\/start\/quick-start\/?$/);
		await expect.poll(() => pendingScripts.length).toBeGreaterThan(0);
		// Exceed the previous 50 ms focus delay before scripts can complete.
		await page.waitForTimeout(150);
		await expect(page.locator("main h1")).toHaveText("Tutorial: DiceRoller application");
		await assertPending(sidebar);
	} finally {
		await page.unroute("**/*.js", holdScript);
		await Promise.all(pendingScripts.map(async (route) => route.continue()));
	}
}

test.describe("Docs sidebar focus", () => {
	for (const width of [1280, 768]) {
		test(`Enter focuses Containers content at ${width}px`, async ({ page }) => {
			const sidebar = await openSidebar(page, width, "/docs/build/overview/");
			await sidebar.locator('a[href="/docs/build/containers"]').press("Enter");
			await expect(page).toHaveURL(/\/docs\/build\/containers\/?$/);
			await expect(page.locator("main h1")).toHaveText("Containers");
			await expect(page.locator("main")).toBeFocused();
			await page.keyboard.press("Tab");
			await expect(page.locator("main :focus")).toHaveCount(1);

			if (width === 1280) {
				await page
					.locator(".navbar")
					.getByRole("link", { name: /Community/ })
					.click();
				await expect(page).toHaveURL(/\/community\/?$/);
				await expect(page.locator("main h1")).toHaveText("Community");
				await page.waitForTimeout(100);
				await expect(page.locator("main")).not.toBeFocused();
			}
		});

		test(`Slow navigation waits for content at ${width}px`, async ({ page }) => {
			await withPendingQuickStart(page, width, async () => {
				await expect(page.locator("main")).not.toBeFocused();
			});
			await expect(page.locator("main h1")).toHaveText("Quick Start");
			await expect(page.locator("main")).toBeFocused();
			await page.keyboard.press("Tab");
			await expect(page.locator("main :focus")).toHaveCount(1);
		});
	}

	for (const cancellation of ["pointer navigation", "category expansion"]) {
		test(`${cancellation} cancels pending focus`, async ({ page }) => {
			await withPendingQuickStart(page, 1280, async (sidebar) => {
				if (cancellation === "pointer navigation") {
					await page
						.locator(".navbar")
						.getByRole("link", { name: /Community/ })
						.click();
					await expect(page).toHaveURL(/\/community\/?$/);
				} else {
					const category = sidebar.getByRole("button", {
						name: "Build With Fluid",
						exact: true,
					});
					await category.press("Enter");
					await expect(category).toHaveAttribute("aria-expanded", "true");
					await expect(category).toBeFocused();
					await expect(page).toHaveURL(/\/docs\/start\/quick-start\/?$/);
				}
			});
			await expect(page.locator("main h1")).toHaveText(
				cancellation === "pointer navigation" ? "Community" : "Quick Start",
			);
			await page.waitForTimeout(100);
			await expect(page.locator("main")).not.toBeFocused();
		});
	}

	test("Narrow category expansion does not affect later pointer navigation", async ({ page }) => {
		const sidebar = await openSidebar(page, 768, "/docs/start/tutorial/");
		const category = sidebar.getByRole("button", { name: "Build With Fluid", exact: true });
		await category.press("Enter");
		await expect(page).toHaveURL(/\/docs\/start\/tutorial\/?$/);
		await expect(sidebar.locator('a[href="/docs/build/overview"]')).toBeVisible();
		await expect(category).toBeFocused();
		await sidebar.locator('a[href="/docs/start/quick-start"]').click();
		await expect(page).toHaveURL(/\/docs\/start\/quick-start\/?$/);
		await expect(page.locator("main h1")).toHaveText("Quick Start");
		await page.waitForTimeout(100);
		await expect(page.locator("main")).not.toBeFocused();
	});

	for (const keyPress of ["Modified", "Repeated"]) {
		test(`${keyPress} Enter does not affect later pointer navigation`, async ({ page }) => {
			const sidebar = await openSidebar(page, 1280, "/docs/start/tutorial/");
			const link = sidebar.locator('a[href="/docs/start/quick-start"]');
			if (keyPress === "Modified") {
				await link.press("Shift+Enter");
			} else {
				await sidebar
					.getByRole("button", { name: "Build With Fluid", exact: true })
					.focus();
				try {
					await page.keyboard.down("Enter");
					await link.focus();
					await page.keyboard.down("Enter");
				} finally {
					await page.keyboard.up("Enter");
				}
			}
			await expect(page).toHaveURL(/\/docs\/start\/tutorial\/?$/);
			await link.click();
			await expect(page).toHaveURL(/\/docs\/start\/quick-start\/?$/);
			await expect(page.locator("main h1")).toHaveText("Quick Start");
			await page.waitForTimeout(100);
			await expect(page.locator("main")).not.toBeFocused();
		});
	}
});
