/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test, expect } from "@playwright/test";
import type { Route } from "@playwright/test";

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
		await expect(page.locator("main h1")).toHaveText("Quick Start");
		await expect(page.locator("main")).toBeFocused();

		await page
			.locator(".navbar")
			.getByRole("link", { name: /Community/ })
			.click();
		await expect(page).toHaveURL(/\/community\/?$/);
		await expect(page.locator("main h1")).toHaveText("Community");
		await page.waitForTimeout(100);
		await expect(page.locator("main")).not.toBeFocused();
	});

	// Docusaurus uses <aside> above 996px and a closable .navbar-sidebar menu at narrower widths.
	for (const width of [1280, 768]) {
		test(`Slow keyboard navigation waits for the new content at ${width}px`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 720 });
			await page.addInitScript(() => {
				Object.defineProperty(navigator, "connection", {
					value: { effectiveType: "4g", saveData: true },
				});
			});
			await page.goto("/docs/start/tutorial/", { waitUntil: "domcontentloaded" });
			await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

			const isNarrow = width === 768;
			if (isNarrow) {
				await page.getByRole("button", { name: "Toggle navigation bar" }).focus();
				await page.keyboard.press("Enter");
			}
			const sidebar = page.locator(isNarrow ? ".navbar-sidebar" : "aside");
			const sidebarLink = sidebar.locator('a[href="/docs/start/quick-start"]');
			await expect(sidebarLink).toBeVisible();
			const pendingScripts: Route[] = [];
			await page.route("**/*.js", (route) => {
				pendingScripts.push(route);
			});

			try {
				await sidebarLink.focus();
				await expect(sidebarLink).toBeFocused();
				await page.keyboard.press("Enter");

				await expect(page).toHaveURL(/\/docs\/start\/quick-start\/?$/);
				await expect.poll(() => pendingScripts.length).toBeGreaterThan(0);
				// Keep the destination pending beyond the previous 50 ms focus delay.
				await page.waitForTimeout(150);
				await expect(page.locator("main h1")).toHaveText(
					"Tutorial: DiceRoller application",
				);
				await expect(page.locator("main")).not.toBeFocused();
			} finally {
				await page.unroute("**/*.js");
				await Promise.all(pendingScripts.map(async (route) => route.continue()));
			}

			await expect(page.locator("main h1")).toHaveText("Quick Start");
			await expect(page.locator("main")).toBeFocused();
			await page.keyboard.press("Tab");
			await expect(page.locator("main :focus")).toHaveCount(1);
		});
	}

	test("Pointer navigation cancels focus while a keyboard destination is pending", async ({
		page,
	}) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, "connection", {
				value: { effectiveType: "4g", saveData: true },
			});
		});
		await page.goto("/docs/start/tutorial/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		const pendingScripts: Route[] = [];
		await page.route("**/*.js", (route) => {
			pendingScripts.push(route);
		});

		try {
			await page.locator('aside a[href="/docs/start/quick-start"]').focus();
			await page.keyboard.press("Enter");
			await expect.poll(() => pendingScripts.length).toBeGreaterThan(0);
			await expect(page).toHaveURL(/\/docs\/start\/quick-start\/?$/);

			await page
				.locator(".navbar")
				.getByRole("link", { name: /Community/ })
				.click();
			await expect(page).toHaveURL(/\/community\/?$/);
		} finally {
			await page.unroute("**/*.js");
			await Promise.all(pendingScripts.map(async (route) => route.continue()));
		}

		await expect(page.locator("main h1")).toHaveText("Community");
		await page.waitForTimeout(100);
		await expect(page.locator("main")).not.toBeFocused();
	});

	test.describe("Narrow docs sidebar", () => {
		test.use({ viewport: { width: 768, height: 720 } });

		test.beforeEach(async ({ page }) => {
			await page.goto("/docs/start/tutorial/", { waitUntil: "domcontentloaded" });
			await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

			await page.getByRole("button", { name: "Toggle navigation bar" }).focus();
			await page.keyboard.press("Enter");
			await expect(
				page.locator('.navbar-sidebar a[href="/docs/start/quick-start"]'),
			).toBeVisible();
		});

		test("Keyboard navigation moves focus to the new page content", async ({ page }) => {
			await page.locator('.navbar-sidebar a[href="/docs/start/quick-start"]').focus();
			await page.keyboard.press("Enter");

			await expect(page).toHaveURL(/\/docs\/start\/quick-start\/?$/);
			await expect(page.locator("main h1")).toHaveText("Quick Start");
			await expect(page.locator("main")).toBeFocused();
		});

		test("Keyboard category expansion does not move focus after a pointer click", async ({
			page,
		}) => {
			const sidebar = page.locator(".navbar-sidebar");
			const buildCategory = sidebar.getByRole("button", {
				name: "Build With Fluid",
				exact: true,
			});
			const buildOverviewLink = sidebar.locator('a[href="/docs/build/overview"]');

			await buildCategory.focus();
			await page.keyboard.press("Enter");
			await expect(page).toHaveURL(/\/docs\/start\/tutorial\/?$/);
			await expect(buildOverviewLink).toBeVisible();
			await expect(buildCategory).toBeFocused();

			await sidebar.locator('a[href="/docs/start/quick-start"]').click();
			await expect(page).toHaveURL(/\/docs\/start\/quick-start\/?$/);
			await expect(page.locator("main h1")).toHaveText("Quick Start");
			await page.waitForTimeout(100);
			await expect(page.locator("main")).not.toBeFocused();
		});
	});

	test("Sidebar category expansion cancels focus while a keyboard destination is pending", async ({
		page,
	}) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, "connection", {
				value: { effectiveType: "4g", saveData: true },
			});
		});
		await page.goto("/docs/start/tutorial/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		const pendingScripts: Route[] = [];
		await page.route("**/*.js", (route) => {
			pendingScripts.push(route);
		});

		try {
			await page.locator('aside a[href="/docs/start/quick-start"]').focus();
			await page.keyboard.press("Enter");
			await expect.poll(() => pendingScripts.length).toBeGreaterThan(0);
			await expect(page).toHaveURL(/\/docs\/start\/quick-start\/?$/);
			await expect(page.locator("main h1")).toHaveText("Tutorial: DiceRoller application");

			const buildCategory = page
				.locator("aside")
				.getByRole("button", { name: "Build With Fluid", exact: true });
			await buildCategory.focus();
			await page.keyboard.press("Enter");
			await expect(buildCategory).toHaveAttribute("aria-expanded", "true");
			await expect(buildCategory).toBeFocused();
			await expect(page).toHaveURL(/\/docs\/start\/quick-start\/?$/);
		} finally {
			await page.unroute("**/*.js");
			await Promise.all(pendingScripts.map(async (route) => route.continue()));
		}

		await expect(page.locator("main h1")).toHaveText("Quick Start");
		await page.waitForTimeout(100);
		await expect(page.locator("main")).not.toBeFocused();
	});

	test("Modified Enter on a sidebar link does not leak pending navigation into later pointer navigation", async ({
		page,
	}) => {
		await page.goto("/docs/start/tutorial/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		const quickStartLink = page.locator('aside a[href="/docs/start/quick-start"]');

		await quickStartLink.focus();
		await page.keyboard.press("Shift+Enter");
		await expect(page).toHaveURL(/\/docs\/start\/tutorial\/?$/);

		await quickStartLink.click();
		await expect(page).toHaveURL(/\/docs\/start\/quick-start\/?$/);
		await expect(page.locator("main h1")).toHaveText("Quick Start");
		await page.waitForTimeout(100);
		await expect(page.locator("main")).not.toBeFocused();
	});

	test("Repeated Enter on a sidebar link does not affect later pointer navigation", async ({
		page,
	}) => {
		await page.goto("/docs/start/tutorial/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("html")).toHaveAttribute("data-has-hydrated", "true");

		const quickStartLink = page.locator('aside a[href="/docs/start/quick-start"]');
		const buildCategory = page
			.locator("aside")
			.getByRole("button", { name: "Build With Fluid", exact: true });

		await buildCategory.focus();
		try {
			await page.keyboard.down("Enter");
			await quickStartLink.focus();
			await page.keyboard.down("Enter");
		} finally {
			await page.keyboard.up("Enter");
		}

		await expect(page).toHaveURL(/\/docs\/start\/tutorial\/?$/);
		await quickStartLink.click();
		await expect(page).toHaveURL(/\/docs\/start\/quick-start\/?$/);
		await expect(page.locator("main h1")).toHaveText("Quick Start");
		await page.waitForTimeout(100);
		await expect(page.locator("main")).not.toBeFocused();
	});
});
