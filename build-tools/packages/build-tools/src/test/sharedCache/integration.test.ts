/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, beforeEach, afterEach } from "mocha";
import type {
	CacheKeyInputs,
	SharedCacheOptions,
	TaskOutputs,
} from "../../fluidBuild/sharedCache/types.js";
import { SharedCacheManager } from "../../fluidBuild/sharedCache/sharedCacheManager.js";
import { computeCacheKey } from "../../fluidBuild/sharedCache/cacheKey.js";
import { hashFile } from "../../fluidBuild/sharedCache/fileOperations.js";

/**
 * Helper to create CacheKeyInputs with all required fields
 */
function createCacheKeyInputs(overrides: Partial<CacheKeyInputs>): CacheKeyInputs {
	return {
		packageName: "test-package",
		taskName: "tsc",
		executable: "tsc",
		command: "tsc --build",
		inputHashes: [{ path: "src/index.ts", hash: "content-hash-1" }],
		nodeVersion: process.version,
		platform: process.platform,
		lockfileHash: "test-lockfile-hash",
		...overrides,
	};
}

/**
 * Helper to create TaskOutputs with all required fields
 */
function createTaskOutputs(
	filesMap: Record<string, string>,
	workspaceDir: string,
	stdout = "",
	stderr = "",
): TaskOutputs {
	// Create the files on disk
	for (const [relPath, content] of Object.entries(filesMap)) {
		const fullPath = join(workspaceDir, relPath);
		const dir = join(fullPath, "..");
		mkdirSync(dir, { recursive: true });
		writeFileSync(fullPath, content, "utf8");
	}

	return {
		files: Object.keys(filesMap).map((relPath) => ({
			sourcePath: join(workspaceDir, relPath),
			relativePath: relPath,
		})),
		stdout,
		stderr,
		exitCode: 0,
		executionTimeMs: 100,
	};
}

describe("SharedCache Integration Tests", () => {
	let testDir: string;
	let cacheDir: string;
	let workspaceDir: string;
	let cacheManager: SharedCacheManager;

	beforeEach(async () => {
		// Create temporary directories
		testDir = mkdtempSync(join(tmpdir(), "cache-integration-test-"));
		cacheDir = join(testDir, "cache");
		workspaceDir = join(testDir, "workspace");
		mkdirSync(workspaceDir, { recursive: true });

		// Initialize cache manager
		const options: SharedCacheOptions = {
			cacheDir,
			repoRoot: testDir,
			lockfileHash: "test-lockfile-hash",
			skipCacheWrite: false,
			verifyIntegrity: false,
		};
		cacheManager = new SharedCacheManager(options);
	});

	afterEach(() => {
		// Clean up test directory
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe("End-to-end cache hit/miss", () => {
		it("should miss on first lookup, then hit after storage", async () => {
			const inputs = createCacheKeyInputs({});

			// First lookup should miss
			const result1 = await cacheManager.lookup(inputs);
			assert.equal(result1, undefined, "First lookup should miss");

			// Store outputs
			const outputs = createTaskOutputs(
				{
					"dist/index.js": "console.log('hello');",
					"dist/index.d.ts": "export {};",
				},
				workspaceDir,
				"TypeScript compiled successfully",
			);

			await cacheManager.store(inputs, outputs, false);

			// Second lookup should hit
			const result2 = await cacheManager.lookup(inputs);
			assert.notEqual(result2, undefined, "Second lookup should hit");
			assert.equal(result2?.cacheKey, computeCacheKey(inputs));
			assert.equal(result2?.manifest.taskName, "tsc");
			assert.equal(result2?.manifest.packageName, "test-package");
		});

		it("should miss when input files change", async () => {
			const inputs1 = createCacheKeyInputs({
				inputHashes: [{ path: "src/index.ts", hash: "content-hash-1" }],
			});

			// Store with first input
			const outputs = createTaskOutputs({ "dist/index.js": "content1" }, workspaceDir);
			await cacheManager.store(inputs1, outputs, false);

			// Lookup with changed input should miss
			const inputs2 = createCacheKeyInputs({
				inputHashes: [{ path: "src/index.ts", hash: "content-hash-2" }], // Changed hash
			});
			const result = await cacheManager.lookup(inputs2);
			assert.equal(result, undefined, "Should miss when input changes");
		});

		it("should miss when Node version changes", async () => {
			const inputs1 = createCacheKeyInputs({ nodeVersion: "v20.0.0" });

			// Store with Node v20
			const outputs = createTaskOutputs({ "dist/index.js": "content1" }, workspaceDir);
			await cacheManager.store(inputs1, outputs, false);

			// Lookup with Node v22 should miss
			const inputs2 = createCacheKeyInputs({ nodeVersion: "v22.0.0" });
			const result = await cacheManager.lookup(inputs2);
			assert.equal(result, undefined, "Should miss when Node version changes");
		});

		it("should miss when platform changes", async () => {
			const inputs1 = createCacheKeyInputs({ platform: "linux" });

			// Store with linux
			const outputs = createTaskOutputs({ "dist/index.js": "content1" }, workspaceDir);
			await cacheManager.store(inputs1, outputs, false);

			// Lookup with win32 should miss
			const inputs2 = createCacheKeyInputs({ platform: "win32" });
			const result = await cacheManager.lookup(inputs2);
			assert.equal(result, undefined, "Should miss when platform changes");
		});

		it("should miss when lockfile changes", async () => {
			const inputs1 = createCacheKeyInputs({ lockfileHash: "lockfile-hash-1" });

			// Store with lockfile-1
			const outputs = createTaskOutputs({ "dist/index.js": "content1" }, workspaceDir);
			await cacheManager.store(inputs1, outputs, false);

			// Lookup with lockfile-2 should miss
			const inputs2 = createCacheKeyInputs({ lockfileHash: "lockfile-hash-2" });
			const result = await cacheManager.lookup(inputs2);
			assert.equal(result, undefined, "Should miss when lockfile changes");
		});
	});

	describe("Multi-file restoration", () => {
		it("should restore all output files correctly", async () => {
			const inputs = createCacheKeyInputs({
				inputHashes: [
					{ path: "src/index.ts", hash: "hash1" },
					{ path: "src/utils.ts", hash: "hash2" },
				],
			});

			// Create and store multiple output files
			const fileContents = {
				"dist/index.js": "export * from './utils';",
				"dist/index.d.ts": "export * from './utils';",
				"dist/utils.js": "export function hello() {}",
				"dist/utils.d.ts": "export function hello(): void;",
				".tsbuildinfo": JSON.stringify({ version: "5.0.0" }),
			};

			const outputs = createTaskOutputs(
				fileContents,
				workspaceDir,
				"Compiled 2 files",
			);

			await cacheManager.store(inputs, outputs, false);

			// Delete all output files to simulate clean workspace
			rmSync(join(workspaceDir, "dist"), { recursive: true, force: true });
			rmSync(join(workspaceDir, ".tsbuildinfo"), { force: true });

			// Verify files are deleted
			assert.equal(existsSync(join(workspaceDir, "dist/index.js")), false);
			assert.equal(existsSync(join(workspaceDir, ".tsbuildinfo")), false);

			// Restore from cache
			const lookupResult = await cacheManager.lookup(inputs);
			assert.notEqual(lookupResult, undefined, "Cache should hit");

			const restoreResult = await cacheManager.restore(
				lookupResult!.cacheKey,
				lookupResult!.cacheEntryPath,
				lookupResult!.manifest,
				workspaceDir,
			);

			assert.equal(restoreResult.success, true, "Restore should succeed");
			assert.equal(restoreResult.filesRestored, 5, "Should restore all 5 files");

			// Verify all files were restored with correct content
			for (const [relPath, expectedContent] of Object.entries(fileContents)) {
				const fullPath = join(workspaceDir, relPath);
				assert.equal(existsSync(fullPath), true, `${relPath} should exist`);
				const actualContent = readFileSync(fullPath, "utf8");
				assert.equal(
					actualContent,
					expectedContent,
					`${relPath} content should match`,
				);
			}

			// Verify stdout was captured
			assert.equal(restoreResult.stdout, "Compiled 2 files");
		});

		it("should restore nested directory structures", async () => {
			const inputs = createCacheKeyInputs({});

			// Create nested output structure
			const fileContents = {
				"dist/components/Button.js": "export const Button = () => {}",
				"dist/components/Button.d.ts": "export const Button: () => void;",
				"dist/utils/helpers.js": "export const add = (a, b) => a + b;",
				"dist/utils/helpers.d.ts": "export const add: (a: number, b: number) => number;",
			};

			const outputs = createTaskOutputs(fileContents, workspaceDir);
			await cacheManager.store(inputs, outputs, false);

			// Delete output directory
			rmSync(join(workspaceDir, "dist"), { recursive: true, force: true });

			// Restore
			const lookupResult = await cacheManager.lookup(inputs);
			assert.notEqual(lookupResult, undefined);

			const restoreResult = await cacheManager.restore(
				lookupResult!.cacheKey,
				lookupResult!.cacheEntryPath,
				lookupResult!.manifest,
				workspaceDir,
			);

			assert.equal(restoreResult.success, true);
			assert.equal(restoreResult.filesRestored, 4);

			// Verify nested structure preserved
			assert.equal(existsSync(join(workspaceDir, "dist/components/Button.js")), true);
			assert.equal(existsSync(join(workspaceDir, "dist/utils/helpers.js")), true);
		});
	});

	describe("Cache invalidation", () => {
		it("should invalidate when task name changes", async () => {
			const inputs1 = createCacheKeyInputs({ taskName: "tsc" });
			const outputs = createTaskOutputs({ "dist/index.js": "content" }, workspaceDir);
			await cacheManager.store(inputs1, outputs, false);

			// Lookup with different task name should miss
			const inputs2 = createCacheKeyInputs({ taskName: "build" });
			const result = await cacheManager.lookup(inputs2);
			assert.equal(result, undefined, "Different task name should miss");
		});

		it("should invalidate when package name changes", async () => {
			const inputs1 = createCacheKeyInputs({ packageName: "pkg-a" });
			const outputs = createTaskOutputs({ "dist/index.js": "content" }, workspaceDir);
			await cacheManager.store(inputs1, outputs, false);

			// Lookup with different package name should miss
			const inputs2 = createCacheKeyInputs({ packageName: "pkg-b" });
			const result = await cacheManager.lookup(inputs2);
			assert.equal(result, undefined, "Different package name should miss");
		});

		it("should invalidate when input file is added", async () => {
			const inputs1 = createCacheKeyInputs({
				inputHashes: [{ path: "src/index.ts", hash: "hash1" }],
			});

			const outputs = createTaskOutputs({ "dist/index.js": "content" }, workspaceDir);
			await cacheManager.store(inputs1, outputs, false);

			// Lookup with additional input file should miss
			const inputs2 = createCacheKeyInputs({
				inputHashes: [
					{ path: "src/index.ts", hash: "hash1" },
					{ path: "src/new-file.ts", hash: "hash2" }, // New file
				],
			});
			const result = await cacheManager.lookup(inputs2);
			assert.equal(result, undefined, "Additional input file should miss");
		});

		it("should invalidate when input file is removed", async () => {
			const inputs1 = createCacheKeyInputs({
				inputHashes: [
					{ path: "src/index.ts", hash: "hash1" },
					{ path: "src/utils.ts", hash: "hash2" },
				],
			});

			const outputs = createTaskOutputs({ "dist/index.js": "content" }, workspaceDir);
			await cacheManager.store(inputs1, outputs, false);

			// Lookup with one input file removed should miss
			const inputs2 = createCacheKeyInputs({
				inputHashes: [{ path: "src/index.ts", hash: "hash1" }], // Removed utils.ts
			});
			const result = await cacheManager.lookup(inputs2);
			assert.equal(result, undefined, "Removed input file should miss");
		});
	});

	describe("Integrity verification", () => {
		it("should verify file integrity when enabled", async () => {
			// Create cache manager with integrity verification
			const verifyOptions: SharedCacheOptions = {
				cacheDir,
				repoRoot: testDir,
				lockfileHash: "test-lockfile-hash",
				skipCacheWrite: false,
				verifyIntegrity: true,
			};
			const verifyCacheManager = new SharedCacheManager(verifyOptions);

			const inputs = createCacheKeyInputs({});

			// Store file
			const originalContent = "console.log('original');";
			const outputs = createTaskOutputs({ "dist/index.js": originalContent }, workspaceDir);
			await verifyCacheManager.store(inputs, outputs, false);

			// Delete output file
			rmSync(join(workspaceDir, "dist/index.js"), { force: true });

			// Restore with verification should succeed
			const lookupResult = await verifyCacheManager.lookup(inputs);
			assert.notEqual(lookupResult, undefined);

			const restoreResult = await verifyCacheManager.restore(
				lookupResult!.cacheKey,
				lookupResult!.cacheEntryPath,
				lookupResult!.manifest,
				workspaceDir,
			);

			assert.equal(restoreResult.success, true);
			assert.equal(restoreResult.filesRestored, 1);

			// Verify content matches
			const restoredContent = readFileSync(
				join(workspaceDir, "dist/index.js"),
				"utf8",
			);
			assert.equal(restoredContent, originalContent);
		});

		it("should detect corrupted cache files during verification", async () => {
			const verifyOptions: SharedCacheOptions = {
				cacheDir,
				repoRoot: testDir,
				lockfileHash: "test-lockfile-hash",
				skipCacheWrite: false,
				verifyIntegrity: true,
			};
			const verifyCacheManager = new SharedCacheManager(verifyOptions);

			const inputs = createCacheKeyInputs({});

			// Store file
			const outputs = createTaskOutputs(
				{ "dist/index.js": "original content" },
				workspaceDir,
			);
			await verifyCacheManager.store(inputs, outputs, false);

			// Get cache entry location and corrupt the cached file
			const lookupResult = await verifyCacheManager.lookup(inputs);
			assert.notEqual(lookupResult, undefined);

			const cachedFilePath = join(
				lookupResult!.cacheEntryPath,
				"files",
				"dist",
				"index.js",
			);
			writeFileSync(cachedFilePath, "corrupted content", "utf8"); // Corrupt file

			// Restore with verification should fail for corrupted file
			const restoreResult = await verifyCacheManager.restore(
				lookupResult!.cacheKey,
				lookupResult!.cacheEntryPath,
				lookupResult!.manifest,
				workspaceDir,
			);

			// Restore should report failure due to integrity mismatch
			assert.equal(restoreResult.success, false, "Should fail with corrupted file");
			assert.ok(
				restoreResult.error?.toLowerCase().includes("integrity") ||
					restoreResult.error?.toLowerCase().includes("verification") ||
					restoreResult.error?.toLowerCase().includes("mismatch"),
				"Error should mention integrity/verification issue",
			);
		});
	});

	describe("TypeScript incremental build integration", () => {
		it("should cache and restore .tsbuildinfo correctly", async () => {
			const inputs = createCacheKeyInputs({});

			// Create .tsbuildinfo with TypeScript incremental build metadata
			const tsbuildinfo = {
				version: "5.0.0",
				program: {
					fileNames: ["src/index.ts"],
					fileInfos: {
						"src/index.ts": {
							version: "1234567890",
							signature: "abcdef1234567890",
						},
					},
				},
			};

			const outputs = createTaskOutputs(
				{
					"dist/index.js": "export {};",
					".tsbuildinfo": JSON.stringify(tsbuildinfo),
				},
				workspaceDir,
				"Compiled successfully",
			);

			await cacheManager.store(inputs, outputs, false);

			// Delete outputs
			rmSync(join(workspaceDir, "dist"), { recursive: true, force: true });
			rmSync(join(workspaceDir, ".tsbuildinfo"), { force: true });

			// Restore
			const lookupResult = await cacheManager.lookup(inputs);
			assert.notEqual(lookupResult, undefined);

			const restoreResult = await cacheManager.restore(
				lookupResult!.cacheKey,
				lookupResult!.cacheEntryPath,
				lookupResult!.manifest,
				workspaceDir,
			);

			assert.equal(restoreResult.success, true);

			// Verify .tsbuildinfo was restored with correct content
			const restoredTsbuildinfo = JSON.parse(
				readFileSync(join(workspaceDir, ".tsbuildinfo"), "utf8"),
			);
			assert.deepEqual(restoredTsbuildinfo, tsbuildinfo);
		});
	});

	describe("skipCacheWrite behavior", () => {
		it("should not write to cache when skipCacheWrite is true", async () => {
			const skipWriteOptions: SharedCacheOptions = {
				cacheDir,
				repoRoot: testDir,
				lockfileHash: "test-lockfile-hash",
				skipCacheWrite: true,
				verifyIntegrity: false,
			};
			const skipWriteCacheManager = new SharedCacheManager(skipWriteOptions);

			const inputs = createCacheKeyInputs({});
			const outputs = createTaskOutputs({ "dist/index.js": "content" }, workspaceDir);

			// Store should not write anything
			await skipWriteCacheManager.store(inputs, outputs, false);

			// Lookup should miss (nothing was written)
			const result = await skipWriteCacheManager.lookup(inputs);
			assert.equal(result, undefined, "Should miss when skipCacheWrite was true");
		});

		it("should not write to cache when task failed", async () => {
			const inputs = createCacheKeyInputs({});
			const outputs = createTaskOutputs({ "dist/index.js": "partial" }, workspaceDir);

			// Store with taskFailed=true should not write
			await cacheManager.store(inputs, outputs, true);

			// Lookup should miss (failed task not cached)
			const result = await cacheManager.lookup(inputs);
			assert.equal(result, undefined, "Should miss when task failed");
		});
	});

	describe("Multi-task build scenario", () => {
		it("should handle multiple tasks in sequence", async () => {
			// Simulate build sequence: tsc -> eslint -> build

			// Task 1: TypeScript compilation
			const tscInputs = createCacheKeyInputs({
				taskName: "tsc",
				executable: "tsc",
				command: "tsc --build",
			});

			const tscOutputs = createTaskOutputs(
				{ "dist/index.js": "export {};" },
				workspaceDir,
				"tsc output",
			);
			await cacheManager.store(tscInputs, tscOutputs, false);

			// Task 2: ESLint (depends on tsc outputs)
			const distHash = await hashFile(join(workspaceDir, "dist/index.js"));
			const eslintInputs = createCacheKeyInputs({
				taskName: "eslint",
				executable: "eslint",
				command: "eslint src/**/*.ts",
				inputHashes: [
					{ path: "src/index.ts", hash: "hash1" },
					{ path: "dist/index.js", hash: distHash },
				],
			});

			const eslintOutputs = createTaskOutputs(
				{ ".eslintcache": "cache data" },
				workspaceDir,
				"eslint output",
			);
			await cacheManager.store(eslintInputs, eslintOutputs, false);

			// Task 3: Build (depends on both)
			const eslintCacheHash = await hashFile(join(workspaceDir, ".eslintcache"));
			const buildInputs = createCacheKeyInputs({
				taskName: "build",
				executable: "webpack",
				command: "webpack --mode production",
				inputHashes: [
					{ path: "dist/index.js", hash: distHash },
					{ path: ".eslintcache", hash: eslintCacheHash },
				],
			});

			const buildOutputs = createTaskOutputs(
				{ "bundle.js": "bundled code" },
				workspaceDir,
				"build output",
			);
			await cacheManager.store(buildInputs, buildOutputs, false);

			// Verify all tasks can be retrieved
			const tscResult = await cacheManager.lookup(tscInputs);
			const eslintResult = await cacheManager.lookup(eslintInputs);
			const buildResult = await cacheManager.lookup(buildInputs);

			assert.notEqual(tscResult, undefined, "tsc task should be cached");
			assert.notEqual(eslintResult, undefined, "eslint task should be cached");
			assert.notEqual(buildResult, undefined, "build task should be cached");
		});
	});
});
