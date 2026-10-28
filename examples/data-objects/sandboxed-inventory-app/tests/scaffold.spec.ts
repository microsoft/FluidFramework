/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test } from "@playwright/test";

test("loads the separate Guest bundle in an opaque-origin iframe", async ({ page }) => {
	const pageErrors: Error[] = [];
	page.on("pageerror", (error) => pageErrors.push(error));
	await page.goto("/");

	await expect(page.getByRole("heading", { name: "Host", exact: true })).toBeVisible();
	const iframe = page.getByTitle("Guest inventory");
	await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
	const guest = page.frameLocator('iframe[title="Guest inventory"]');
	await expect(guest.getByRole("heading", { name: "Guest", exact: true })).toBeVisible();
	await expect(guest.getByText("Tree synchronization is not implemented yet.")).toBeVisible();

	const isolation = await guest.locator("body").evaluate(() => {
		const denied = (read: () => unknown): boolean => {
			try {
				read();
				return false;
			} catch (error) {
				return error instanceof DOMException && error.name === "SecurityError";
			}
		};
		return {
			parentDocument: denied(() => window.parent.document),
			parentStorage: denied(() => window.parent.sessionStorage),
			guestStorage: denied(() => window.sessionStorage),
		};
	});
	expect(isolation).toEqual({
		parentDocument: true,
		parentStorage: true,
		guestStorage: true,
	});
	expect(pageErrors).toEqual([]);
});
