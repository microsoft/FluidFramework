/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "mocha";
import { checkAssertTagging } from "../../../commands/generate/assertTags.js";
import {
	checkAssertTagging as checkAssertTaggingFromIndex,
	type CheckAssertTaggingResult,
} from "../../../index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("checkAssertTagging", () => {
	it("should be exported and callable", () => {
		assert(typeof checkAssertTagging === "function", "checkAssertTagging should be a function");
	});

	it("returns hasUntaggedAsserts: false when no source files exist", async () => {
		const result = await checkAssertTagging({
			repoRoot: __dirname, // Use test directory as repo root (no tsconfigs)
			packagePaths: [],
		});

		assert.strictEqual(result.hasUntaggedAsserts, false);
		assert.strictEqual(result.fileCount, 0);
		assert.deepStrictEqual(result.filePaths, []);
		assert.deepStrictEqual(result.errors, []);
	});
});

describe("checkAssertTagging integration", () => {
	const fixturesDir = path.join(__dirname, "fixtures", "checkAssertTagging");

	it("detects untagged asserts in a package", async () => {
		const result = await checkAssertTagging({
			repoRoot: fixturesDir,
			packagePaths: ["untagged-package"],
		});

		assert.strictEqual(result.hasUntaggedAsserts, true, "Should detect untagged asserts");
		assert.strictEqual(result.fileCount, 1, "Should find one file with untagged asserts");
		assert(result.filePaths.length > 0, "Should have at least one file path");
		assert(
			result.filePaths[0]?.includes("index.ts"),
			"Should identify the correct file",
		);
		assert.deepStrictEqual(result.errors, [], "Should have no errors");
	});

	it("returns false for fully tagged packages", async () => {
		const result = await checkAssertTagging({
			repoRoot: fixturesDir,
			packagePaths: ["tagged-package"],
		});

		assert.strictEqual(result.hasUntaggedAsserts, false, "Should not detect untagged asserts");
		assert.strictEqual(result.fileCount, 0, "Should find no files with untagged asserts");
		assert.deepStrictEqual(result.filePaths, [], "Should have no file paths");
		assert.deepStrictEqual(result.errors, [], "Should have no errors");
	});

	it("handles multiple packages", async () => {
		const result = await checkAssertTagging({
			repoRoot: fixturesDir,
			packagePaths: ["untagged-package", "tagged-package"],
		});

		assert.strictEqual(result.hasUntaggedAsserts, true, "Should detect untagged asserts");
		assert.strictEqual(result.fileCount, 1, "Should find one file total");
	});
});

describe("checkAssertTagging exports", () => {
	it("is exported from package index", () => {
		assert(typeof checkAssertTaggingFromIndex === "function");
	});

	it("CheckAssertTaggingResult type is usable", () => {
		// This test verifies the type is properly exported by using it
		const result: CheckAssertTaggingResult = {
			hasUntaggedAsserts: false,
			fileCount: 0,
			filePaths: [],
			errors: [],
		};
		assert.strictEqual(result.hasUntaggedAsserts, false);
	});
});
