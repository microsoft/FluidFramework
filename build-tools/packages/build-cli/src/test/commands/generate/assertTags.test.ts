/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lilconfig } from "lilconfig";
import { afterEach, describe, it } from "mocha";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

describe("generate:assertTags", () => {
	describe("lilconfig config loading", () => {
		const configName = "assertTagging";
		let testDirs: string[] = [];

		/**
		 * Creates a temporary test directory and copies a fixture config file into it
		 */
		async function createTestFixture(fixtureFileName: string): Promise<string> {
			const testDir = await mkdtemp(path.join(tmpdir(), "assertTagging-test-"));
			testDirs.push(testDir);

			const sourceFile = path.join(fixturesDir, fixtureFileName);
			const targetFile = path.join(testDir, fixtureFileName);
			await copyFile(sourceFile, targetFile);

			return testDir;
		}

		afterEach(async () => {
			// Clean up test directories
			const dirsToClean = testDirs;
			testDirs = [];
			await Promise.all(
				dirsToClean.map(async (dir) => rm(dir, { recursive: true, force: true })),
			);
		});

		it("loads .mjs config files", async () => {
			const testDir = await createTestFixture("assertTagging.config.mjs");

			const config = lilconfig(configName, {
				searchPlaces: [`${configName}.config.mjs`],
			});

			const result = await config.search(testDir);

			assert(result !== null, "Config should be found");
			assert("assertionFunctions" in result.config, "Config should have expected structure");
			const configData = result.config as {
				assertionFunctions: Record<string, number>;
			};
			assert.strictEqual(configData.assertionFunctions.assert, 1);
			assert.strictEqual(configData.assertionFunctions.fail, 0);
		});

		it("loads .cjs config files", async () => {
			const testDir = await createTestFixture("assertTagging.config.cjs");

			const config = lilconfig(configName, {
				searchPlaces: [`${configName}.config.cjs`],
			});

			const result = await config.search(testDir);

			assert(result !== null, "Config should be found");
			assert("assertionFunctions" in result.config, "Config should have expected structure");
			const configData = result.config as {
				assertionFunctions: Record<string, number>;
			};
			assert.strictEqual(configData.assertionFunctions.assert, 1);
			assert.strictEqual(configData.assertionFunctions.fail, 0);
		});

		it("loads .mjs config with empty assertionFunctions", async () => {
			const testDir = await createTestFixture("assertTagging-empty.config.mjs");

			const config = lilconfig(configName, {
				searchPlaces: [`${configName}-empty.config.mjs`],
			});

			const result = await config.search(testDir);

			assert(result !== null);
			const configContentParsed = result.config as {
				assertionFunctions: Record<string, number>;
			};
			assert(
				typeof configContentParsed.assertionFunctions === "object",
				"assertionFunctions should be an object",
			);
			assert(
				Object.keys(configContentParsed.assertionFunctions).length === 0,
				"assertionFunctions should be empty (disables tagging)",
			);
		});

		it("returns null when no config file exists", async () => {
			const testDir = await mkdtemp(path.join(tmpdir(), "assertTagging-no-config-"));
			testDirs.push(testDir);

			const config = lilconfig(configName, {
				searchPlaces: [`${configName}.config.mjs`],
			});

			const result = await config.search(testDir);

			// Should return null when no config is found
			assert(result === null, "Should return null when no config exists");
		});

		it("respects config loading order", async () => {
			const testDir = await mkdtemp(path.join(tmpdir(), "assertTagging-test-"));
			testDirs.push(testDir);

			// Copy both config files
			await copyFile(
				path.join(fixturesDir, "assertTagging.config.cjs"),
				path.join(testDir, "assertTagging.config.cjs"),
			);
			await copyFile(
				path.join(fixturesDir, "assertTagging.config.mjs"),
				path.join(testDir, "assertTagging.config.mjs"),
			);

			const config = lilconfig(configName, {
				searchPlaces: [`${configName}.config.cjs`, `${configName}.config.mjs`],
			});

			const result = await config.search(testDir);

			assert(result !== null, "Config should be found");
			assert(result.filepath.endsWith(".cjs"), "Should load .cjs file when listed first");
		});
	});
});
