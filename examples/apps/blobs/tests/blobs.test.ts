/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test, expect } from "@playwright/test";
import type { IBlobCollection } from "../src/container/index.js";

test.describe("blobs", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.waitForFunction(() => typeof globalThis.loadAdditionalContainer === "function");
	});

	test("loads and there's a button with Add blob", async ({ page }) => {
		await page.getByRole("button", { name: "Add blob" }).click();
	});

	test("can attach and be loaded in a second container", async ({ page }) => {
		await page.getByRole("button", { name: "Attach container" }).click();
		// The url will update to include the id in the hash once the attach completes. We need to
		// wait for this because the attach proceeds async after clicking the attach button, otherwise
		// we'll try to load the additional container before the attach completes.
		await page.waitForFunction(() => window.location.hash.length > 0);
		const blobsCountP = page.evaluate(async () => {
			// Load an additional container, and use it to watch for an expected blob addition
			const container = await globalThis.loadAdditionalContainer();
			const blobCollection = (await container.getEntryPoint()) as IBlobCollection;
			return new Promise<number>((resolve) => {
				blobCollection.events.on("blobAdded", () => resolve(blobCollection.getBlobs().length));
			});
		});
		await page.getByRole("button", { name: "Add blob" }).click();
		const blobsCount = await blobsCountP;
		expect(blobsCount).toBe(1);
	});
});
