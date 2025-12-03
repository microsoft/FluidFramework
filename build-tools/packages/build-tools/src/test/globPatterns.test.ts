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
 * Tests for globFn wrapper function in taskUtils.ts.
 *
 * The globFn wrapper is used by:
 * - CopyfilesTask (with options: nodir, dot, follow, ignore)
 * - TypeValidationTask (with option: nodir)
 * - GoodFence (with option: nodir)
 */
describe("globFn (glob wrapper for task utilities)", () => {
	describe("basic file matching", () => {
		it("matches .ts files with wildcard", async () => {
			const pattern = path.join(globTestDataPath, "*.ts");
			const results = await globFn(pattern);
			const filenames = results.map((f) => path.basename(f)).sort();
			assert.deepEqual(filenames, ["file1.ts", "file2.ts", "tracked.ts"]);
		});

		it("matches all files with *", async () => {
			const pattern = path.join(globTestDataPath, "*");
			const results = await globFn(pattern, { nodir: true });
			const filenames = results.map((f) => path.basename(f)).sort();
			assert.deepEqual(filenames, ["file1.ts", "file2.ts", "file3.mjs", "tracked.ts"]);
		});

		it("matches files in nested directories with **", async () => {
			const pattern = path.join(globTestDataPath, "**/*.ts");
			const results = await globFn(pattern, { nodir: true });
			const filenames = results.map((f) => path.basename(f)).sort();
			assert.deepEqual(filenames, [
				"exclude.ts",
				"file1.ts",
				"file1.ts",
				"file1.ts",
				"file2.ts",
				"file2.ts",
				"file2.ts",
				"file3.ts",
				"include.ts",
				"tracked.ts",
				"visible.ts",
			]);
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
			const filenames = results.map((f) => path.basename(f)).sort();
			assert.deepEqual(filenames, ["file1.ts", "file2.ts", "file3.mjs", "tracked.ts"]);
		});

		it("includes directories when nodir is false", async () => {
			const pattern = path.join(globTestDataPath, "*");
			const results = await globFn(pattern, { nodir: false });
			const filenames = results.map((f) => path.basename(f)).sort();
			assert.deepEqual(filenames, [
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
			const filenames = results.map((f) => path.basename(f)).sort();
			assert.deepEqual(filenames, ["visible.ts"]);
		});

		it("includes dot files when dot is true", async () => {
			const pattern = path.join(globTestDataPath, "dotfiles/*");
			const results = await globFn(pattern, { nodir: true, dot: true });
			const filenames = results.map((f) => path.basename(f)).sort();
			assert.deepEqual(filenames, [".config", ".hidden", "visible.ts"]);
		});
	});

	describe("ignore option", () => {
		it("ignores files matching ignore pattern (string)", async () => {
			const pattern = path.join(globTestDataPath, "ignore-test/*");
			const ignorePattern = path.join(globTestDataPath, "ignore-test/exclude.ts");
			const results = await globFn(pattern, { nodir: true, ignore: ignorePattern });
			const filenames = results.map((f) => path.basename(f)).sort();
			assert.deepEqual(filenames, ["include.ts", "other.mjs"]);
		});

		it("ignores files matching ignore pattern (array)", async () => {
			const pattern = path.join(globTestDataPath, "ignore-test/*");
			const ignorePatterns = [
				path.join(globTestDataPath, "ignore-test/exclude.ts"),
				path.join(globTestDataPath, "ignore-test/other.mjs"),
			];
			const results = await globFn(pattern, { nodir: true, ignore: ignorePatterns });
			const filenames = results.map((f) => path.basename(f)).sort();
			assert.deepEqual(filenames, ["include.ts"]);
		});
	});

	describe("cwd option", () => {
		it("uses cwd as base for relative patterns", async () => {
			const results = await globFn("*.ts", { cwd: globTestDataPath, nodir: true });
			const filenames = results.map((f) => path.basename(f)).sort();
			assert.deepEqual(filenames, ["file1.ts", "file2.ts", "tracked.ts"]);
		});
	});

	describe("absolute option", () => {
		it("returns absolute paths when absolute is true", async () => {
			const results = await globFn("*.ts", {
				cwd: globTestDataPath,
				nodir: true,
				absolute: true,
			});
			for (const result of results) {
				assert(path.isAbsolute(result), `Expected absolute path: ${result}`);
			}
		});

		it("returns relative paths when absolute is not set", async () => {
			const results = await globFn("*.ts", { cwd: globTestDataPath, nodir: true });
			for (const result of results) {
				assert(!path.isAbsolute(result), `Expected relative path: ${result}`);
			}
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
});

/**
 * Tests for globWithGitignore function in taskUtils.ts.
 *
 * This function is used by LeafWithGlobInputOutputDoneFileTask.getFiles() to get input/output files
 * for tasks with gitignore support.
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
		const filenames = results.map((f) => path.basename(f)).sort();
		assert.deepEqual(filenames, [
			"exclude.ts",
			"file1.ts",
			"file1.ts",
			"file1.ts",
			"file2.ts",
			"file2.ts",
			"file2.ts",
			"file3.ts",
			"include.ts",
			"shouldBeIgnored.ts",
			"tracked.ts",
			"visible.ts",
		]);
	});

	it("excludes gitignored files when gitignore option is true", async () => {
		// Verify test files exist before testing
		assert(existsSync(gitIgnoredFile), "shouldBeIgnored.ts should exist");

		const results = await globWithGitignore(["**/*.ts"], {
			cwd: globTestDataPath,
			gitignore: true,
		});
		const filenames = results.map((f) => path.basename(f)).sort();
		assert.deepEqual(filenames, [
			"exclude.ts",
			"file1.ts",
			"file1.ts",
			"file1.ts",
			"file2.ts",
			"file2.ts",
			"file2.ts",
			"file3.ts",
			"include.ts",
			"tracked.ts",
			"visible.ts",
		]);
	});

	it("excludes gitignored files by default", async () => {
		const results = await globWithGitignore(["**/*.ts"], {
			cwd: globTestDataPath,
		});
		const filenames = results.map((f) => path.basename(f)).sort();
		assert.deepEqual(filenames, [
			"exclude.ts",
			"file1.ts",
			"file1.ts",
			"file1.ts",
			"file2.ts",
			"file2.ts",
			"file2.ts",
			"file3.ts",
			"include.ts",
			"tracked.ts",
			"visible.ts",
		]);
	});

	it("excludes files matching gitignore patterns", async () => {
		// Verify the test file exists before testing
		assert(existsSync(ignoredPatternFile), "test.ignored should exist");

		const results = await globWithGitignore(["*"], {
			cwd: globTestDataPath,
			gitignore: true,
		});
		const filenames = results.map((f) => path.basename(f)).sort();
		// test.ignored should be excluded by *.ignored pattern in .gitignore
		assert.deepEqual(filenames, ["file1.ts", "file2.ts", "file3.mjs", "tracked.ts"]);
	});

	it("includes files matching gitignore patterns when gitignore is false", async () => {
		// Verify the test file exists before testing
		assert(existsSync(ignoredPatternFile), "test.ignored should exist");

		const results = await globWithGitignore(["*"], {
			cwd: globTestDataPath,
			gitignore: false,
		});
		const filenames = results.map((f) => path.basename(f)).sort();
		// test.ignored should be included when gitignore is disabled
		assert.deepEqual(filenames, [
			"file1.ts",
			"file2.ts",
			"file3.mjs",
			"test.ignored",
			"tracked.ts",
		]);
	});

	it("excludes directories matching gitignore patterns", async () => {
		const results = await globWithGitignore(["**/*.ts"], {
			cwd: globTestDataPath,
			gitignore: true,
		});
		const filenames = results.map((f) => path.basename(f)).sort();
		// shouldBeIgnored.ts is in gitignored/ directory which is in .gitignore
		assert.deepEqual(filenames, [
			"exclude.ts",
			"file1.ts",
			"file1.ts",
			"file1.ts",
			"file2.ts",
			"file2.ts",
			"file2.ts",
			"file3.ts",
			"include.ts",
			"tracked.ts",
			"visible.ts",
		]);
	});

	it("returns absolute paths", async () => {
		const results = await globWithGitignore(["*.ts"], {
			cwd: globTestDataPath,
			gitignore: false,
		});
		const filenames = results.map((f) => path.basename(f)).sort();
		assert.deepEqual(filenames, ["file1.ts", "file2.ts", "tracked.ts"]);
		for (const result of results) {
			assert(path.isAbsolute(result), `Expected absolute path: ${result}`);
		}
	});

	it("handles multiple glob patterns", async () => {
		const results = await globWithGitignore(["*.ts", "*.mjs"], {
			cwd: globTestDataPath,
			gitignore: false,
		});
		const filenames = results.map((f) => path.basename(f)).sort();
		assert.deepEqual(filenames, ["file1.ts", "file2.ts", "file3.mjs", "tracked.ts"]);
	});
});
