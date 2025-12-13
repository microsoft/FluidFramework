/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cosmiconfig } from "cosmiconfig";
import { afterEach, describe, it } from "mocha";
import { mjsLoader } from "../../../library/configLoader.js";

describe("generate:assertTags", () => {
	describe("cosmiconfig .mjs loader", () => {
		const configName = "assertTagging";
		const searchPlaces = [`${configName}.config.mjs`];
		let testDirs: string[] = [];

		/**
		 * Creates a temporary test directory with an .mjs config file
		 */
		function createTestFixture(configContent: string): string {
			const testDir = mkdtempSync(path.join(tmpdir(), "assertTagging-test-"));
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

		it("loads .mjs config files with custom loader", async () => {
			const configContent = `
export default {
assertionFunctions: {
assert: 1,
fail: 0,
},
};
`;
			const testDir = createTestFixture(configContent);

			const config = cosmiconfig(configName, {
				searchPlaces,
				loaders: {
					".mjs": mjsLoader,
				},
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

			const config = cosmiconfig(configName, {
				searchPlaces,
				loaders: {
					".mjs": mjsLoader,
				},
			});

			const result = await config.search(testDir);

			assert(result !== null);
			assert(Object.keys(result.config.assertionFunctions).length === 0);
		});

		it("returns null when no config file exists", async () => {
			const testDir = mkdtempSync(path.join(tmpdir(), "assertTagging-no-config-"));
			testDirs.push(testDir);

			const config = cosmiconfig(configName, {
				searchPlaces,
				loaders: {
					".mjs": mjsLoader,
				},
			});

			const result = await config.search(testDir);

			assert(result === null || result === undefined);
		});

		it("verifies the loader is necessary for .mjs files", async () => {
			const configContent = `
export default {
assertionFunctions: {
assert: 1,
},
};
`;
			const testDir = createTestFixture(configContent);

			// With the loader, .mjs files can be loaded
			const configWithLoader = cosmiconfig(configName, {
				searchPlaces,
				loaders: {
					".mjs": mjsLoader,
				},
			});

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
