/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page): Promise<void> {
	await expect(page.getByRole("heading", { name: "Inventory:" })).toBeVisible();
	await expect.poll(() => new URL(page.url()).hash).not.toBe("");
}

async function editInventory(page: Page): Promise<void> {
	await page.getByRole("button", { name: "Add Part", exact: true }).click();
	await expect(page.locator(".counter")).toHaveCount(3);
	await page
		.locator(".counter")
		.last()
		.getByRole("button", { name: "+", exact: true })
		.click();
	await expect(page.locator(".counter_value").last()).toHaveText("1");
	await page.getByRole("button", { name: "Remove Part", exact: true }).last().click();
	await expect(page.locator(".counter")).toHaveCount(2);
	await page
		.locator(".counter")
		.first()
		.getByRole("button", { name: "+", exact: true })
		.click();
	await expect(page.locator(".counter_value").first()).toHaveText("1");
}

for (const selection of ["", "unknown", "ephemeral", "session"]) {
	test(`inventory controls: ${selection || "default"}`, async ({ page }) => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(`/?fluidClient=${selection}`);
		await ready(page);
		await editInventory(page);
		if (selection === "" || selection === "unknown" || selection === "session") {
			await page.reload();
			await ready(page);
			await expect(page.locator(".counter_value").first()).toHaveText("1");
		}
		expect(errors).toEqual([]);
	});
}

test("independent inventory clients: tinylicious", async ({ browser, baseURL }) => {
	test.skip(
		process.env.INVENTORY_TEST_TINYLICIOUS !== "1",
		"Requires a running Tinylicious service on port 7070",
	);
	const contexts = await Promise.all([
		browser.newContext(),
		browser.newContext(),
		browser.newContext(),
	]);
	try {
		const [writerContext, peerContext, reloadContext] = contexts;
		const writer = await writerContext.newPage();
		const peer = await peerContext.newPage();
		const errors: string[] = [];
		for (const page of [writer, peer]) {
			page.on("pageerror", (error) => errors.push(error.message));
		}
		await writer.goto(`${baseURL}/?fluidClient=tinylicious`);
		await ready(writer);
		await editInventory(writer);
		const sharedURL = writer.url();
		await peer.goto(sharedURL);
		await ready(peer);
		await expect(peer.locator(".counter_value").first()).toHaveText("1");
		await peer.getByRole("button", { name: "Add Part", exact: true }).click();
		await expect(writer.locator(".counter")).toHaveCount(3);
		await Promise.all([
			writer
				.locator(".counter")
				.first()
				.getByRole("button", { name: "+", exact: true })
				.click(),
			peer.locator(".counter").nth(1).getByRole("button", { name: "+", exact: true }).click(),
		]);
		for (const page of [writer, peer]) {
			await expect(page.locator(".counter_value")).toHaveText(["2", "1", "0"]);
		}
		await peer.getByRole("button", { name: "Remove Part", exact: true }).last().click();
		await expect(writer.locator(".counter")).toHaveCount(2);
		await writerContext.close();
		await peerContext.close();
		const reopened = await reloadContext.newPage();
		reopened.on("pageerror", (error) => errors.push(error.message));
		await reopened.goto(sharedURL);
		await ready(reopened);
		await expect(reopened.locator(".counter_value")).toHaveText(["2", "1"]);
		expect(errors).toEqual([]);
	} finally {
		await Promise.all(contexts.map(async (context) => context.close()));
	}
});
