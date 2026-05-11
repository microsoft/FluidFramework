/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach } from "mocha";
import { globFn, globWithGitignore, toPosixPath } from "../fluidBuild/tasks/taskUtils";
import { testDataPath } from "./init";

const globTestDataPath = path.resolve(testDataPath, "glob");

/**
 * Helper to extract relative paths from absolute results for easier testing.
 * Converts absolute paths to paths relative to globTestDataPath and sorts them, to enable robust equality assertions.
 */
function toRelativePaths(results: string[]): string[] {
	return results.map((f) => path.relative(globTestDataPath, f)).sort();
}

/**
 * Helper to verify paths are absolute and optionally check their basenames.
 */
function assertAbsolutePaths(results: string[], expectedBasenames?: string[]): void {
	for (const result of results) {
		assert(path.isAbsolute(result), `Expected absolute path: ${result}`);
	}
	if (expectedBasenames !== undefined) {
		const basenames = results.map((f) => path.basename(f)).sort();
		assert.deepEqual(basenames, expectedBasenames);
	}
}

/**
 * Tests for globFn wrapper function in taskUtils.ts.
 *
 * @privateRemarks
 * The following usage notes are for test development context and may become outdated:
 * - CopyfilesTask (with options: nodir, dot, follow, ignore)
 * - TypeValidationTask (with option: nodir)
 * - GoodFence (with option: nodir)
 */
describe("globFn (glob wrapper for task utilities)", () => {
	describe("basic file matching", () => {
		it("matches .ts files with wildcard", async () => {
			const pattern = path.join(globTestDataPath, "*.ts");
			const results = await globFn(pattern);
			const relativePaths = toRelativePaths(results);
			assert.deepEqual(relativePaths, ["file1.ts", "file2.ts", "tracked.ts"]);
		});

		it("matches all files with *", async () => {
			const pattern = path.join(globTestDataPath, "*");
			const results = await globFn(pattern, { nodir: true });
			const relativePaths = toRelativePaths(results);
			assert.deepEqual(relativePaths, ["file1.ts", "file2.ts", "file3.mjs", "tracked.ts"]);
		});

		it("matches files in nested directories with **", async () => {
			const pattern = path.join(globTestDataPath, "**/*.ts");
			const results = await globFn(pattern, { nodir: true });
			const relativePaths = toRelativePaths(results);
			assert.deepEqual(
				relativePaths,
				[
					"dotfiles/visible.ts",
					"file1.ts",
					"file2.ts",
					"ignore-test/exclude.ts",
					"ignore-test/include.ts",
					"nested/deep/file1.ts",
					"nested/deep/file2.ts",
					"nested/deep/file3.ts",
					"nested/file1.ts",
					"nested/file2.ts",
					"tracked.ts",
				].sort(),
			);
		});

		it("returns empty array for no matches", async () => {
			const pattern = path.join(globTestDataPath, "*.nonexistent");
			const results = await globFn(pattern);
			assert.deepEqual(results, []);
		});
	});

	describe("nodir option", () => {
		it("excludes directories when nodir is true", async () => {
			const pattern = path.join(globTestDataPath, "*");
			const results = await globFn(pattern, { nodir: true });
			const relativePaths = toRelativePaths(results);
			assert.deepEqual(relativePaths, ["file1.ts", "file2.ts", "file3.mjs", "tracked.ts"]);
		});

		it("includes directories when nodir is false", async () => {
			const pattern = path.join(globTestDataPath, "*");
			const results = await globFn(pattern, { nodir: false });
			const relativePaths = toRelativePaths(results);
			assert.deepEqual(relativePaths, [
				"dotfiles",
				"file1.ts",
				"file2.ts",
				"file3.mjs",
				"ignore-test",
				"nested",
				"tracked.ts",
			]);
		});
	});

	describe("dot option (hidden files)", () => {
		it("excludes dot files by default", async () => {
			const pattern = path.join(globTestDataPath, "dotfiles/*");
			const results = await globFn(pattern, { nodir: true });
			const relativePaths = toRelativePaths(results);
			assert.deepEqual(relativePaths, ["dotfiles/visible.ts"]);
		});

		it("includes dot files when dot is true", async () => {
			const pattern = path.join(globTestDataPath, "dotfiles/*");
			const results = await globFn(pattern, { nodir: true, dot: true });
			const relativePaths = toRelativePaths(results);
			assert.deepEqual(relativePaths, [
				"dotfiles/.config",
				"dotfiles/.hidden",
				"dotfiles/visible.ts",
			]);
		});
	});

	describe("ignore option", () => {
		it("ignores files matching ignore pattern (string)", async () => {
			const pattern = path.join(globTestDataPath, "ignore-test/*");
			const ignorePattern = path.join(globTestDataPath, "ignore-test/exclude.ts");
			const results = await globFn(pattern, { nodir: true, ignore: ignorePattern });
			const relativePaths = toRelativePaths(results);
			assert.deepEqual(relativePaths, ["ignore-test/include.ts", "ignore-test/other.mjs"]);
		});

		it("ignores files matching ignore pattern (array)", async () => {
			const pattern = path.join(globTestDataPath, "ignore-test/*");
			const ignorePatterns = [
				path.join(globTestDataPath, "ignore-test/exclude.ts"),
				path.join(globTestDataPath, "ignore-test/other.mjs"),
			];
			const results = await globFn(pattern, { nodir: true, ignore: ignorePatterns });
			const relativePaths = toRelativePaths(results);
			assert.deepEqual(relativePaths, ["ignore-test/include.ts"]);
		});
	});

	describe("cwd option", () => {
		it("uses cwd as base for relative patterns", async () => {
			const results = await globFn("*.ts", { cwd: globTestDataPath, nodir: true });
			// When using cwd without absolute:true, results are already relative to cwd
			const sorted = results.map((f) => f).sort();
			assert.deepEqual(sorted, ["file1.ts", "file2.ts", "tracked.ts"]);
		});
	});

	describe("absolute option", () => {
		it("returns absolute paths when absolute is true", async () => {
			const results = await globFn("*.ts", {
				cwd: globTestDataPath,
				nodir: true,
				absolute: true,
			});
			assertAbsolutePaths(results, ["file1.ts", "file2.ts", "tracked.ts"]);
		});

		it("returns relative paths when absolute is not set", async () => {
			const results = await globFn("*.ts", { cwd: globTestDataPath, nodir: true });
			for (const result of results) {
				assert(!path.isAbsolute(result), `Expected relative path: ${result}`);
			}
			const relativePaths = results.map((f) => f).sort();
			assert.deepEqual(relativePaths, ["file1.ts", "file2.ts", "tracked.ts"]);
		});
	});

	describe("ordering behavior", () => {
		it("returns results in sorted order (glob library default)", async () => {
			const results = await globFn("**/*.ts", {
				cwd: globTestDataPath,
				nodir: true,
			});
			const isSorted = results.every((item, index) => {
				if (index === 0) return true;
				return item >= results[index - 1];
			});
			assert(
				isSorted,
				`Expected results to be sorted, but got: ${results.slice(0, 5).join(", ")}...`,
			);
		});
	});
});

describe("toPosixPath utility", () => {
	it("converts backslashes to forward slashes", () => {
		const input = "src\\utils\\file.ts";
		const result = toPosixPath(input);
		assert.equal(result, "src/utils/file.ts");
	});

	it("preserves forward slashes", () => {
		const input = "src/utils/file.ts";
		const result = toPosixPath(input);
		assert.equal(result, "src/utils/file.ts");
	});

	it("converts Windows absolute paths to POSIX format", () => {
		const input = "C:\\Users\\username\\project\\src\\file.ts";
		const result = toPosixPath(input);
		assert.equal(result, "C:/Users/username/project/src/file.ts");
	});

	it("preserves POSIX absolute paths", () => {
		const input = "/home/username/project/src/file.ts";
		const result = toPosixPath(input);
		assert.equal(result, "/home/username/project/src/file.ts");
	});
});

/**
 * Tests for globWithGitignore function in taskUtils.ts.
 *
 * @privateRemarks
 * The following usage note is for test development context and may become outdated:
 * - Used by LeafWithGlobInputOutputDoneFileTask.getFiles() for input/output files with gitignore support
 */
describe("globWithGitignore (LeafTask file enumeration)", () => {
	const gitIgnoredDir = path.join(globTestDataPath, "gitignored");
	const gitIgnoredFile = path.join(gitIgnoredDir, "shouldBeIgnored.ts");
	const ignoredPatternFile = path.join(globTestDataPath, "test.ignored");

	beforeEach(async () => {
		// Create gitignored directory and file for testing
		await mkdir(gitIgnoredDir, { recursive: true });
		await writeFile(
			gitIgnoredFile,
			"/*!\n * Copyright (c) Microsoft Corporation and contributors. All rights reserved.\n * Licensed under the MIT License.\n */\n\n// This file should be ignored by gitignore\n",
		);
		// Create a file matching *.ignored pattern
		await writeFile(ignoredPatternFile, "// This file matches *.ignored pattern\n");
	});

	afterEach(async () => {
		// Clean up test files
		await rm(gitIgnoredDir, { recursive: true, force: true });
		await rm(ignoredPatternFile, { force: true });
	});

	it("includes gitignored files when gitignore option is false", async () => {
		// Verify test files exist before testing
		assert(existsSync(gitIgnoredFile), "shouldBeIgnored.ts should exist");

		const results = await globWithGitignore(["**/*.ts"], {
			cwd: globTestDataPath,
			gitignore: false,
		});
		const relativePaths = toRelativePaths(results);
		assert.deepEqual(
			relativePaths,
			[
				"dotfiles/visible.ts",
				"file1.ts",
				"file2.ts",
				"gitignored/shouldBeIgnored.ts",
				"ignore-test/exclude.ts",
				"ignore-test/include.ts",
				"nested/deep/file1.ts",
				"nested/deep/file2.ts",
				"nested/deep/file3.ts",
				"nested/file1.ts",
				"nested/file2.ts",
				"tracked.ts",
			].sort(),
		);
	});

	it("excludes gitignored files when gitignore option is true", async () => {
		// Verify test files exist before testing
		assert(existsSync(gitIgnoredFile), "shouldBeIgnored.ts should exist");

		const results = await globWithGitignore(["**/*.ts"], {
			cwd: globTestDataPath,
			gitignore: true,
		});
		const relativePaths = toRelativePaths(results);
		assert.deepEqual(
			relativePaths,
			[
				"dotfiles/visible.ts",
				"file1.ts",
				"file2.ts",
				"ignore-test/exclude.ts",
				"ignore-test/include.ts",
				"nested/deep/file1.ts",
				"nested/deep/file2.ts",
				"nested/deep/file3.ts",
				"nested/file1.ts",
				"nested/file2.ts",
				"tracked.ts",
			].sort(),
		);
	});

	it("excludes gitignored files by default", async () => {
		const results = await globWithGitignore(["**/*.ts"], {
			cwd: globTestDataPath,
		});
		const relativePaths = toRelativePaths(results);
		assert.deepEqual(
			relativePaths,
			[
				"dotfiles/visible.ts",
				"file1.ts",
				"file2.ts",
				"ignore-test/exclude.ts",
				"ignore-test/include.ts",
				"nested/deep/file1.ts",
				"nested/deep/file2.ts",
				"nested/deep/file3.ts",
				"nested/file1.ts",
				"nested/file2.ts",
				"tracked.ts",
			].sort(),
		);
	});

	it("excludes files matching gitignore patterns", async () => {
		// Verify the test file exists before testing
		assert(existsSync(ignoredPatternFile), "test.ignored should exist");

		const results = await globWithGitignore(["*"], {
			cwd: globTestDataPath,
			gitignore: true,
		});
		const relativePaths = toRelativePaths(results);
		// test.ignored should be excluded by *.ignored pattern in .gitignore
		assert.deepEqual(relativePaths, ["file1.ts", "file2.ts", "file3.mjs", "tracked.ts"]);
	});

	it("includes files matching gitignore patterns when gitignore is false", async () => {
		// Verify the test file exists before testing
		assert(existsSync(ignoredPatternFile), "test.ignored should exist");

		const results = await globWithGitignore(["*"], {
			cwd: globTestDataPath,
			gitignore: false,
		});
		const relativePaths = toRelativePaths(results);
		// test.ignored should be included when gitignore is disabled
		assert.deepEqual(relativePaths, [
			"file1.ts",
			"file2.ts",
			"file3.mjs",
			"test.ignored",
			"tracked.ts",
		]);
	});

	it("excludes directories matching gitignore patterns", async () => {
		// Verify test files exist before testing
		assert(existsSync(gitIgnoredFile), "shouldBeIgnored.ts should exist");

		const results = await globWithGitignore(["**/*.ts"], {
			cwd: globTestDataPath,
			gitignore: true,
		});
		const relativePaths = toRelativePaths(results);
		assert.deepEqual(
			relativePaths,
			[
				"dotfiles/visible.ts",
				"file1.ts",
				"file2.ts",
				"ignore-test/exclude.ts",
				"ignore-test/include.ts",
				"nested/deep/file1.ts",
				"nested/deep/file2.ts",
				"nested/deep/file3.ts",
				"nested/file1.ts",
				"nested/file2.ts",
				"tracked.ts",
			].sort(),
		);
	});

	it("returns absolute paths", async () => {
		const results = await globWithGitignore(["*.ts"], {
			cwd: globTestDataPath,
			gitignore: false,
		});
		assertAbsolutePaths(results, ["file1.ts", "file2.ts", "tracked.ts"]);
	});

	it("handles multiple glob patterns", async () => {
		const results = await globWithGitignore(["*.ts", "*.mjs"], {
			cwd: globTestDataPath,
			gitignore: false,
		});
		const relativePaths = toRelativePaths(results);
		assert.deepEqual(relativePaths, ["file1.ts", "file2.ts", "file3.mjs", "tracked.ts"]);
	});

	describe("ordering behavior", () => {
		it("returns results in breadth-first order (globby library behavior)", async () => {
			const results = await globWithGitignore(["**/*.ts"], {
				cwd: globTestDataPath,
				gitignore: false,
			});
			// Convert to relative paths for easier comparison
			const relativePaths = results.map((f) => path.relative(globTestDataPath, f));

			// globby (fast-glob) returns results in breadth-first order:
			// files at the root level come before files in subdirectories
			// This is NOT lexicographically sorted
			assert(relativePaths.length > 0, "Should have results");

			// Verify that files in root come before files in subdirectories
			const rootFiles = relativePaths.filter((p) => !p.includes(path.sep));
			const nestedFiles = relativePaths.filter((p) => p.includes(path.sep));

			// Find indices
			const lastRootIndex = relativePaths.lastIndexOf(rootFiles[rootFiles.length - 1]);
			const firstNestedIndex = relativePaths.indexOf(nestedFiles[0]);

			assert(
				lastRootIndex < firstNestedIndex,
				`Expected root files to come before nested files. ` +
					`Last root file "${rootFiles[rootFiles.length - 1]}" at index ${lastRootIndex}, ` +
					`first nested "${nestedFiles[0]}" at index ${firstNestedIndex}`,
			);
		});
	});
});

describe("Runtime order randomization (test mode)", () => {
	const originalEnv = process.env.FLUID_BUILD_TEST_RANDOM_ORDER;

	afterEach(() => {
		// Restore original env var
		if (originalEnv === undefined) {
			delete process.env.FLUID_BUILD_TEST_RANDOM_ORDER;
		} else {
			process.env.FLUID_BUILD_TEST_RANDOM_ORDER = originalEnv;
		}
	});

	it("globFn randomizes results when FLUID_BUILD_TEST_RANDOM_ORDER=true", async () => {
		process.env.FLUID_BUILD_TEST_RANDOM_ORDER = "true";

		// Run multiple times to verify randomization
		const results: string[][] = [];
		for (let i = 0; i < 10; i++) {
			const matches = await globFn("*.ts", { cwd: globTestDataPath, nodir: true });
			results.push(matches);
		}

		// At least some runs should have different orderings
		// (Very unlikely all 10 random shuffles produce the same order)
		const uniqueOrderings = new Set(results.map((r) => JSON.stringify(r)));
		assert(
			uniqueOrderings.size > 1,
			"Expected different orderings across runs, but all were identical",
		);

		// All runs should have the same files (just different order)
		const sorted = results.map((r) => [...r].sort());
		const firstSorted = JSON.stringify(sorted[0]);
		for (const s of sorted) {
			assert.equal(JSON.stringify(s), firstSorted, "All runs should return same files");
		}
	});

	it("globWithGitignore randomizes results when FLUID_BUILD_TEST_RANDOM_ORDER=true", async () => {
		process.env.FLUID_BUILD_TEST_RANDOM_ORDER = "true";

		// Run multiple times to verify randomization
		const results: string[][] = [];
		for (let i = 0; i < 10; i++) {
			const matches = await globWithGitignore(["*.ts"], {
				cwd: globTestDataPath,
				gitignore: false,
			});
			results.push(matches);
		}

		// At least some runs should have different orderings
		const uniqueOrderings = new Set(results.map((r) => JSON.stringify(r)));
		assert(
			uniqueOrderings.size > 1,
			"Expected different orderings across runs, but all were identical",
		);

		// All runs should have the same files (just different order)
		const sorted = results.map((r) => [...r].sort());
		const firstSorted = JSON.stringify(sorted[0]);
		for (const s of sorted) {
			assert.equal(JSON.stringify(s), firstSorted, "All runs should return same files");
		}
	});

	it("globFn does NOT randomize when FLUID_BUILD_TEST_RANDOM_ORDER is not set", async () => {
		delete process.env.FLUID_BUILD_TEST_RANDOM_ORDER;

		// Run multiple times
		const results: string[][] = [];
		for (let i = 0; i < 5; i++) {
			const matches = await globFn("*.ts", { cwd: globTestDataPath, nodir: true });
			results.push(matches);
		}

		// All runs should have identical ordering
		const uniqueOrderings = new Set(results.map((r) => JSON.stringify(r)));
		assert.equal(uniqueOrderings.size, 1, "Expected consistent ordering without test mode");
	});
});
