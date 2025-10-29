/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import * as path from "node:path";
import registerDebug from "debug";
import {
	cacheEntryExists,
	getCacheEntryPath,
	initializeCacheDirectory,
} from "./cacheDirectory.js";
import { computeCacheKey } from "./cacheKey.js";
import { formatValidationMessage, validateCacheConfiguration } from "./configValidation.js";
import {
	copyFileWithDirs,
	hashFilesWithSize,
	verifyFilesIntegrity,
} from "./fileOperations.js";
import { createManifest, readManifest, updateManifestAccessTime } from "./manifest.js";
import { loadStatistics, saveStatistics } from "./statistics.js";
import type {
	CacheEntry,
	CacheKeyInputs,
	CacheStatistics,
	GlobalCacheKeyComponents,
	RestoreResult,
	SharedCacheOptions,
	TaskOutputs,
} from "./types.js";

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
			timeSavedMs: 0,
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
	 * Get the global cache key components.
	 *
	 * These are the components that apply to all tasks and are computed once at startup.
	 *
	 * @returns The global cache key components
	 */
	getGlobalKeyComponents(): GlobalCacheKeyComponents {
		return this.options.globalKeyComponents;
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
			const manifestPath = path.join(entryPath, "manifest.json");
			const manifest = await readManifest(manifestPath);

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

			// Verify global cache key components match
			// We only restore caches when all global components are identical
			if (
				manifest.cacheSchemaVersion !== this.options.globalKeyComponents.cacheSchemaVersion
			) {
				const elapsed = Date.now() - startTime;
				traceLookup(
					`MISS: Cache schema version mismatch for ${shortKey} (cached: ${manifest.cacheSchemaVersion}, current: ${this.options.globalKeyComponents.cacheSchemaVersion}) (${elapsed}ms)`,
				);
				this.statistics.missCount++;
				traceStats(
					`Cache stats: ${this.statistics.hitCount} hits, ${this.statistics.missCount} misses`,
				);
				return undefined;
			}

			if (manifest.nodeVersion !== this.options.globalKeyComponents.nodeVersion) {
				const elapsed = Date.now() - startTime;
				traceLookup(
					`MISS: Node version mismatch for ${shortKey} (cached: ${manifest.nodeVersion}, current: ${this.options.globalKeyComponents.nodeVersion}) (${elapsed}ms)`,
				);
				this.statistics.missCount++;
				traceStats(
					`Cache stats: ${this.statistics.hitCount} hits, ${this.statistics.missCount} misses`,
				);
				return undefined;
			}

			if (manifest.arch !== this.options.globalKeyComponents.arch) {
				const elapsed = Date.now() - startTime;
				traceLookup(
					`MISS: Architecture mismatch for ${shortKey} (cached: ${manifest.arch}, current: ${this.options.globalKeyComponents.arch}) (${elapsed}ms)`,
				);
				this.statistics.missCount++;
				traceStats(
					`Cache stats: ${this.statistics.hitCount} hits, ${this.statistics.missCount} misses`,
				);
				return undefined;
			}

			if (manifest.platform !== this.options.globalKeyComponents.platform) {
				const elapsed = Date.now() - startTime;
				traceLookup(
					`MISS: Platform mismatch for ${shortKey} (cached: ${manifest.platform}, current: ${this.options.globalKeyComponents.platform}) (${elapsed}ms)`,
				);
				this.statistics.missCount++;
				traceStats(
					`Cache stats: ${this.statistics.hitCount} hits, ${this.statistics.missCount} misses`,
				);
				return undefined;
			}

			if (manifest.lockfileHash !== this.options.globalKeyComponents.lockfileHash) {
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

			if (manifest.nodeEnv !== this.options.globalKeyComponents.nodeEnv) {
				const elapsed = Date.now() - startTime;
				traceLookup(
					`MISS: NODE_ENV mismatch for ${shortKey} (cached: ${manifest.nodeEnv ?? "undefined"}, current: ${this.options.globalKeyComponents.nodeEnv ?? "undefined"}) (${elapsed}ms)`,
				);
				this.statistics.missCount++;
				traceStats(
					`Cache stats: ${this.statistics.hitCount} hits, ${this.statistics.missCount} misses`,
				);
				return undefined;
			}

			if (
				JSON.stringify(manifest.cacheBustVars) !==
				JSON.stringify(this.options.globalKeyComponents.cacheBustVars)
			) {
				const elapsed = Date.now() - startTime;
				traceLookup(`MISS: Cache bust variables mismatch for ${shortKey} (${elapsed}ms)`);
				this.statistics.missCount++;
				traceStats(
					`Cache stats: ${this.statistics.hitCount} hits, ${this.statistics.missCount} misses`,
				);
				return undefined;
			}

			// Update access time for LRU tracking
			await updateManifestAccessTime(manifestPath);

			// Cache hit!
			const elapsed = Date.now() - startTime;
			this.statistics.hitCount++;
			this.statistics.timeSavedMs += manifest.executionTimeMs;
			traceLookup(
				`HIT: Found valid cache entry ${shortKey} with ${manifest.outputFiles.length} files (${elapsed}ms)`,
			);
			traceStats(
				`Cache stats: ${this.statistics.hitCount} hits, ${this.statistics.missCount} misses, ${this.statistics.timeSavedMs}ms saved`,
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
			// Only warn on unexpected errors (I/O errors, etc.), not normal cache misses
			// Note: Normal misses are handled above and return early - we only get here on exceptions
			console.warn(
				`Warning: Cache lookup failed due to unexpected error: ${error instanceof Error ? error.message : String(error)}`,
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
			console.warn(`${inputs.packageName}: cache write skipped (--skip-cache-write enabled)`);
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
				cacheSchemaVersion: this.options.globalKeyComponents.cacheSchemaVersion,
				nodeVersion: this.options.globalKeyComponents.nodeVersion,
				arch: this.options.globalKeyComponents.arch,
				platform: this.options.globalKeyComponents.platform,
				lockfileHash: this.options.globalKeyComponents.lockfileHash,
				nodeEnv: this.options.globalKeyComponents.nodeEnv,
				cacheBustVars: this.options.globalKeyComponents.cacheBustVars,
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
			const manifestPath = path.join(entryPath, "manifest.json");
			await writeManifest(manifestPath, manifest);

			// Update statistics
			const storeTime = Date.now() - storeStartTime;
			const entrySize = outputFilesWithHashes.reduce((sum, f) => sum + f.size, 0);

			this.statistics.totalEntries++;
			this.statistics.totalSize += entrySize;

			// Update average store time
			const previousStores = this.statistics.totalEntries - 1;
			if (previousStores === 0) {
				this.statistics.avgStoreTime = storeTime;
			} else {
				this.statistics.avgStoreTime =
					(this.statistics.avgStoreTime * previousStores + storeTime) /
					this.statistics.totalEntries;
			}

			traceStore(
				`Stored cache entry ${shortKey} successfully (${(entrySize / 1024).toFixed(2)} KB, ${storeTime}ms total)`,
			);
			traceStats(
				`Cache stats: ${this.statistics.totalEntries} entries, ${(this.statistics.totalSize / 1024 / 1024).toFixed(2)} MB total`,
			);

			// Persist statistics to disk
			await this.persistStatistics();
		} catch (error) {
			// Graceful degradation: log error but don't fail the build
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorCode = (error as NodeJS.ErrnoException).code;

			// Provide more specific error messages
			let reason = errorMessage;
			if (errorCode === "ENOSPC") {
				reason = "disk full - no space left on device";
			} else if (errorCode === "EACCES" || errorCode === "EPERM") {
				reason = `permission denied accessing cache directory`;
			} else if (errorCode === "ENOENT") {
				reason = "cache directory not found or output file missing";
			} else if (errorMessage.includes("EISDIR")) {
				reason = "attempting to write to a directory instead of a file";
			}

			traceError(`Failed to store cache entry: ${error}`);
			console.warn(`${inputs.packageName}: warning: cache write failed - ${reason}`);
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
						isUnexpectedFailure: true,
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
				isUnexpectedFailure: true,
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

	/**
	 * Display cache statistics to console.
	 *
	 * Shows current statistics including hit/miss counts, cache size,
	 * and average operation times.
	 */
	async displayStatistics(): Promise<void> {
		await this.initialize();

		const hitRate =
			this.statistics.hitCount + this.statistics.missCount > 0
				? (
						(this.statistics.hitCount /
							(this.statistics.hitCount + this.statistics.missCount)) *
						100
					).toFixed(1)
				: "0.0";

		console.log("\nCache Statistics:");
		console.log(`  Total Entries: ${this.statistics.totalEntries}`);
		console.log(`  Total Size: ${(this.statistics.totalSize / 1024 / 1024).toFixed(2)} MB`);
		console.log(`  Hit Count: ${this.statistics.hitCount} (${hitRate}% hit rate)`);
		console.log(`  Miss Count: ${this.statistics.missCount}`);
		console.log(`  Average Restore Time: ${this.statistics.avgRestoreTime.toFixed(1)}ms`);
		console.log(`  Average Store Time: ${this.statistics.avgStoreTime.toFixed(1)}ms`);

		if (this.statistics.lastPruned) {
			const prunedDate = new Date(this.statistics.lastPruned).toLocaleString();
			console.log(`  Last Pruned: ${prunedDate}`);
		}

		console.log("");
	}

	/**
	 * Clean all cache entries.
	 *
	 * Removes all cached data but preserves the cache directory structure.
	 * Statistics are reset to zero.
	 *
	 * @returns Promise that resolves when cleaning is complete
	 */
	async cleanCache(): Promise<void> {
		await this.initialize();

		const { rm } = await import("node:fs/promises");
		const { getCacheEntriesDirectory } = await import("./cacheDirectory.js");

		const entriesDir = getCacheEntriesDirectory(this.options.cacheDir);

		console.log("\nCleaning cache...");
		console.log(`  Removing all entries from: ${entriesDir}`);

		try {
			// Remove all entries
			await rm(entriesDir, { recursive: true, force: true });

			// Recreate entries directory
			const { mkdir } = await import("node:fs/promises");
			await mkdir(entriesDir, { recursive: true });

			// Reset statistics
			this.statistics.totalEntries = 0;
			this.statistics.totalSize = 0;

			// Save updated statistics
			await this.persistStatistics();

			console.log("  ✓ Cache cleaned successfully");
		} catch (error) {
			console.error(
				`Error cleaning cache: ${error instanceof Error ? error.message : String(error)}`,
			);
			throw error;
		}
	}

	/**
	 * Prune old cache entries based on LRU policy.
	 *
	 * Removes least recently used entries until the cache is under the
	 * specified size limit or age threshold.
	 *
	 * @param maxSizeMB - Maximum cache size in megabytes (default: 5000 MB = 5 GB)
	 * @param maxAgeDays - Maximum age of entries in days (default: 30 days)
	 * @returns Number of entries pruned
	 */
	async pruneCache(maxSizeMB: number = 5000, maxAgeDays: number = 30): Promise<number> {
		await this.initialize();

		const { readdir, stat, rm } = await import("node:fs/promises");
		const { getCacheEntriesDirectory } = await import("./cacheDirectory.js");
		const { updateCacheSizeStats } = await import("./statistics.js");

		const entriesDir = getCacheEntriesDirectory(this.options.cacheDir);
		const maxSizeBytes = maxSizeMB * 1024 * 1024;
		const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
		const now = Date.now();

		console.log("\nPruning cache...");
		console.log(`  Max size: ${maxSizeMB} MB`);
		console.log(`  Max age: ${maxAgeDays} days`);

		try {
			// Get all cache entries with their access times
			const entries = await readdir(entriesDir, { withFileTypes: true });
			const entryInfos: Array<{ name: string; accessTime: number; size: number }> = [];

			for (const entry of entries) {
				if (!entry.isDirectory()) continue;

				const entryPath = path.join(entriesDir, entry.name);
				const manifestPath = path.join(entryPath, "manifest.json");

				try {
					await stat(manifestPath);
					const outputsDir = path.join(entryPath, "outputs");

					// Read manifest to get access time
					const { readManifest } = await import("./manifest.js");
					const manifest = await readManifest(entryPath);

					if (!manifest) continue;

					// Calculate entry size
					let entrySize = 0;
					try {
						const outputEntries = await readdir(outputsDir, { recursive: true });
						for (const outputFile of outputEntries) {
							const filePath = path.join(outputsDir, outputFile);
							try {
								const fileStat = await stat(filePath);
								if (fileStat.isFile()) {
									entrySize += fileStat.size;
								}
							} catch {
								// Skip files that can't be accessed
							}
						}
					} catch {
						// Skip if outputs directory doesn't exist
					}

					entryInfos.push({
						name: entry.name,
						accessTime: new Date(manifest.lastAccessedAt).getTime(),
						size: entrySize,
					});
				} catch {
					// Skip entries with missing or invalid manifests
				}
			}

			// Sort by access time (oldest first)
			entryInfos.sort((a, b) => a.accessTime - b.accessTime);

			let pruned = 0;
			let currentSize = entryInfos.reduce((sum, e) => sum + e.size, 0);

			// Prune entries that are too old or exceed size limit
			for (const entry of entryInfos) {
				const age = now - entry.accessTime;
				const shouldPruneAge = age > maxAgeMs;
				const shouldPruneSize = currentSize > maxSizeBytes;

				if (shouldPruneAge || shouldPruneSize) {
					const entryPath = path.join(entriesDir, entry.name);
					await rm(entryPath, { recursive: true, force: true });
					pruned++;
					currentSize -= entry.size;

					if (shouldPruneAge) {
						console.log(
							`  Pruned old entry: ${entry.name.substring(0, 12)}... (${(age / 1000 / 60 / 60 / 24).toFixed(1)} days old)`,
						);
					}
				}

				// Stop if we're under the size limit
				if (currentSize <= maxSizeBytes) {
					break;
				}
			}

			// Update statistics
			await updateCacheSizeStats(this.options.cacheDir, this.statistics);
			this.statistics.lastPruned = new Date().toISOString();
			await this.persistStatistics();

			console.log(`  ✓ Pruned ${pruned} entries`);
			console.log(
				`  ✓ Cache size after pruning: ${(this.statistics.totalSize / 1024 / 1024).toFixed(2)} MB`,
			);

			return pruned;
		} catch (error) {
			console.error(
				`Error pruning cache: ${error instanceof Error ? error.message : String(error)}`,
			);
			throw error;
		}
	}

	/**
	 * Verify integrity of all cache entries.
	 *
	 * Checks that all cached files exist and have correct hashes.
	 * Reports any corrupted entries.
	 *
	 * @param fix - If true, remove corrupted entries (default: false)
	 * @returns Object containing verification results
	 */
	async verifyCache(fix: boolean = false): Promise<{
		total: number;
		valid: number;
		corrupted: number;
		fixed: number;
	}> {
		await this.initialize();

		const { readdir, rm } = await import("node:fs/promises");
		const { getCacheEntriesDirectory } = await import("./cacheDirectory.js");
		const { updateCacheSizeStats } = await import("./statistics.js");

		const entriesDir = getCacheEntriesDirectory(this.options.cacheDir);

		console.log("\nVerifying cache integrity...");

		let total = 0;
		let valid = 0;
		let corrupted = 0;
		let fixed = 0;

		try {
			const entries = await readdir(entriesDir, { withFileTypes: true });

			for (const entry of entries) {
				if (!entry.isDirectory()) continue;

				total++;
				const entryPath = path.join(entriesDir, entry.name);

				try {
					// Read manifest
					const { readManifest } = await import("./manifest.js");
					const manifest = await readManifest(entryPath);

					if (!manifest) {
						console.log(`  ✗ ${entry.name.substring(0, 12)}... - Invalid manifest`);
						corrupted++;
						if (fix) {
							await rm(entryPath, { recursive: true, force: true });
							fixed++;
						}
						continue;
					}

					// Verify all output files
					const filesToVerify = manifest.outputFiles.map((output) => ({
						path: path.join(entryPath, "outputs", output.path),
						hash: output.hash,
					}));

					const verification = await verifyFilesIntegrity(filesToVerify);

					if (verification.success) {
						valid++;
					} else {
						console.log(
							`  ✗ ${entry.name.substring(0, 12)}... - ${verification.failedFiles.length} file(s) corrupted`,
						);
						corrupted++;
						if (fix) {
							await rm(entryPath, { recursive: true, force: true });
							fixed++;
						}
					}
				} catch (error) {
					console.log(
						`  ✗ ${entry.name.substring(0, 12)}... - Error: ${error instanceof Error ? error.message : String(error)}`,
					);
					corrupted++;
					if (fix) {
						try {
							await rm(entryPath, { recursive: true, force: true });
							fixed++;
						} catch {
							// Ignore errors when removing corrupted entries
						}
					}
				}
			}

			// Update statistics if we fixed corrupted entries
			if (fixed > 0) {
				await updateCacheSizeStats(this.options.cacheDir, this.statistics);
				await this.persistStatistics();
			}

			console.log(`\nVerification complete:`);
			console.log(`  Total entries: ${total}`);
			console.log(`  Valid: ${valid}`);
			console.log(`  Corrupted: ${corrupted}`);
			if (fix) {
				console.log(`  Fixed: ${fixed}`);
			}

			return { total, valid, corrupted, fixed };
		} catch (error) {
			console.error(
				`Error verifying cache: ${error instanceof Error ? error.message : String(error)}`,
			);
			throw error;
		}
	}
}
