/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import path from "node:path";
import { detectBiomeVersion } from "../common/biomeVersion";
import { testDataPath } from "./init";

describe("biomeVersion", () => {
	describe("detectBiomeVersion", () => {
		it("detects version from installed @biomejs/biome package", async () => {
			// Use the build-tools package directory which has biome installed
			const buildToolsDir = path.resolve(testDataPath, "..");
			const result = await detectBiomeVersion(buildToolsDir);

			assert(result !== undefined, "Should detect biome version");
			assert(typeof result.version === "string", "version should be a string");
			assert(
				result.majorVersion === 1 || result.majorVersion === 2,
				"majorVersion should be 1 or 2",
			);
		});

		it("returns undefined when package is not found", async () => {
			// Use a path that definitely won't have biome installed
			const result = await detectBiomeVersion("/tmp/nonexistent-directory-for-biome-test");
			assert.equal(result, undefined);
		});

		it("walks up directory tree to find biome package", async () => {
			// Start from a deeply nested directory within the test data
			const deepDir = path.resolve(testDataPath, "biome2/nested-root/child/src");
			const result = await detectBiomeVersion(deepDir);

			// Should still find biome by walking up to build-tools/node_modules
			assert(result !== undefined, "Should find biome by walking up directory tree");
		});
	});
});
