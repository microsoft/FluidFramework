/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISameContainerMigrator } from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions/legacy";

import { expect, test } from "@playwright/test";

/* eslint-disable @typescript-eslint/dot-notation */

test.describe("same-container migration", () => {
	test.describe("Without summarizer connected", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto("/", { waitUntil: "load" });
			await page.waitForFunction(() => window["fluidStarted"]);
		});

		test("loads and there's an input", async ({ page }) => {
			// Validate the input shows up
			await page.waitForSelector("input");
		});

		test("can click the migrate debug button", async ({ page }) => {
			// Validate there is a button that can be clicked
			await page.getByRole("button", { name: '"two"' }).first().click();
		});

		test("shows the correct code version at pageload", async ({ page }) => {
			// Validate the migration status shows "one"
			await page.waitForSelector(".migration-status");
			const containsOne = await page.evaluate(() => {
				const migrationStatusElement = document.querySelector(".migration-status");
				return migrationStatusElement?.textContent?.includes("one") === true;
			});
			expect(containsOne).toEqual(true);
		});

		// Test skipped, not functioning currently
		test.skip("migrates and shows the correct code version after migration", async ({
			page,
		}) => {
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
				return window["migrators"].length;
			});
			expect(migratorsLength).toEqual(2);

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

			await page.getByRole("button", { name: '"two"' }).first().click();

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

	// Test skipped, not functioning currently
	test.describe
		.skip("With summarizer connected", () => {
			test.beforeEach(async ({ page }) => {
				await page.goto("/", { waitUntil: "load" });
				await page.waitForFunction(() => window["fluidStarted"]);
			});

			test("migrates after summarizer has connected", async ({ page }) => {
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
				expect(migratorsLength).toEqual(2);

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

				await page.getByRole("button", { name: '"two"' }).first().click();

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
