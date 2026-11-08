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
	await expect(guest.getByLabel("nut quantity", { exact: true })).toHaveText("0");
	await expect(page.getByRole("status", { name: "Guest connection" })).toHaveText("Connected");

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

test("creates, reloads, and synchronizes inventory edits across the iframe", async ({
	page,
}) => {
	await page.goto("/");
	const host = page.getByRole("region", { name: "Host", exact: true });
	await expect(host.getByLabel("nut quantity", { exact: true })).toHaveText("0");
	await expect(page).toHaveURL(/#[^#]+$/);
	const documentURL = page.url();

	let resumeGuest: () => void = () => {};
	const guestCanLoad = new Promise<void>((resolve) => {
		resumeGuest = resolve;
	});
	await page.route("**/guest.bundle.js", async (route) => {
		await guestCanLoad;
		await route.continue();
	});
	try {
		// Hold the Guest script so Host usability does not depend on a fast iframe startup.
		await page.reload({ waitUntil: "domcontentloaded" });
		await expect(host.getByLabel("nut quantity", { exact: true })).toHaveText("0");
		await expect(page).toHaveURL(documentURL);
		await expect(page.getByRole("status", { name: "Guest connection" })).toHaveText(
			"Connecting",
		);
		await host.getByRole("button", { name: "Increase nut quantity" }).click();
		await expect(host.getByLabel("nut quantity", { exact: true })).toHaveText("1");
		await expect(page.getByRole("status", { name: "Guest connection" })).toHaveText(
			"Connecting",
		);
	} finally {
		resumeGuest();
	}

	const guest = page.frameLocator('iframe[title="Guest inventory"]');
	await expect(page.getByRole("status", { name: "Guest connection" })).toHaveText("Connected");
	await expect(guest.getByLabel("nut quantity", { exact: true })).toHaveText("1");
	await guest.getByRole("button", { name: "Increase nut quantity" }).click();
	await expect(host.getByLabel("nut quantity", { exact: true })).toHaveText("2");
	await guest.getByRole("button", { name: "Add Part" }).click();
	await expect(host.getByRole("heading", { name: "New Part", exact: true })).toBeVisible();
	await host.getByRole("button", { name: "Remove New Part" }).click();
	await expect(guest.getByRole("heading", { name: "New Part", exact: true })).toHaveCount(0);
});
