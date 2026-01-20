/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "mocha";
import { checkAssertTagging } from "../../../commands/generate/assertTags.js";

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
