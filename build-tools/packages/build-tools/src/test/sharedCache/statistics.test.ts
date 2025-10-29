/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";
import { SharedCacheManager } from "../../fluidBuild/sharedCache/sharedCacheManager.js";
import {
	loadStatistics,
	saveStatistics,
	updateCacheSizeStats,
} from "../../fluidBuild/sharedCache/statistics.js";
import type {
	CacheKeyInputs,
	SharedCacheOptions,
	TaskOutputs,
} from "../../fluidBuild/sharedCache/types.js";

function createCacheKeyInputs(overrides: Partial<CacheKeyInputs> = {}): CacheKeyInputs {
	return {
		packageName: "@test/package",
		taskName: "compile",
		executable: "tsc",
		command: "tsc --build",
		inputHashes: [{ path: "src/index.ts", hash: "abc123" }],
		cacheSchemaVersion: 1,
		nodeVersion: process.version,
		arch: process.arch,
		platform: process.platform,
		lockfileHash: "lockfile123",
		...overrides,
	};
}

async function createTaskOutputs(
	outputDir: string,
	fileSpecs: Array<{ name: string; size: number }>,
): Promise<TaskOutputs> {
	const files: Array<{ sourcePath: string; relativePath: string; hash?: string }> = [];

	for (const spec of fileSpecs) {
		const filePath = join(outputDir, spec.name);
		const content = Buffer.alloc(spec.size, "x");
		await writeFile(filePath, content);
		files.push({
			sourcePath: filePath,
			relativePath: spec.name,
			hash: `hash-${spec.name}`,
		});
	}

	return {
		files,
		stdout: "",
		stderr: "",
		exitCode: 0,
		executionTimeMs: 100,
	};
}

describe("Cache Statistics", () => {
	let tempDir: string;
	let cacheDir: string;

	beforeEach(async () => {
		const uniqueId = `stats-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
		tempDir = join(tmpdir(), "fluid-build-cache-stats", uniqueId);
		cacheDir = join(tempDir, "cache");
		await mkdir(tempDir, { recursive: true });
		await mkdir(cacheDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("Statistics Persistence", () => {
		it("should persist statistics after storing cache entries", async () => {
			const options: SharedCacheOptions = {
				cacheDir,
				repoRoot: tempDir,
				globalKeyComponents: {
					cacheSchemaVersion: 1,
					nodeVersion: process.version,
					arch: process.arch,
					platform: process.platform,
					lockfileHash: "test-lockfile",
				},
				skipCacheWrite: false,
				verifyIntegrity: false,
			};
			const sharedCache = new SharedCacheManager(options);

			// Store a cache entry
			const keyInputs = createCacheKeyInputs();
			const outputDir = join(tempDir, "outputs");
			await mkdir(outputDir, { recursive: true });
			const outputs = await createTaskOutputs(outputDir, [{ name: "index.js", size: 1024 }]);

			await sharedCache.store(keyInputs, outputs, outputDir);

			// Note: persistStatistics is now called automatically in store()

			// Load statistics from disk
			const loadedStats = await loadStatistics(cacheDir);

			// Verify statistics were persisted
			assert.strictEqual(loadedStats.totalEntries, 1, "Should have 1 entry");
			assert.strictEqual(loadedStats.totalSize, 1024, "Should have 1024 bytes");
		});

		it("should load existing statistics on initialization", async () => {
			// Create statistics file manually
			const statsPath = join(cacheDir, "statistics.json");
			const initialStats = {
				totalEntries: 5,
				totalSize: 10240,
				hitCount: 3,
				missCount: 2,
				avgRestoreTime: 10.5,
				avgStoreTime: 15.3,
			};
			await writeFile(statsPath, JSON.stringify(initialStats, null, 2));

			// Create cache manager
			const options: SharedCacheOptions = {
				cacheDir,
				repoRoot: tempDir,
				globalKeyComponents: {
					cacheSchemaVersion: 1,
					nodeVersion: process.version,
					arch: process.arch,
					platform: process.platform,
					lockfileHash: "test-lockfile",
				},
				skipCacheWrite: false,
				verifyIntegrity: false,
			};
			const sharedCache = new SharedCacheManager(options);

			// Trigger initialization by doing a lookup
			await sharedCache.lookup(createCacheKeyInputs());

			// Get statistics
			const stats = sharedCache.getStatistics();

			// Verify loaded statistics (totalEntries and totalSize should be loaded)
			assert.strictEqual(stats.totalEntries, 5, "Should load totalEntries from disk");
			assert.strictEqual(stats.totalSize, 10240, "Should load totalSize from disk");
		});

		it("should update statistics file after each store operation", async () => {
			const options: SharedCacheOptions = {
				cacheDir,
				repoRoot: tempDir,
				globalKeyComponents: {
					cacheSchemaVersion: 1,
					nodeVersion: process.version,
					arch: process.arch,
					platform: process.platform,
					lockfileHash: "test-lockfile",
				},
				skipCacheWrite: false,
				verifyIntegrity: false,
			};
			const sharedCache = new SharedCacheManager(options);

			// Store first entry
			const outputDir1 = join(tempDir, "outputs1");
			await mkdir(outputDir1, { recursive: true });
			const outputs1 = await createTaskOutputs(outputDir1, [{ name: "file1.js", size: 1024 }]);
			await sharedCache.store(
				createCacheKeyInputs({ taskName: "task1" }),
				outputs1,
				outputDir1,
			);
			await sharedCache.persistStatistics();

			// Store second entry
			const outputDir2 = join(tempDir, "outputs2");
			await mkdir(outputDir2, { recursive: true });
			const outputs2 = await createTaskOutputs(outputDir2, [{ name: "file2.js", size: 2048 }]);
			await sharedCache.store(
				createCacheKeyInputs({ taskName: "task2" }),
				outputs2,
				outputDir2,
			);
			await sharedCache.persistStatistics();

			// Load statistics from disk
			const loadedStats = await loadStatistics(cacheDir);

			// Verify accumulated statistics
			assert.strictEqual(loadedStats.totalEntries, 2, "Should have 2 entries");
			assert.strictEqual(loadedStats.totalSize, 3072, "Should have 3072 bytes total");
		});
	});

	describe("updateCacheSizeStats", () => {
		it("should recalculate statistics by scanning cache directory", async () => {
			const options: SharedCacheOptions = {
				cacheDir,
				repoRoot: tempDir,
				globalKeyComponents: {
					cacheSchemaVersion: 1,
					nodeVersion: process.version,
					arch: process.arch,
					platform: process.platform,
					lockfileHash: "test-lockfile",
				},
				skipCacheWrite: false,
				verifyIntegrity: false,
			};
			const sharedCache = new SharedCacheManager(options);

			// Store some entries
			const outputDir1 = join(tempDir, "outputs1");
			await mkdir(outputDir1, { recursive: true });
			const outputs1 = await createTaskOutputs(outputDir1, [{ name: "file1.js", size: 1024 }]);
			await sharedCache.store(
				createCacheKeyInputs({ taskName: "task1" }),
				outputs1,
				outputDir1,
			);

			const outputDir2 = join(tempDir, "outputs2");
			await mkdir(outputDir2, { recursive: true });
			const outputs2 = await createTaskOutputs(outputDir2, [{ name: "file2.js", size: 2048 }]);
			await sharedCache.store(
				createCacheKeyInputs({ taskName: "task2" }),
				outputs2,
				outputDir2,
			);

			// Manually corrupt statistics
			const corruptStats = {
				totalEntries: 999,
				totalSize: 999999,
				hitCount: 0,
				missCount: 0,
				avgRestoreTime: 0,
				avgStoreTime: 0,
			};

			// Recalculate by scanning directory
			await updateCacheSizeStats(cacheDir, corruptStats);

			// Verify statistics were corrected
			assert.strictEqual(corruptStats.totalEntries, 2, "Should find 2 entries");
			assert.strictEqual(corruptStats.totalSize, 3072, "Should calculate correct total size");
		});
	});

	describe("saveStatistics and loadStatistics", () => {
		it("should round-trip statistics correctly", async () => {
			const originalStats = {
				totalEntries: 10,
				totalSize: 20480,
				hitCount: 7,
				missCount: 3,
				avgRestoreTime: 12.5,
				avgStoreTime: 18.3,
			};

			await saveStatistics(cacheDir, originalStats);
			const loadedStats = await loadStatistics(cacheDir);

			assert.deepStrictEqual(loadedStats, originalStats);
		});

		it("should return default statistics if file does not exist", async () => {
			const stats = await loadStatistics(cacheDir);

			assert.strictEqual(stats.totalEntries, 0);
			assert.strictEqual(stats.totalSize, 0);
			assert.strictEqual(stats.hitCount, 0);
			assert.strictEqual(stats.missCount, 0);
			assert.strictEqual(stats.avgRestoreTime, 0);
			assert.strictEqual(stats.avgStoreTime, 0);
		});

		it("should handle corrupted statistics file gracefully", async () => {
			const statsPath = join(cacheDir, "statistics.json");
			await writeFile(statsPath, "{ invalid json }");

			const stats = await loadStatistics(cacheDir);

			// Should return defaults on corruption
			assert.strictEqual(stats.totalEntries, 0);
			assert.strictEqual(stats.totalSize, 0);
		});
	});
});
