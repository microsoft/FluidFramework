/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test, expect } from "@playwright/test";
import type { IDiceRoller } from "../src/container/main.js";
import type { IFluidMountableViewEntryPoint } from "@fluid-example/example-utils";

test.describe("diceroller", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.waitForFunction(() => typeof globalThis.loadAdditionalContainer === "function");
	});

	test("The page loads and there's a button with Roll", async ({ page }) => {
		await page.getByRole("button", { name: "Roll" }).click();
	});

	test("raises an event in other connected containers", async ({ page }) => {
		const diceValueP = page.evaluate(async () => {
			// Load an additional container, and use it to watch for an expected roll
			const container = await globalThis.loadAdditionalContainer();
			const { getDefaultDataObject } =
				(await container.getEntryPoint()) as IFluidMountableViewEntryPoint;
			const diceRoller = (await getDefaultDataObject()) as IDiceRoller;
			return new Promise<number>((resolve) => {
				diceRoller.on("diceRolled", () => resolve(diceRoller.value));
			});
		});
		// Click the button, triggering a roll from the main container
		await page.getByRole("button", { name: "Roll" }).click();
		const diceValue = await diceValueP;
		expect(diceValue).toBeGreaterThanOrEqual(1);
		expect(diceValue).toBeLessThanOrEqual(6);
	});
});
