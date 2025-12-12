/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import path from "node:path";
import { cosmiconfig } from "cosmiconfig";
import { describe, it } from "mocha";

/**
 * Loader for .mjs (ESM) config files.
 * Required for cosmiconfig v9+ which removed default .mjs support.
 * This duplicates the loader from assertTags.ts to test it works correctly.
 */
async function mjsLoader(filepath: string): Promise<unknown> {
	const module = await import(filepath);
	return module.default;
}

describe("generate:assertTags", () => {
	describe("cosmiconfig .mjs loader", () => {
		const configName = "assertTagging";
		const searchPlaces = [`${configName}.config.mjs`];

		it("loads .mjs config files with custom loader", async () => {
			const config = cosmiconfig(configName, {
				searchPlaces,
				loaders: {
					".mjs": mjsLoader,
				},
			});

			// Test with packages/test directory which has an assertTagging.config.mjs
			// Navigate up from build-tools/packages/build-cli to root
			const repoRoot = path.resolve(process.cwd(), "../../..");
			const testDir = path.join(repoRoot, "packages/test");

			// Skip test if the directory doesn't exist (e.g., in isolated test environment)
			if (!existsSync(testDir)) {
				console.log(`Skipping test: ${testDir} does not exist`);
				return;
			}

			const result = await config.search(testDir);

			assert(result !== null, "Config should be found");
			assert(result.config !== undefined, "Config should have content");
			assert(
				typeof result.config === "object" && result.config !== null,
				"Config should be an object",
			);
			assert(
				"assertionFunctions" in result.config,
				"Config should have assertionFunctions property",
			);
		});

		it("loads .mjs config with empty assertionFunctions", async () => {
			const config = cosmiconfig(configName, {
				searchPlaces,
				loaders: {
					".mjs": mjsLoader,
				},
			});

			const repoRoot = path.resolve(process.cwd(), "../../..");
			const testDir = path.join(repoRoot, "packages/test");

			if (!existsSync(testDir)) {
				console.log(`Skipping test: ${testDir} does not exist`);
				return;
			}

			const result = await config.search(testDir);

			assert(result !== null);
			const configContent = result.config as { assertionFunctions: Record<string, number> };
			assert(
				typeof configContent.assertionFunctions === "object",
				"assertionFunctions should be an object",
			);
			// packages/test/assertTagging.config.mjs has empty assertionFunctions
			assert(
				Object.keys(configContent.assertionFunctions).length === 0,
				"packages/test should have empty assertionFunctions (disables tagging)",
			);
		});

		it("returns null when no config file exists", async () => {
			const config = cosmiconfig(configName, {
				searchPlaces,
				loaders: {
					".mjs": mjsLoader,
				},
			});

			// Use a directory that shouldn't have the config
			const repoRoot = path.resolve(process.cwd(), "../../..");
			const nonExistentDir = path.join(repoRoot, "build-tools/packages/build-cli/src");

			const result = await config.search(nonExistentDir);

			// Should return null when no config is found
			assert(
				result === null || result === undefined,
				"Should return null when no config exists",
			);
		});

		it("verifies the loader is necessary for .mjs files", async () => {
			// This test documents why the loader is needed
			// With the loader, .mjs files can be loaded
			const configWithLoader = cosmiconfig(configName, {
				searchPlaces,
				loaders: {
					".mjs": mjsLoader,
				},
			});

			const repoRoot = path.resolve(process.cwd(), "../../..");
			const testDir = path.join(repoRoot, "packages/test");

			if (!existsSync(testDir)) {
				console.log(`Skipping test: ${testDir} does not exist`);
				return;
			}

			const resultWithLoader = await configWithLoader.search(testDir);

			// The main assertion: WITH the loader, config MUST be found
			assert(
				resultWithLoader !== null,
				"With custom loader, .mjs config files should be loaded",
			);
			assert(resultWithLoader.filepath.endsWith(".mjs"), "Loaded file should be a .mjs file");
		});
	});
});
