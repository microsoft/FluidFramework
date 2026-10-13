/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test } from "@playwright/test";
import type { IClaimsDataObject } from "../src/container/index.js";

test.describe("claims-example", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		await page.waitForFunction(() => typeof globalThis.loadAdditionalContainer === "function");
	});

	test("The page loads and there is a Claim button", async ({ page }) => {
		// Validate there is a button that can be clicked
		await page.getByRole("button", { name: "Claim" }).first().click();
	});

	test("propagates a claim and resolves the handle in other connected containers", async ({
		page,
	}) => {
		// The first Claim button in the table claims the first known key.
		const key = "ClaimKey1";
		const ownerP = page.evaluate(async (claimKey: string) => {
			// Load an additional container, and use it to watch for the expected claim
			const container = await globalThis.loadAdditionalContainer();
			const claimsDataObject = (await container.getEntryPoint()) as IClaimsDataObject;
			return new Promise<string | undefined>((resolve) => {
				claimsDataObject.on("claimsChanged", () => {
					// The other client resolves the claimed handle to the same backing
					// directory and reads the owner recorded on it.
					const resolvedOwner = claimsDataObject.getOwner(claimKey);
					if (resolvedOwner !== undefined) {
						resolve(resolvedOwner);
					}
				});
			});
		}, key);

		// Claim the first known key from the main container.
		await page.getByRole("button", { name: "Claim" }).first().click();
		const owner = await ownerP;
		expect(typeof owner).toBe("string");
	});

	test("reports the winner's owner to a client that loses the race", async ({ page }) => {
		// The first Claim button in the table claims the first known key.
		const key = "ClaimKey1";
		const resultP = page.evaluate(async (claimKey: string) => {
			// Load an additional container that will lose the race for the same key.
			const container = await globalThis.loadAdditionalContainer();
			const loser = (await container.getEntryPoint()) as IClaimsDataObject;

			// Wait until this client observes the key as claimed (by the main container).
			const winnerOwner = await new Promise<string>((resolve) => {
				const check = (): void => {
					const observed = loser.getOwner(claimKey);
					if (observed !== undefined) {
						resolve(observed);
					}
				};
				loser.on("claimsChanged", check);
				check();
			});

			// Now attempt to claim the already-claimed key: the attempt must lose, and the
			// loser must still report the winner's owner (not its own identity).
			const accepted = await loser.trySetClaim(claimKey);
			return {
				accepted,
				winnerOwner,
				ownerAfterLosing: loser.getOwner(claimKey),
				loserClaimant: loser.claimant,
			};
		}, key);

		// Claim the first known key from the main container so the additional container loses.
		await page.getByRole("button", { name: "Claim" }).first().click();
		const result = await resultP;

		expect(result.accepted).toBe(false);
		expect(result.ownerAfterLosing).toBe(result.winnerOwner);
		expect(result.winnerOwner).not.toBe(result.loserClaimant);
	});
});
