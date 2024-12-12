/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IMigrator } from "@fluid-example/migration-tools/internal";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { ISequencedClient } from "@fluidframework/driver-definitions/internal";

import { globals } from "../jest.config.cjs";

describe("separate-container migration", () => {
	beforeAll(async () => {
		// Wait for the page to load first before running any tests
		// so this time isn't attributed to the first test
		await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
		await page.waitForFunction(() => window["fluidStarted"]);
	}, 45000);

	describe("Without summarizer connected", () => {
		beforeEach(async () => {
			await page.goto(globals.PATH, { waitUntil: "load" });
			await page.waitForFunction(() => window["fluidStarted"]);
		});

		it("loads and there's an input", async () => {
			// Validate the input shows up
			await page.waitForSelector("input");
		});

		it("can click the migrate debug button", async () => {
			// Validate there is a button that can be clicked
			await expect(page).toClick("button", { text: '"two"' });
		});

		it("shows the correct code version at pageload", async () => {
			// Validate the migration status shows "one"
			await page.waitForSelector(".migration-status");
			const containsOne = await page.evaluate(() => {
				const migrationStatusElement = document.querySelector(".migration-status");
				return migrationStatusElement?.textContent?.includes("one") === true;
			});
			expect(containsOne).toEqual(true);
		});

		it("migrates and shows the correct code version after migration", async () => {
			// Validate the migration status shows "one" initially
			await Promise.all([
				page.waitForSelector("#sbs-left .migration-status"),
				page.waitForSelector("#sbs-right .migration-status"),
			]);
			const leftContainsOne = await page.evaluate(() => {
				const migrationStatusElements = document.querySelectorAll(".migration-status");
				return migrationStatusElements[0]?.textContent?.includes("one") === true;
			});
			const rightContainsOne = await page.evaluate(() => {
				const migrationStatusElements = document.querySelectorAll(".migration-status");
				return migrationStatusElements[1]?.textContent?.includes("one") === true;
			});
			expect(leftContainsOne).toEqual(true);
			expect(rightContainsOne).toEqual(true);

			const migratorsLength = await page.evaluate(() => {
				return (window["migrators"] as IMigrator[]).length;
			});
			expect(migratorsLength).toEqual(2);

			// Get a promise that will resolve when both sides have finished migration
			const migrationP = page.evaluate(async () => {
				const migrationPs = (window["migrators"] as IMigrator[]).map(async (migrator) => {
					return new Promise<void>((resolve) => {
						migrator.events.once("migrated", resolve);
					});
				});
				return Promise.all(migrationPs);
			});

			await expect(page).toClick("button", { text: '"two"' });

			await migrationP;

			// Validate the migration status shows "two" after the migration
			const leftContainsTwo = await page.evaluate(() => {
				const migrationStatusElements = document.querySelectorAll(".migration-status");
				return migrationStatusElements[0]?.textContent?.includes("two") === true;
			});
			const rightContainsTwo = await page.evaluate(() => {
				const migrationStatusElements = document.querySelectorAll(".migration-status");
				return migrationStatusElements[1]?.textContent?.includes("two") === true;
			});
			expect(leftContainsTwo).toEqual(true);
			expect(rightContainsTwo).toEqual(true);
		});
	});

	describe("With summarizer connected", () => {
		beforeEach(async () => {
			await page.goto(`${globals.PATH}?testMode`, { waitUntil: "load" });
			await page.waitForFunction(() => window["fluidStarted"]);
		});

		it("migrates after summarizer has connected", async () => {
			// Validate the migration status shows "one" initially
			await Promise.all([
				page.waitForSelector("#sbs-left .migration-status"),
				page.waitForSelector("#sbs-right .migration-status"),
			]);

			// Force the containers into write mode
			await expect(page).toClick(
				"#sbs-right > div:nth-child(1) > table > tbody > tr:nth-child(3) > td > button",
			);
			await expect(page).toClick(
				"#sbs-left > div:nth-child(1) > table > tbody > tr:nth-child(3) > td > button",
			);

			const leftContainsOne = await page.evaluate(() => {
				const migrationStatusElements = document.querySelectorAll(".migration-status");
				return migrationStatusElements[0]?.textContent?.includes("one") === true;
			});
			const rightContainsOne = await page.evaluate(() => {
				const migrationStatusElements = document.querySelectorAll(".migration-status");
				return migrationStatusElements[1]?.textContent?.includes("one") === true;
			});
			expect(leftContainsOne).toEqual(true);
			expect(rightContainsOne).toEqual(true);

			// Wait until we see the summarizer join
			await page.evaluate(async () => {
				// This is reaching a bit, but we just need to watch it for test purposes.
				const leftQuorum = (
					(window["containers"] as IContainer[])[0] as unknown as IContainer
				).getQuorum();
				const alreadyHasSummarizer = [...leftQuorum.getMembers().values()].some(
					(sequencedClient) => sequencedClient.client.details.type === "summarizer",
				);
				if (alreadyHasSummarizer) {
					// This should be the path taken since demo mode should spawn the summarizer instantly.
					return;
				}
				// In case the summarizer isn't quite connected yet, return a Promise so we can await for it to join.
				return new Promise<void>((resolve) => {
					const watchForSummarizer = (clientId, sequencedClient: ISequencedClient): void => {
						if (sequencedClient.client.details.type === "summarizer") {
							resolve();
							leftQuorum.off("addMember", watchForSummarizer);
						}
					};
					leftQuorum.on("addMember", watchForSummarizer);
				});
			});

			const migratorsLength = await page.evaluate(() => {
				return (window["migrators"] as IMigrator[]).length;
			});
			expect(migratorsLength).toEqual(2);

			// Get a promise that will resolve when both sides have finished migration
			const migrationP = page.evaluate(async () => {
				for (const container of window["containers"] as IContainer[]) {
					// Since we expect this to run before the button click below, nothing should have migrated.
					// However, we are getting flaky errors and want to rule out the possibility that the puppeteer interaction
					// is somehow permitting these to occur out of order.  Throwing here will cause the returned migrationP
					// promise to immediately reject.
					if (container.getSpecifiedCodeDetails()?.package !== "one") {
						throw new Error("Unexpected early migration!");
					}
				}
				const migrationPs = (window["migrators"] as IMigrator[]).map(async (migrator) => {
					return new Promise<void>((resolve) => {
						migrator.events.once("migrated", resolve);
					});
				});
				return Promise.all(migrationPs);
			});

			await expect(page).toClick("button", { text: '"two"' });

			await migrationP;

			// Validate the migration status shows "two" after the migration
			const leftContainsTwo = await page.evaluate(() => {
				const migrationStatusElements = document.querySelectorAll(".migration-status");
				return migrationStatusElements[0]?.textContent?.includes("two") === true;
			});
			const rightContainsTwo = await page.evaluate(() => {
				const migrationStatusElements = document.querySelectorAll(".migration-status");
				return migrationStatusElements[1]?.textContent?.includes("two") === true;
			});
			expect(leftContainsTwo).toEqual(true);
			expect(rightContainsTwo).toEqual(true);
		});
	});
});
