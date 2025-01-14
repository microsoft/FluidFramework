/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISameContainerMigrator } from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions/legacy";

import { globals } from "../jest.config.cjs";

describe("same-container migration", () => {
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
			await expect(containsOne).toEqual(true);
		});

		// Test skipped, not functioning currently
		it.skip("migrates and shows the correct code version after migration", async () => {
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
			await expect(leftContainsOne).toEqual(true);
			await expect(rightContainsOne).toEqual(true);

			const migratorsLength = await page.evaluate(() => {
				return window["migrators"].length;
			});
			await expect(migratorsLength).toEqual(2);

			// Get a promise that will resolve when both sides have finished migration
			const migrationP = page.evaluate(() => {
				const migrationPs = (window["migrators"] as ISameContainerMigrator[]).map(
					(migrator) => {
						return new Promise<void>((resolve) => {
							migrator.once("migrated", resolve);
						});
					},
				);
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
			await expect(leftContainsTwo).toEqual(true);
			await expect(rightContainsTwo).toEqual(true);
		});
	});

	// Test skipped, not functioning currently
	describe.skip("With summarizer connected", () => {
		beforeEach(async () => {
			await page.goto(`${globals.PATH}`, { waitUntil: "load" });
			await page.waitForFunction(() => window["fluidStarted"]);
		});

		it("migrates after summarizer has connected", async () => {
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
			await expect(leftContainsOne).toEqual(true);
			await expect(rightContainsOne).toEqual(true);

			// Wait until we see the summarizer join
			await page.evaluate(() => {
				// This is reaching a bit, but we just need to watch it for test purposes.
				const leftQuorum = (
					window["migrators"][0]._currentModel.container as IContainer
				).getQuorum();
				const alreadyHasSummarizer =
					[...leftQuorum.getMembers().values()].find(
						(client) => client.client.details.type === "summarizer",
					) !== undefined;
				if (alreadyHasSummarizer) {
					// This should be the path taken since demo mode should spawn the summarizer instantly.
					return;
				}
				// In case the summarizer isn't quite connected yet, return a Promise so we can await for it to join.
				return new Promise<void>((resolve) => {
					const watchForSummarizer = (clientId, details) => {
						if (details.type === "summarizer") {
							resolve();
							leftQuorum.off("addMember", watchForSummarizer);
						}
					};
					leftQuorum.on("addMember", watchForSummarizer);
				});
			});

			const migratorsLength = await page.evaluate(() => {
				return window["migrators"].length;
			});
			await expect(migratorsLength).toEqual(2);

			// Get a promise that will resolve when both sides have finished migration
			const migrationP = page.evaluate(() => {
				const migrationPs = (window["migrators"] as ISameContainerMigrator[]).map(
					(migrator) => {
						return new Promise<void>((resolve) => {
							migrator.once("migrated", resolve);
						});
					},
				);
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
			await expect(leftContainsTwo).toEqual(true);
			await expect(rightContainsTwo).toEqual(true);
		});
	});
});
