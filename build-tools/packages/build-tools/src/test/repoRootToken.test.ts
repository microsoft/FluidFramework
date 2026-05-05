/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	REPO_ROOT_TOKEN,
	replaceRepoRootToken,
	replaceRepoRootTokens,
} from "../fluidBuild/fluidBuildConfig";

describe("Repo Root Token", () => {
	const testRepoRoot = "/home/user/repo";

	describe("replaceRepoRootToken", () => {
		it("replaces ${repoRoot} token with actual repo root path", () => {
			const result = replaceRepoRootToken("${repoRoot}/.eslintrc.cjs", testRepoRoot);
			assert.strictEqual(result, "/home/user/repo/.eslintrc.cjs");
		});

		it("handles multiple occurrences of ${repoRoot} token", () => {
			const result = replaceRepoRootToken(
				"${repoRoot}/common/${repoRoot}/config",
				testRepoRoot,
			);
			assert.strictEqual(result, "/home/user/repo/common//home/user/repo/config");
		});

		it("leaves paths without token unchanged", () => {
			const result = replaceRepoRootToken("../../.eslintrc.cjs", testRepoRoot);
			assert.strictEqual(result, "../../.eslintrc.cjs");
		});

		it("handles paths with token in the middle", () => {
			const result = replaceRepoRootToken("some/${repoRoot}/path", testRepoRoot);
			assert.strictEqual(result, "some//home/user/repo/path");
		});

		it("handles globs with token", () => {
			const result = replaceRepoRootToken("${repoRoot}/common/**/*.ts", testRepoRoot);
			assert.strictEqual(result, "/home/user/repo/common/**/*.ts");
		});
	});

	describe("replaceRepoRootTokens", () => {
		it("replaces token in array of paths", () => {
			const result = replaceRepoRootTokens(
				["${repoRoot}/.eslintrc.cjs", "${repoRoot}/common/config.json"],
				testRepoRoot,
			);
			assert.deepStrictEqual(result, [
				"/home/user/repo/.eslintrc.cjs",
				"/home/user/repo/common/config.json",
			]);
		});

		it("handles mixed array with and without tokens", () => {
			const result = replaceRepoRootTokens(
				["${repoRoot}/.eslintrc.cjs", "../../local.json", "${repoRoot}/common/*.ts"],
				testRepoRoot,
			);
			assert.deepStrictEqual(result, [
				"/home/user/repo/.eslintrc.cjs",
				"../../local.json",
				"/home/user/repo/common/*.ts",
			]);
		});

		it("handles empty array", () => {
			const result = replaceRepoRootTokens([], testRepoRoot);
			assert.deepStrictEqual(result, []);
		});

		it("preserves order of paths", () => {
			const result = replaceRepoRootTokens(
				["path1", "${repoRoot}/path2", "path3", "${repoRoot}/path4"],
				testRepoRoot,
			);
			assert.deepStrictEqual(result, [
				"path1",
				"/home/user/repo/path2",
				"path3",
				"/home/user/repo/path4",
			]);
		});
	});

	describe("REPO_ROOT_TOKEN constant", () => {
		it("is defined correctly", () => {
			assert.strictEqual(REPO_ROOT_TOKEN, "${repoRoot}");
		});
	});

	describe("edge cases", () => {
		it("handles paths with non-existent files (no validation at token level)", () => {
			// Token replacement doesn't validate file existence - that's the responsibility
			// of the consumer. This test confirms the function works with any path string.
			const result = replaceRepoRootToken(
				"${repoRoot}/non-existent/path/config.json",
				testRepoRoot,
			);
			assert.strictEqual(result, "/home/user/repo/non-existent/path/config.json");
		});

		it("handles empty repo root path", () => {
			const result = replaceRepoRootToken("${repoRoot}/config.json", "");
			assert.strictEqual(result, "/config.json");
		});

		it("handles repo root with trailing slash", () => {
			const result = replaceRepoRootToken("${repoRoot}/config.json", "/home/user/repo/");
			assert.strictEqual(result, "/home/user/repo/config.json");
		});

		it("normalizes Windows backslashes to forward slashes", () => {
			const result = replaceRepoRootToken("${repoRoot}/.eslintrc.cjs", "C:\\Users\\dev\\repo");
			assert.strictEqual(result, "C:/Users/dev/repo/.eslintrc.cjs");
		});

		it("normalizes Windows backslashes in replaceRepoRootTokens", () => {
			const result = replaceRepoRootTokens(
				["${repoRoot}/.eslintrc.cjs", "${repoRoot}/common/**/*.ts"],
				"C:\\Users\\dev\\repo",
			);
			assert.deepStrictEqual(result, [
				"C:/Users/dev/repo/.eslintrc.cjs",
				"C:/Users/dev/repo/common/**/*.ts",
			]);
		});

		it("normalizes Windows repo root with trailing backslash", () => {
			const result = replaceRepoRootToken("${repoRoot}/config.json", "C:\\Users\\dev\\repo\\");
			assert.strictEqual(result, "C:/Users/dev/repo/config.json");
		});
	});
});
