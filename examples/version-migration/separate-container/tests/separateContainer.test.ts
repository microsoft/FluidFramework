/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IMigrator } from "@fluid-example/migration-tools/alpha";
import type { IContainer } from "@fluidframework/container-definitions/legacy";
import type { ISequencedClient } from "@fluidframework/driver-definitions/legacy";

import { expect, test } from "@playwright/test";

/* eslint-disable @typescript-eslint/dot-notation */

test.describe("separate-container migration", () => {
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

		test("migrates and shows the correct code version after migration", async ({ page }) => {
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

			await page.getByRole("button", { name: '"two"' }).first().click();

			await migrationP;

			// After migration, the view should update.  Wait and confirm the migration status shows "two".
			await page.waitForFunction(() => {
				const migrationStatusElements = document.querySelectorAll(".migration-status");
				return migrationStatusElements[0]?.textContent?.includes("two") === true;
			});
			await page.waitForFunction(() => {
				const migrationStatusElements = document.querySelectorAll(".migration-status");
				return migrationStatusElements[1]?.textContent?.includes("two") === true;
			});
		});
	});

	test.describe("With summarizer connected", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto("/?testMode", { waitUntil: "load" });
			await page.waitForFunction(() => window["fluidStarted"]);
		});

		test("migrates after summarizer has connected", async ({ page }) => {
			// Validate the migration status shows "one" initially
			await Promise.all([
				page.waitForSelector("#sbs-left .migration-status"),
				page.waitForSelector("#sbs-right .migration-status"),
			]);

			// Force the containers into write mode
			await page
				.locator(
					"#sbs-right > div:nth-child(1) > table > tbody > tr:nth-child(3) > td > button",
				)
				.click();
			await page
				.locator(
					"#sbs-left > div:nth-child(1) > table > tbody > tr:nth-child(3) > td > button",
				)
				.click();

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
					// However, we are getting flaky errors and want to rule out the possibility that the browser-side interaction
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

			await page.getByRole("button", { name: '"two"' }).first().click();

			await migrationP;

			// After migration, the view should update.  Wait and confirm the migration status shows "two".
			await page.waitForFunction(() => {
				const migrationStatusElements = document.querySelectorAll(".migration-status");
				return migrationStatusElements[0]?.textContent?.includes("two") === true;
			});
			await page.waitForFunction(() => {
				const migrationStatusElements = document.querySelectorAll(".migration-status");
				return migrationStatusElements[1]?.textContent?.includes("two") === true;
			});
		});
	});
});
