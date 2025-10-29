/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";
import { existsSync } from "node:fs";
import registerDebug from "debug";
import type {
	CacheEntry,
	CacheKeyInputs,
	CacheStatistics,
	RestoreResult,
	SharedCacheOptions,
	TaskOutputs,
} from "./types.js";
import { computeCacheKey } from "./cacheKey.js";
import {
	cacheEntryExists,
	getCacheEntryPath,
	initializeCacheDirectory,
} from "./cacheDirectory.js";
import { createManifest, readManifest, updateManifestAccessTime } from "./manifest.js";
import {
	copyFileWithDirs,
	hashFilesWithSize,
	verifyFilesIntegrity,
} from "./fileOperations.js";
import { loadStatistics, saveStatistics } from "./statistics.js";
import { validateCacheConfiguration, formatValidationMessage } from "./configValidation.js";

// Debug traces for cache operations
const traceInit = registerDebug("fluid-build:cache:init");
const traceLookup = registerDebug("fluid-build:cache:lookup");
const traceStore = registerDebug("fluid-build:cache:store");
const traceRestore = registerDebug("fluid-build:cache:restore");
const traceStats = registerDebug("fluid-build:cache:stats");
const traceError = registerDebug("fluid-build:cache:error");

/**
 * Main orchestrator for shared cache operations.
 *
 * The SharedCacheManager provides:
 * - Cache lookup: Check if a task's outputs are already cached
 * - Cache storage: Store a task's outputs for future reuse
 * - Cache restoration: Restore cached outputs to the workspace
 *
 * It handles all the complexity of cache keys, manifests, file operations,
 * and error recovery, providing a simple interface for the build system.
 */
export class SharedCacheManager {
	private readonly options: SharedCacheOptions;
	private readonly statistics: CacheStatistics;
	private initialized: boolean = false;

	/**
	 * Create a new SharedCacheManager.
	 *
	 * @param options - Configuration options for the cache
	 */
	constructor(options: SharedCacheOptions) {
		this.options = options;
		// Statistics will be loaded from disk during initialization
		this.statistics = {
			totalEntries: 0,
			totalSize: 0,
			hitCount: 0,
			missCount: 0,
			avgRestoreTime: 0,
			avgStoreTime: 0,
		};
	}

	/**
	 * Initialize the cache directory structure.
	 *
	 * This is called lazily on first use to avoid overhead if cache is not accessed.
	 * Also loads persisted statistics from disk.
	 *
	 * @returns Promise that resolves when initialization is complete
	 * @throws Error if cache directory cannot be initialized
	 */
	private async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		traceInit(`Initializing cache at ${this.options.cacheDir}`);
		const startTime = Date.now();

		try {
			// Validate cache configuration before initializing
			const validation = validateCacheConfiguration(this.options.cacheDir, true);
			if (!validation.valid) {
				traceError(`Cache validation failed: ${validation.error}`);
				throw new Error(validation.error);
			}

			// Log any warnings from validation
			if (validation.warnings && validation.warnings.length > 0) {
				const warningMsg = formatValidationMessage(validation);
				console.warn(warningMsg);
				traceInit(`Validation warnings: ${validation.warnings.join(", ")}`);
			}

			await initializeCacheDirectory(this.options.cacheDir);
			traceInit(`Cache directory structure initialized`);

			// Load persisted statistics
			const persistedStats = await loadStatistics(this.options.cacheDir);
			// Merge with current in-memory stats (preserving session-specific counts)
			this.statistics.totalEntries = persistedStats.totalEntries;
			this.statistics.totalSize = persistedStats.totalSize;
			this.statistics.lastPruned = persistedStats.lastPruned;

			const elapsed = Date.now() - startTime;
			traceInit(
				`Cache initialized in ${elapsed}ms (${this.statistics.totalEntries} entries, ${(this.statistics.totalSize / 1024 / 1024).toFixed(2)} MB)`,
			);
			traceStats(
				`Stats: ${this.statistics.totalEntries} entries, ${(this.statistics.totalSize / 1024 / 1024).toFixed(2)} MB`,
			);

			this.initialized = true;
		} catch (error) {
			// Graceful degradation: log error but don't fail the build
			traceError(`Failed to initialize cache: ${error}`);
			console.warn(
				`Warning: Failed to initialize cache directory: ${error instanceof Error ? error.message : String(error)}`,
			);
			throw error;
		}
	}

	/**
	 * Look up a cache entry for the given inputs.
	 *
	 * This checks if a task with identical inputs has been executed before
	 * and returns the cache entry if found.
	 *
	 * @param inputs - The task inputs to look up
	 * @returns The cache entry if found and valid, undefined otherwise
	 */
	async lookup(inputs: CacheKeyInputs): Promise<CacheEntry | undefined> {
		const startTime = Date.now();
		try {
			await this.initialize();

			// Compute cache key from inputs
			const cacheKey = computeCacheKey(inputs);
			const shortKey = cacheKey.substring(0, 12);
			traceLookup(`Looking up cache entry for key ${shortKey}... (task: ${inputs.taskName})`);

			// Check if entry exists
			const entryPath = getCacheEntryPath(this.options.cacheDir, cacheKey);
			if (!(await cacheEntryExists(this.options.cacheDir, cacheKey))) {
				const elapsed = Date.now() - startTime;
				traceLookup(`MISS: Entry not found for ${shortKey} (${elapsed}ms)`);
				this.statistics.missCount++;
				traceStats(
					`Cache stats: ${this.statistics.hitCount} hits, ${this.statistics.missCount} misses`,
				);
				return undefined;
			}

			// Read and validate manifest
			const manifest = await readManifest(entryPath);

			// Check if manifest exists and is valid
			if (!manifest) {
				const elapsed = Date.now() - startTime;
				traceLookup(`MISS: Invalid manifest for ${shortKey} (${elapsed}ms)`);
				this.statistics.missCount++;
				traceStats(
					`Cache stats: ${this.statistics.hitCount} hits, ${this.statistics.missCount} misses`,
				);
				return undefined;
			}

			// Verify platform and Node.js version compatibility
			// We only restore caches from the same platform and Node version
			if (manifest.platform !== process.platform) {
				const elapsed = Date.now() - startTime;
				traceLookup(
					`MISS: Platform mismatch for ${shortKey} (cached: ${manifest.platform}, current: ${process.platform}) (${elapsed}ms)`,
				);
				this.statistics.missCount++;
				traceStats(
					`Cache stats: ${this.statistics.hitCount} hits, ${this.statistics.missCount} misses`,
				);
				return undefined;
			}

			if (manifest.nodeVersion !== process.version) {
				const elapsed = Date.now() - startTime;
				traceLookup(
					`MISS: Node version mismatch for ${shortKey} (cached: ${manifest.nodeVersion}, current: ${process.version}) (${elapsed}ms)`,
				);
				this.statistics.missCount++;
				traceStats(
					`Cache stats: ${this.statistics.hitCount} hits, ${this.statistics.missCount} misses`,
				);
				return undefined;
			}

			// Verify lockfile matches
			if (manifest.lockfileHash !== this.options.lockfileHash) {
				const elapsed = Date.now() - startTime;
				traceLookup(
					`MISS: Lockfile hash mismatch for ${shortKey} (dependencies changed) (${elapsed}ms)`,
				);
				this.statistics.missCount++;
				traceStats(
					`Cache stats: ${this.statistics.hitCount} hits, ${this.statistics.missCount} misses`,
				);
				return undefined;
			}

			// Update access time for LRU tracking
			await updateManifestAccessTime(entryPath);

			// Cache hit!
			const elapsed = Date.now() - startTime;
			this.statistics.hitCount++;
			traceLookup(
				`HIT: Found valid cache entry ${shortKey} with ${manifest.outputFiles.length} files (${elapsed}ms)`,
			);
			traceStats(
				`Cache stats: ${this.statistics.hitCount} hits, ${this.statistics.missCount} misses`,
			);

			return {
				cacheKey,
				entryPath,
				manifest,
			};
		} catch (error) {
			// Graceful degradation: treat lookup errors as cache misses
			const elapsed = Date.now() - startTime;
			traceError(`Cache lookup error: ${error} (${elapsed}ms)`);
			console.warn(
				`Warning: Cache lookup failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			this.statistics.missCount++;
			return undefined;
		}
	}

	/**
	 * Store task outputs in the cache.
	 *
	 * This creates a new cache entry with the task's outputs and metadata,
	 * making it available for future cache hits.
	 *
	 * @param inputs - The task inputs (for computing cache key)
	 * @param outputs - The task outputs to store
	 * @param packageRoot - Absolute path to the package root (currently unused, reserved for future use)
	 * @returns Promise that resolves when storage is complete
	 */
	async store(
		inputs: CacheKeyInputs,
		outputs: TaskOutputs,
		packageRoot: string, // eslint-disable-line @typescript-eslint/no-unused-vars
	): Promise<void> {
		// Skip if cache writes are disabled
		if (this.options.skipCacheWrite) {
			traceStore(`Skipping cache write (disabled by --skip-cache-write)`);
			return;
		}

		// Only cache successful executions
		if (outputs.exitCode !== 0) {
			traceStore(`Skipping cache write for failed task (exit code ${outputs.exitCode})`);
			return;
		}

		const storeStartTime = Date.now();

		try {
			await this.initialize();

			// Compute cache key
			const cacheKey = computeCacheKey(inputs);
			const shortKey = cacheKey.substring(0, 12);
			traceStore(
				`Storing cache entry ${shortKey} for ${inputs.packageName}#${inputs.taskName} (${outputs.files.length} files)`,
			);

			// Get cache entry path
			const entryPath = getCacheEntryPath(this.options.cacheDir, cacheKey);

			// Check if entry already exists (avoid redundant work)
			if (existsSync(entryPath)) {
				traceStore(`Cache entry ${shortKey} already exists, skipping store`);
				return;
			}

			// Hash all output files for integrity verification
			const hashStartTime = Date.now();
			const outputFilesWithHashes = await hashFilesWithSize(
				outputs.files.map((f) => f.sourcePath),
			);
			const hashTime = Date.now() - hashStartTime;
			traceStore(`Hashed ${outputs.files.length} output files in ${hashTime}ms`);

			// Create manifest
			const manifest = createManifest({
				cacheKey,
				packageName: inputs.packageName,
				taskName: inputs.taskName,
				executable: inputs.executable,
				command: inputs.command,
				exitCode: 0,
				executionTimeMs: outputs.executionTimeMs,
				nodeVersion: process.version,
				platform: process.platform,
				lockfileHash: this.options.lockfileHash,
				inputFiles: inputs.inputHashes.map((input) => ({
					path: input.path,
					hash: input.hash,
				})),
				outputFiles: outputFilesWithHashes.map((output, index) => ({
					path: outputs.files[index].relativePath,
					hash: output.hash,
					size: output.size,
				})),
				stdout: outputs.stdout,
				stderr: outputs.stderr,
			});

			// Copy output files to cache directory
			const copyStartTime = Date.now();
			for (const file of outputs.files) {
				const sourcePath = file.sourcePath;
				const destPath = path.join(entryPath, "outputs", file.relativePath);
				await copyFileWithDirs(sourcePath, destPath);
			}
			const copyTime = Date.now() - copyStartTime;
			traceStore(`Copied ${outputs.files.length} files to cache in ${copyTime}ms`);

			// Write manifest (atomically)
			const { writeManifest } = await import("./manifest.js");
			await writeManifest(entryPath, manifest);

			// Update statistics
			const storeTime = Date.now() - storeStartTime;
			const entrySize = outputFilesWithHashes.reduce((sum, f) => sum + f.size, 0);

			this.statistics.totalEntries++;
			this.statistics.totalSize += entrySize;
			this.statistics.avgStoreTime =
				(this.statistics.avgStoreTime *
					(this.statistics.hitCount + this.statistics.missCount - 1) +
					storeTime) /
				(this.statistics.hitCount + this.statistics.missCount);

			traceStore(
				`Stored cache entry ${shortKey} successfully (${(entrySize / 1024).toFixed(2)} KB, ${storeTime}ms total)`,
			);
			traceStats(
				`Cache stats: ${this.statistics.totalEntries} entries, ${(this.statistics.totalSize / 1024 / 1024).toFixed(2)} MB total`,
			);
		} catch (error) {
			// Graceful degradation: log error but don't fail the build
			traceError(`Failed to store cache entry: ${error}`);
			console.warn(
				`Warning: Failed to store cache entry: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Restore cached outputs to the workspace.
	 *
	 * This copies files from a cache entry back to the workspace,
	 * optionally verifying file integrity.
	 *
	 * @param entry - The cache entry to restore
	 * @param packageRoot - Absolute path to the package root
	 * @returns Result of the restoration operation
	 */
	async restore(entry: CacheEntry, packageRoot: string): Promise<RestoreResult> {
		const restoreStartTime = Date.now();
		const shortKey = entry.cacheKey.substring(0, 12);

		traceRestore(
			`Restoring cache entry ${shortKey} (${entry.manifest.outputFiles.length} files)`,
		);

		try {
			// Verify source files exist and have correct hashes (if integrity check enabled)
			if (this.options.verifyIntegrity) {
				const verifyStartTime = Date.now();
				const filesToVerify = entry.manifest.outputFiles.map((output) => ({
					path: path.join(entry.entryPath, "outputs", output.path),
					hash: output.hash,
				}));

				const verification = await verifyFilesIntegrity(filesToVerify);
				const verifyTime = Date.now() - verifyStartTime;

				if (!verification.success) {
					traceRestore(
						`Integrity verification failed for ${shortKey}: ${verification.failedFiles.join(", ")} (${verifyTime}ms)`,
					);
					traceError(
						`Cache integrity check failed for ${shortKey}: ${verification.failedFiles.length} files failed`,
					);
					return {
						success: false,
						filesRestored: 0,
						bytesRestored: 0,
						restoreTimeMs: Date.now() - restoreStartTime,
						error: `Integrity verification failed: ${verification.failedFiles.join(", ")}`,
					};
				}
				traceRestore(
					`Integrity verified for ${entry.manifest.outputFiles.length} files (${verifyTime}ms)`,
				);
			}

			// Copy files from cache to workspace
			const copyStartTime = Date.now();
			for (const output of entry.manifest.outputFiles) {
				const sourcePath = path.join(entry.entryPath, "outputs", output.path);
				const destPath = path.join(packageRoot, output.path);
				await copyFileWithDirs(sourcePath, destPath);
			}
			const copyTime = Date.now() - copyStartTime;
			traceRestore(`Copied ${entry.manifest.outputFiles.length} files in ${copyTime}ms`);

			// Calculate statistics
			const totalBytes = entry.manifest.outputFiles.reduce((sum, f) => sum + f.size, 0);
			const restoreTime = Date.now() - restoreStartTime;

			// Update average restore time
			this.statistics.avgRestoreTime =
				(this.statistics.avgRestoreTime * (this.statistics.hitCount - 1) + restoreTime) /
				this.statistics.hitCount;

			traceRestore(
				`Successfully restored cache entry ${shortKey} (${(totalBytes / 1024).toFixed(2)} KB, ${restoreTime}ms total)`,
			);
			traceStats(`Avg restore time: ${this.statistics.avgRestoreTime.toFixed(1)}ms`);

			return {
				success: true,
				filesRestored: entry.manifest.outputFiles.length,
				bytesRestored: totalBytes,
				restoreTimeMs: restoreTime,
				stdout: entry.manifest.stdout,
				stderr: entry.manifest.stderr,
			};
		} catch (error) {
			traceError(`Failed to restore cache entry ${shortKey}: ${error}`);
			return {
				success: false,
				filesRestored: 0,
				bytesRestored: 0,
				restoreTimeMs: Date.now() - restoreStartTime,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Get current cache statistics.
	 *
	 * @returns Current statistics snapshot
	 */
	getStatistics(): Readonly<CacheStatistics> {
		return { ...this.statistics };
	}

	/**
	 * Reset statistics counters.
	 *
	 * Useful for measuring cache performance over specific build runs.
	 */
	resetStatistics(): void {
		this.statistics.hitCount = 0;
		this.statistics.missCount = 0;
		this.statistics.avgRestoreTime = 0;
		this.statistics.avgStoreTime = 0;
	}

	/**
	 * Persist current statistics to disk.
	 *
	 * This should be called periodically and at the end of a build
	 * to ensure statistics are not lost.
	 *
	 * @returns Promise that resolves when save is complete
	 */
	async persistStatistics(): Promise<void> {
		if (!this.initialized) {
			return;
		}

		await saveStatistics(this.options.cacheDir, this.statistics);
	}
}
