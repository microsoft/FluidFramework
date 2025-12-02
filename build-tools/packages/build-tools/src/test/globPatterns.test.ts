/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach } from "mocha";
import { globFn, globWithGitignore, toPosixPath } from "../fluidBuild/tasks/taskUtils";
import { testDataPath } from "./init";

const globTestDataPath = path.resolve(testDataPath, "glob");

/**
 * Tests for globFn wrapper function in taskUtils.ts.
 *
 * These tests ensure consistent behavior when migrating from the `glob` library to `tinyglobby`.
 * The globFn wrapper is used by:
 * - CopyfilesTask (with options: nodir, dot, follow, ignore)
 * - TypeValidationTask (with option: nodir)
 * - GoodFence (with option: nodir)
 *
 * Key option mappings for migration (glob → tinyglobby):
 * - nodir: true → onlyFiles: true (default in tinyglobby)
 * - follow: true → followSymbolicLinks: true
 * - ignore: "pattern" → ignore: ["pattern"] (array required)
 * - cwd, absolute, dot → same names
 */
describe("globFn (glob wrapper for task utilities)", () => {
	describe("basic file matching", () => {
		it("matches .ts files with wildcard", async () => {
			const pattern = path.join(globTestDataPath, "*.ts");
			const results = await globFn(pattern);
			const filenames = results.map((f) => path.basename(f));
			assert(filenames.includes("file1.ts"));
			assert(filenames.includes("file2.ts"));
			assert(!filenames.includes("file3.mjs"));
		});

		it("matches all files with *", async () => {
			const pattern = path.join(globTestDataPath, "*");
			const results = await globFn(pattern, { nodir: true });
			const filenames = results.map((f) => path.basename(f));
			assert(filenames.includes("file1.ts"));
			assert(filenames.includes("file2.ts"));
			assert(filenames.includes("file3.mjs"));
		});

		it("matches files in nested directories with **", async () => {
			const pattern = path.join(globTestDataPath, "**/*.ts");
			const results = await globFn(pattern, { nodir: true });
			assert(results.length >= 3, `Expected at least 3 results, got ${results.length}`);
			const hasNested = results.some((f) => f.includes("nested"));
			assert(hasNested, "Should include files in nested directories");
		});

		it("returns empty array for no matches", async () => {
			const pattern = path.join(globTestDataPath, "*.nonexistent");
			const results = await globFn(pattern);
			assert(results.length === 0);
		});
	});

	describe("nodir option", () => {
		it("excludes directories when nodir is true", async () => {
			const pattern = path.join(globTestDataPath, "*");
			const results = await globFn(pattern, { nodir: true });
			const hasDir = results.some((f) => f.endsWith("nested") || f.endsWith("dotfiles"));
			assert(!hasDir, "Should not include directories");
		});

		it("includes directories when nodir is false", async () => {
			const pattern = path.join(globTestDataPath, "*");
			const results = await globFn(pattern, { nodir: false });
			const hasDir = results.some((f) => f.endsWith("nested") || f.endsWith("dotfiles"));
			assert(hasDir, "Should include directories");
		});
	});

	describe("dot option (hidden files)", () => {
		it("excludes dot files by default", async () => {
			const pattern = path.join(globTestDataPath, "dotfiles/*");
			const results = await globFn(pattern, { nodir: true });
			const filenames = results.map((f) => path.basename(f));
			assert(filenames.includes("visible.ts"));
			assert(!filenames.includes(".hidden"));
			assert(!filenames.includes(".config"));
		});

		it("includes dot files when dot is true", async () => {
			const pattern = path.join(globTestDataPath, "dotfiles/*");
			const results = await globFn(pattern, { nodir: true, dot: true });
			const filenames = results.map((f) => path.basename(f));
			assert(filenames.includes("visible.ts"));
			assert(filenames.includes(".hidden"));
			assert(filenames.includes(".config"));
		});
	});

	describe("ignore option", () => {
		it("ignores files matching ignore pattern (string)", async () => {
			const pattern = path.join(globTestDataPath, "ignore-test/*");
			const ignorePattern = path.join(globTestDataPath, "ignore-test/exclude.ts");
			const results = await globFn(pattern, { nodir: true, ignore: ignorePattern });
			const filenames = results.map((f) => path.basename(f));
			assert(filenames.includes("include.ts"));
			assert(filenames.includes("other.mjs"));
			assert(!filenames.includes("exclude.ts"));
		});

		it("ignores files matching ignore pattern (array)", async () => {
			const pattern = path.join(globTestDataPath, "ignore-test/*");
			const ignorePatterns = [
				path.join(globTestDataPath, "ignore-test/exclude.ts"),
				path.join(globTestDataPath, "ignore-test/other.mjs"),
			];
			const results = await globFn(pattern, { nodir: true, ignore: ignorePatterns });
			const filenames = results.map((f) => path.basename(f));
			assert(filenames.includes("include.ts"));
			assert(!filenames.includes("exclude.ts"));
			assert(!filenames.includes("other.mjs"));
		});
	});

	describe("cwd option", () => {
		it("uses cwd as base for relative patterns", async () => {
			const results = await globFn("*.ts", { cwd: globTestDataPath, nodir: true });
			const filenames = results.map((f) => path.basename(f));
			assert(filenames.includes("file1.ts"));
			assert(filenames.includes("file2.ts"));
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
		// On Windows, should convert; on Unix, should be unchanged
		assert(!result.includes("\\") || path.sep !== "\\");
	});

	it("preserves forward slashes", () => {
		const input = "src/utils/file.ts";
		const result = toPosixPath(input);
		assert(result === input);
	});
});

/**
 * Tests for globWithGitignore function in taskUtils.ts.
 *
 * This function is used by LeafWithGlobInputOutputDoneFileTask.getFiles() to get input/output files
 * for tasks with gitignore support. These tests verify the behavior that must be preserved when
 * migrating from globby to tinyglobby.
 *
 * When migrating to tinyglobby, gitignore support must be implemented manually
 * (e.g., using `git ls-files --others --ignored --exclude-standard` to get ignored files).
 */
describe("globWithGitignore (LeafTask file enumeration)", () => {
	const gitIgnoredDir = path.join(globTestDataPath, "gitignored");
	const gitIgnoredFile = path.join(gitIgnoredDir, "shouldBeIgnored.ts");

	beforeEach(async () => {
		// Create gitignored directory and file for testing
		await mkdir(gitIgnoredDir, { recursive: true });
		await writeFile(
			gitIgnoredFile,
			"/*!\n * Copyright (c) Microsoft Corporation and contributors. All rights reserved.\n * Licensed under the MIT License.\n */\n\n// This file should be ignored by gitignore\n",
		);
	});

	afterEach(async () => {
		// Clean up gitignored directory
		await rm(gitIgnoredDir, { recursive: true, force: true });
	});

	it("includes gitignored files when gitignore option is false", async () => {
		const results = await globWithGitignore(["**/*.ts"], {
			cwd: globTestDataPath,
			gitignore: false,
		});
		const filenames = results.map((f) => path.basename(f));
		// Without gitignore filtering, should include the ignored file
		assert(filenames.includes("shouldBeIgnored.ts"), "Should include gitignored files");
		assert(filenames.includes("tracked.ts"), "Should include tracked files");
	});

	it("excludes gitignored files when gitignore option is true", async () => {
		const results = await globWithGitignore(["**/*.ts"], {
			cwd: globTestDataPath,
			gitignore: true,
		});
		const filenames = results.map((f) => path.basename(f));
		// With gitignore filtering, should exclude files matching .gitignore patterns
		assert(!filenames.includes("shouldBeIgnored.ts"), "Should exclude gitignored files");
		assert(filenames.includes("tracked.ts"), "Should include tracked files");
	});

	it("excludes gitignored files by default", async () => {
		const results = await globWithGitignore(["**/*.ts"], {
			cwd: globTestDataPath,
		});
		const filenames = results.map((f) => path.basename(f));
		// Default behavior should exclude gitignored files
		assert(
			!filenames.includes("shouldBeIgnored.ts"),
			"Should exclude gitignored files by default",
		);
		assert(filenames.includes("tracked.ts"), "Should include tracked files");
	});

	it("excludes files matching gitignore patterns", async () => {
		const results = await globWithGitignore(["**/*"], {
			cwd: globTestDataPath,
			gitignore: true,
		});
		const filenames = results.map((f) => path.basename(f));
		// The .gitignore contains "*.ignored" pattern
		assert(
			!filenames.includes("test.ignored"),
			"Should exclude files matching *.ignored pattern",
		);
	});

	it("excludes directories matching gitignore patterns", async () => {
		const results = await globWithGitignore(["**/*.ts"], {
			cwd: globTestDataPath,
			gitignore: true,
		});
		// The .gitignore contains "gitignored/" pattern
		const hasGitIgnoredDir = results.some((f) => f.includes("gitignored/"));
		assert(!hasGitIgnoredDir, "Should exclude files in gitignored directories");
	});

	it("returns absolute paths", async () => {
		const results = await globWithGitignore(["*.ts"], {
			cwd: globTestDataPath,
			gitignore: false,
		});
		for (const result of results) {
			assert(path.isAbsolute(result), `Expected absolute path: ${result}`);
		}
	});

	it("handles multiple glob patterns", async () => {
		const results = await globWithGitignore(["*.ts", "*.mjs"], {
			cwd: globTestDataPath,
			gitignore: false,
		});
		const filenames = results.map((f) => path.basename(f));
		assert(filenames.includes("file1.ts"), "Should include .ts files");
		assert(filenames.includes("file3.mjs"), "Should include .mjs files");
	});
});
