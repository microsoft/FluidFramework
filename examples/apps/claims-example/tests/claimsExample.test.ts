/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import puppeteer, { Browser, Page } from "puppeteer";
import { globals } from "../jest.config.cjs";
import type { IClaimsDataObject } from "../src/container/index.js";

describe("claims-example", () => {
	let browser: Browser;
	let page: Page;

	beforeAll(async () => {
		// Launch the browser once for all tests
		// Use chrome-headless-shell since some tests don't work as-is with the new headless mode.
		// AB#7150: Remove this once we have fixed the tests.
		browser = await puppeteer.launch({ headless: "shell" });
		// Load the page once to avoid a cold load on first test - otherwise the first test takes
		// significantly longer to load. This way we can extend just the timeout for the cold load.
		page = await browser.newPage();
		await page.goto(globals.PATH);
		await page.waitForFunction(() => typeof globalThis.loadAdditionalContainer === "function");
		await page.close();
	}, 20_000);

	beforeEach(async () => {
		page = await browser.newPage();
		await page.goto(globals.PATH);
		await page.waitForFunction(() => typeof globalThis.loadAdditionalContainer === "function");
	});

	it("The page loads and there is a Claim button", async () => {
		// Validate there is a button that can be clicked
		await expect(page).toClick("button", { text: "Claim" });
	});

	it("propagates a claim and resolves the handle in other connected containers", async () => {
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
		await expect(page).toClick("button", { text: "Claim" });
		const owner = await ownerP;
		expect(typeof owner).toBe("string");
	});

	it("reports the winner's owner to a client that loses the race", async () => {
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
		await expect(page).toClick("button", { text: "Claim" });
		const result = await resultP;

		expect(result.accepted).toBe(false);
		expect(result.ownerAfterLosing).toBe(result.winnerOwner);
		expect(result.winnerOwner).not.toBe(result.loserClaimant);
	});

	afterEach(async () => {
		await page.close();
	});

	afterAll(async () => {
		await browser.close();
	});
});
