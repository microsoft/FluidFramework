/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { lilconfig } from "lilconfig";
import { afterEach, describe, it } from "mocha";

describe("generate:assertTags", () => {
	describe("lilconfig .mjs loader", () => {
		const configName = "assertTagging";
		const searchPlaces = [`${configName}.config.mjs`];
		let testDirs: string[] = [];

		/**
		 * Creates a temporary test directory with an .mjs config file
		 */
		function createTestFixture(configContent: string): string {
			const testDir = path.join(
				tmpdir(),
				`assertTagging-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			);
			mkdirSync(testDir, { recursive: true });
			testDirs.push(testDir);

			const configPath = path.join(testDir, `${configName}.config.mjs`);
			writeFileSync(configPath, configContent, "utf8");

			return testDir;
		}

		afterEach(() => {
			// Clean up test directories
			for (const dir of testDirs) {
				if (existsSync(dir)) {
					rmSync(dir, { recursive: true, force: true });
				}
			}
			testDirs = [];
		});

		it("loads .mjs config files", async () => {
			const configContent = `
export default {
assertionFunctions: {
assert: 1,
fail: 0,
},
};
`;
			const testDir = createTestFixture(configContent);

			const config = lilconfig(configName, {
				searchPlaces,
			});

			const result = await config.search(testDir);

			assert(result !== null, "Config should be found");
			assert("assertionFunctions" in result.config, "Config should have expected structure");
		});

		it("loads .mjs config with empty assertionFunctions", async () => {
			const configContent = `
export default {
assertionFunctions: {},
};
`;
			const testDir = createTestFixture(configContent);

			const config = lilconfig(configName, {
				searchPlaces,
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
			const testDir = path.join(tmpdir(), `assertTagging-no-config-${Date.now()}`);
			mkdirSync(testDir, { recursive: true });
			testDirs.push(testDir);

			const config = lilconfig(configName, {
				searchPlaces,
			});

			const result = await config.search(testDir);

			// Should return null when no config is found
			assert(
				result === null || result === undefined,
				"Should return null when no config exists",
			);
		});

		it("loads .mjs files with native ESM support", async () => {
			const configContent = `
export default {
assertionFunctions: {
assert: 1,
},
};
`;
			const testDir = createTestFixture(configContent);

			// lilconfig natively supports .mjs files
			const config = lilconfig(configName, {
				searchPlaces,
			});

			const result = await config.search(testDir);

			// lilconfig should load .mjs files natively
			assert(result !== null, "lilconfig should load .mjs config files natively");
			assert(result.filepath.endsWith(".mjs"), "Loaded file should be a .mjs file");
		});
	});
});
