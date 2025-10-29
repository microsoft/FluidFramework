/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, beforeEach, afterEach } from "mocha";
import { SharedCacheManager } from "../../fluidBuild/sharedCache/sharedCacheManager.js";
import type {
	CacheKeyInputs,
	TaskOutputs,
	SharedCacheOptions,
} from "../../fluidBuild/sharedCache/types.js";

/**
 * Helper to create CacheKeyInputs with all required fields
 */
function createCacheKeyInputs(overrides: Partial<CacheKeyInputs> = {}): CacheKeyInputs {
	return {
		packageName: "@test/package",
		taskName: "compile",
		executable: "tsc",
		command: "tsc --build",
		inputHashes: [{ path: "src/index.ts", hash: "abc123" }],
		nodeVersion: process.version,
		platform: process.platform,
		lockfileHash: "lockfile123",
		...overrides,
	};
}

/**
 * Helper to create TaskOutputs from file specifications
 */
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

describe("Performance Benchmarks", () => {
	let tempDir: string;
	let cacheDir: string;
	let sharedCache: SharedCacheManager;

	beforeEach(async () => {
		// Create unique temp directories for each test
		const uniqueId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
		tempDir = join(tmpdir(), "fluid-build-cache-perf", uniqueId);
		cacheDir = join(tempDir, "cache");
		await mkdir(tempDir, { recursive: true });
		await mkdir(cacheDir, { recursive: true });

		const options: SharedCacheOptions = {
			cacheDir,
			repoRoot: tempDir,
			lockfileHash: "test-lockfile",
			skipCacheWrite: false,
			verifyIntegrity: true,
		};
		sharedCache = new SharedCacheManager(options);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("Cache Lookup Performance", () => {
		it("cache lookup should be < 50ms for cache miss", async () => {
			const keyInputs = createCacheKeyInputs();

			const iterations = 10;
			const times: number[] = [];

			for (let i = 0; i < iterations; i++) {
				const start = performance.now();
				const result = await sharedCache.lookup(keyInputs);
				const duration = performance.now() - start;
				times.push(duration);
				assert.strictEqual(result, undefined, "Should be cache miss");
			}

			const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
			const maxTime = Math.max(...times);

			console.log(
				`  Cache lookup (miss) - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`,
			);

			// P99 should be under 50ms
			const p99 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.99)];
			assert.ok(p99 < 50, `P99 cache lookup time ${p99.toFixed(2)}ms should be < 50ms`);
		});

		it("cache lookup should be < 50ms for cache hit", async () => {
			const keyInputs = createCacheKeyInputs();

			// First, store an entry
			const outputDir = join(tempDir, "outputs");
			await mkdir(outputDir, { recursive: true });
			const outputs = await createTaskOutputs(outputDir, [{ name: "index.js", size: 1024 }]);

			await sharedCache.store(keyInputs, outputs, outputDir);

			// Now measure lookup performance
			const iterations = 10;
			const times: number[] = [];

			for (let i = 0; i < iterations; i++) {
				const start = performance.now();
				const result = await sharedCache.lookup(keyInputs);
				const duration = performance.now() - start;
				times.push(duration);
				assert.ok(result !== undefined, "Should be cache hit");
			}

			const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
			const maxTime = Math.max(...times);

			console.log(
				`  Cache lookup (hit) - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`,
			);

			// P99 should be under 50ms
			const p99 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.99)];
			assert.ok(p99 < 50, `P99 cache lookup time ${p99.toFixed(2)}ms should be < 50ms`);
		});
	});

	describe("Cache Store Performance", () => {
		it("should efficiently store small outputs", async () => {
			const keyInputs = createCacheKeyInputs();
			const outputDir = join(tempDir, "outputs");
			await mkdir(outputDir, { recursive: true });

			// Create 5 small files (1KB each)
			const outputs = await createTaskOutputs(
				outputDir,
				Array.from({ length: 5 }, (_, i) => ({ name: `file${i}.js`, size: 1024 })),
			);

			const start = performance.now();
			await sharedCache.store(keyInputs, outputs, outputDir);
			const duration = performance.now() - start;

			console.log(`  Store 5 small files (5KB total): ${duration.toFixed(2)}ms`);

			// Should be reasonably fast (< 200ms)
			assert.ok(duration < 200, `Store time ${duration.toFixed(2)}ms should be < 200ms`);
		});

		it("should efficiently store medium outputs", async () => {
			const keyInputs = createCacheKeyInputs();
			const outputDir = join(tempDir, "outputs");
			await mkdir(outputDir, { recursive: true });

			// Create 20 medium files (100KB each = 2MB total)
			const outputs = await createTaskOutputs(
				outputDir,
				Array.from({ length: 20 }, (_, i) => ({ name: `file${i}.js`, size: 100 * 1024 })),
			);

			const start = performance.now();
			await sharedCache.store(keyInputs, outputs, outputDir);
			const duration = performance.now() - start;

			console.log(`  Store 20 medium files (2MB total): ${duration.toFixed(2)}ms`);

			// Should complete in reasonable time (< 1000ms)
			assert.ok(duration < 1000, `Store time ${duration.toFixed(2)}ms should be < 1000ms`);
		});
	});

	describe("Cache Restore Performance", () => {
		it("should efficiently restore small outputs", async () => {
			const keyInputs = createCacheKeyInputs();
			const outputDir = join(tempDir, "outputs");
			await mkdir(outputDir, { recursive: true });

			// Create and store 5 small files
			const outputs = await createTaskOutputs(
				outputDir,
				Array.from({ length: 5 }, (_, i) => ({ name: `file${i}.js`, size: 1024 })),
			);

			await sharedCache.store(keyInputs, outputs, outputDir);

			// Remove outputs
			await rm(outputDir, { recursive: true, force: true });
			await mkdir(outputDir, { recursive: true });

			// Measure restore performance
			const entry = await sharedCache.lookup(keyInputs);
			assert.ok(entry !== undefined, "Cache entry should exist");

			const start = performance.now();
			const result = await sharedCache.restore(entry, outputDir);
			const duration = performance.now() - start;

			console.log(`  Restore 5 small files (5KB total): ${duration.toFixed(2)}ms`);

			assert.ok(result.success, "Restore should succeed");
			assert.ok(duration < 200, `Restore time ${duration.toFixed(2)}ms should be < 200ms`);
		});

		it("should efficiently restore medium outputs", async () => {
			const keyInputs = createCacheKeyInputs();
			const outputDir = join(tempDir, "outputs");
			await mkdir(outputDir, { recursive: true });

			// Create and store 20 medium files (2MB total)
			const outputs = await createTaskOutputs(
				outputDir,
				Array.from({ length: 20 }, (_, i) => ({ name: `file${i}.js`, size: 100 * 1024 })),
			);

			await sharedCache.store(keyInputs, outputs, outputDir);

			// Remove outputs
			await rm(outputDir, { recursive: true, force: true });
			await mkdir(outputDir, { recursive: true });

			// Measure restore performance
			const entry = await sharedCache.lookup(keyInputs);
			assert.ok(entry !== undefined, "Cache entry should exist");

			const start = performance.now();
			const result = await sharedCache.restore(entry, outputDir);
			const duration = performance.now() - start;

			console.log(`  Restore 20 medium files (2MB total): ${duration.toFixed(2)}ms`);

			assert.ok(result.success, "Restore should succeed");
			assert.ok(duration < 1000, `Restore time ${duration.toFixed(2)}ms should be < 1000ms`);
		});
	});

	describe("Large File Handling", () => {
		it("should handle large files efficiently with streaming", async () => {
			const keyInputs = createCacheKeyInputs({
				taskName: "webpack",
				executable: "webpack",
				command: "webpack --config webpack.config.js",
			});

			const outputDir = join(tempDir, "outputs");
			await mkdir(outputDir, { recursive: true });

			// Create a 10MB file
			const outputs = await createTaskOutputs(outputDir, [
				{ name: "bundle.js", size: 10 * 1024 * 1024 },
			]);

			// Measure store performance
			const storeStart = performance.now();
			await sharedCache.store(keyInputs, outputs, outputDir);
			const storeDuration = performance.now() - storeStart;

			console.log(`  Store 10MB file: ${storeDuration.toFixed(2)}ms`);

			// Remove outputs
			await rm(outputDir, { recursive: true, force: true });
			await mkdir(outputDir, { recursive: true });

			// Measure restore performance
			const entry = await sharedCache.lookup(keyInputs);
			assert.ok(entry !== undefined, "Cache entry should exist");

			const restoreStart = performance.now();
			const result = await sharedCache.restore(entry, outputDir);
			const restoreDuration = performance.now() - restoreStart;

			console.log(`  Restore 10MB file: ${restoreDuration.toFixed(2)}ms`);

			assert.ok(result.success, "Restore should succeed");

			// Verify content is correct
			const restoredContent = await readFile(join(outputDir, "bundle.js"));
			assert.strictEqual(
				restoredContent.length,
				10 * 1024 * 1024,
				"Restored file should have same size",
			);
		});

		it("should handle many small files efficiently", async () => {
			const keyInputs = createCacheKeyInputs();
			const outputDir = join(tempDir, "outputs");
			await mkdir(outputDir, { recursive: true });

			// Create 100 small files (10KB each = 1MB total)
			const outputs = await createTaskOutputs(
				outputDir,
				Array.from({ length: 100 }, (_, i) => ({ name: `file${i}.js`, size: 10 * 1024 })),
			);

			// Measure store performance
			const storeStart = performance.now();
			await sharedCache.store(keyInputs, outputs, outputDir);
			const storeDuration = performance.now() - storeStart;

			console.log(`  Store 100 files (1MB total): ${storeDuration.toFixed(2)}ms`);

			// Remove outputs
			await rm(outputDir, { recursive: true, force: true });
			await mkdir(outputDir, { recursive: true });

			// Measure restore performance
			const entry = await sharedCache.lookup(keyInputs);
			assert.ok(entry !== undefined, "Cache entry should exist");

			const restoreStart = performance.now();
			const result = await sharedCache.restore(entry, outputDir);
			const restoreDuration = performance.now() - restoreStart;

			console.log(`  Restore 100 files (1MB total): ${restoreDuration.toFixed(2)}ms`);

			assert.ok(result.success, "Restore should succeed");
			assert.strictEqual(result.filesRestored, 100, "Should restore all files");

			// Should be faster than 2 seconds for 100 files
			assert.ok(
				storeDuration < 2000,
				`Store time ${storeDuration.toFixed(2)}ms should be < 2000ms`,
			);
			assert.ok(
				restoreDuration < 2000,
				`Restore time ${restoreDuration.toFixed(2)}ms should be < 2000ms`,
			);
		});
	});

	describe("Cache Hit Rate", () => {
		it("should achieve 100% hit rate for identical inputs", async () => {
			const keyInputs = createCacheKeyInputs();

			const outputDir = join(tempDir, "outputs");
			await mkdir(outputDir, { recursive: true });
			const outputs = await createTaskOutputs(outputDir, [{ name: "index.js", size: 1024 }]);

			// Store once
			await sharedCache.store(keyInputs, outputs, outputDir);

			// Lookup 100 times with identical inputs
			let hits = 0;
			for (let i = 0; i < 100; i++) {
				const result = await sharedCache.lookup(keyInputs);
				if (result !== undefined) {
					hits++;
				}
			}

			const hitRate = (hits / 100) * 100;
			console.log(`  Cache hit rate for identical inputs: ${hitRate.toFixed(1)}%`);

			assert.strictEqual(hitRate, 100, "Hit rate should be 100% for identical inputs");
		});

		it("should miss cache when inputs change", async () => {
			const baseKeyInputs = createCacheKeyInputs();

			const outputDir = join(tempDir, "outputs");
			await mkdir(outputDir, { recursive: true });
			const outputs = await createTaskOutputs(outputDir, [{ name: "index.js", size: 1024 }]);

			// Store with original inputs
			await sharedCache.store(baseKeyInputs, outputs, outputDir);

			// Verify cache hit with same inputs
			let result = await sharedCache.lookup(baseKeyInputs);
			assert.ok(result !== undefined, "Should hit cache with identical inputs");

			// Change input file hash - should miss
			const changedInputs = createCacheKeyInputs({
				inputHashes: [{ path: "src/index.ts", hash: "xyz789" }],
			});
			result = await sharedCache.lookup(changedInputs);
			assert.strictEqual(result, undefined, "Should miss cache when input hash changes");

			// Change command - should miss
			const changedCommand = createCacheKeyInputs({
				command: "tsc --build --incremental",
			});
			result = await sharedCache.lookup(changedCommand);
			assert.strictEqual(result, undefined, "Should miss cache when command changes");
		});
	});

	describe("Storage Efficiency", () => {
		it("storage overhead should be < 2x original file size", async () => {
			const keyInputs = createCacheKeyInputs();

			const outputDir = join(tempDir, "outputs");
			await mkdir(outputDir, { recursive: true });

			// Create 10KB of output
			const outputs = await createTaskOutputs(outputDir, [
				{ name: "index.js", size: 10 * 1024 },
			]);

			await sharedCache.store(keyInputs, outputs, outputDir);

			// Get cache statistics
			const stats = await sharedCache.getStatistics();
			const originalSize = 10 * 1024; // 10KB
			const overhead = stats.totalSize / originalSize;

			console.log(
				`  Storage overhead: ${overhead.toFixed(2)}x (${stats.totalSize} bytes for ${originalSize} bytes)`,
			);

			// Overhead should be reasonable (< 2x due to manifest and metadata)
			assert.ok(
				overhead < 2,
				`Storage overhead ${overhead.toFixed(2)}x should be < 2x original size`,
			);
		});
	});
});
