/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Core type definitions for the shared cache system.
 *
 * The shared cache enables multiple build invocations to share build artifacts,
 * dramatically reducing build times for repeated builds with identical inputs.
 */

/**
 * Inputs used to compute a unique cache key for a task execution.
 *
 * The cache key is a SHA-256 hash of all these inputs, ensuring that
 * identical inputs always produce the same cache key.
 */
export interface CacheKeyInputs {
	/**
	 * Package name (e.g., "@fluidframework/build-tools")
	 */
	packageName: string;

	/**
	 * Task name (e.g., "compile", "build", "lint")
	 */
	taskName: string;

	/**
	 * Executable name (e.g., "tsc", "eslint", "webpack")
	 */
	executable: string;

	/**
	 * Full command line string
	 */
	command: string;

	/**
	 * Hashes of all input files that affect the task output
	 */
	inputHashes: ReadonlyArray<{
		readonly path: string; // Relative to package root
		readonly hash: string; // SHA-256 hash of file contents
	}>;

	/**
	 * Cache schema version for forward/backward compatibility
	 */
	cacheSchemaVersion: number;

	/**
	 * Node.js version (from process.version, e.g., "v20.15.1")
	 *
	 * Different Node versions may produce different outputs, so they
	 * are included in the cache key to prevent cross-version issues.
	 */
	nodeVersion: string;

	/**
	 * CPU architecture (from process.arch, e.g., "x64", "arm64")
	 */
	arch: string;

	/**
	 * Platform identifier (from process.platform, e.g., "linux", "darwin", "win32")
	 *
	 * Platform-specific differences in output (e.g., line endings, path separators)
	 * are handled by including platform in the cache key.
	 */
	platform: string;

	/**
	 * Hash of the lockfile (pnpm-lock.yaml)
	 *
	 * Dependencies affect task output, so lockfile changes invalidate the cache.
	 */
	lockfileHash: string;

	/**
	 * NODE_ENV environment variable (if set)
	 */
	nodeEnv?: string;

	/**
	 * Cache bust variables (FLUID_BUILD_CACHE_BUST*)
	 */
	cacheBustVars?: Record<string, string>;

	/**
	 * Tool version (e.g., TypeScript version for tsc tasks)
	 *
	 * Optional because not all tasks have identifiable tool versions.
	 */
	toolVersion?: string;

	/**
	 * Hashes of configuration files (e.g., tsconfig.json, .eslintrc)
	 *
	 * Configuration changes affect output, so they're included in the cache key.
	 */
	configHashes?: Record<string, string>;
}

/**
 * Metadata stored in a cache entry's manifest.json file.
 *
 * Contains all information needed to validate and restore a cached task execution.
 */
export interface CacheManifest {
	/**
	 * Schema version for forward/backward compatibility
	 */
	version: 1;

	/**
	 * The cache key that identifies this entry
	 */
	cacheKey: string;

	/**
	 * Package name
	 */
	packageName: string;

	/**
	 * Task name
	 */
	taskName: string;

	/**
	 * Executable that was run
	 */
	executable: string;

	/**
	 * Full command that was executed
	 */
	command: string;

	/**
	 * Exit code (only 0 is cached - failures are not cached)
	 */
	exitCode: 0;

	/**
	 * Execution time in milliseconds
	 */
	executionTimeMs: number;

	/**
	 * Cache schema version used for this execution
	 */
	cacheSchemaVersion: number;

	/**
	 * Node.js version used for this execution
	 */
	nodeVersion: string;

	/**
	 * CPU architecture used for this execution
	 */
	arch: string;

	/**
	 * Platform where this was executed
	 */
	platform: string;

	/**
	 * Lockfile hash at time of execution
	 */
	lockfileHash: string;

	/**
	 * NODE_ENV at time of execution (if set)
	 */
	nodeEnv?: string;

	/**
	 * Cache bust variables at time of execution (if any)
	 */
	cacheBustVars?: Record<string, string>;

	/**
	 * Input files that were used
	 */
	inputFiles: ReadonlyArray<{
		readonly path: string; // Relative to package root
		readonly hash: string; // SHA-256
	}>;

	/**
	 * Output files that were produced
	 */
	outputFiles: ReadonlyArray<{
		readonly path: string; // Relative to package root
		readonly hash: string; // SHA-256 for integrity verification
		readonly size: number; // File size in bytes
	}>;

	/**
	 * Standard output captured during execution
	 *
	 * This allows replaying the output when restoring from cache,
	 * providing a consistent developer experience.
	 */
	stdout: string;

	/**
	 * Standard error captured during execution
	 *
	 * This allows replaying warnings/errors when restoring from cache,
	 * providing a consistent developer experience.
	 */
	stderr: string;

	/**
	 * When this cache entry was created
	 */
	createdAt: string; // ISO-8601 timestamp

	/**
	 * When this cache entry was last accessed (for LRU pruning in future)
	 */
	lastAccessedAt: string; // ISO-8601 timestamp
}

/**
 * A cache entry represents a stored task execution with all its metadata.
 */
export interface CacheEntry {
	/**
	 * The cache key
	 */
	cacheKey: string;

	/**
	 * Path to the cache entry directory
	 */
	entryPath: string;

	/**
	 * The manifest metadata
	 */
	manifest: CacheManifest;
}

/**
 * Output files and metadata from a task execution.
 */
export interface TaskOutputs {
	/**
	 * Output files produced by the task
	 */
	files: ReadonlyArray<{
		readonly sourcePath: string; // Absolute path to the file in workspace
		readonly relativePath: string; // Relative to package root
		readonly hash?: string; // Optional hash for verification
	}>;

	/**
	 * Standard output captured during execution
	 */
	stdout: string;

	/**
	 * Standard error captured during execution
	 */
	stderr: string;

	/**
	 * Exit code
	 */
	exitCode: number;

	/**
	 * Execution time in milliseconds
	 */
	executionTimeMs: number;
}

/**
 * Result of restoring a cache entry to the workspace.
 */
export interface RestoreResult {
	/**
	 * Whether restoration was successful
	 */
	success: boolean;

	/**
	 * Number of files restored
	 */
	filesRestored: number;

	/**
	 * Total size of restored files in bytes
	 */
	bytesRestored: number;

	/**
	 * Time taken to restore in milliseconds
	 */
	restoreTimeMs: number;

	/**
	 * Standard output from the original task execution (for replay)
	 */
	stdout?: string;

	/**
	 * Standard error from the original task execution (for replay)
	 */
	stderr?: string;

	/**
	 * Error message if restoration failed
	 */
	error?: string;
}

/**
 * Statistics about cache usage and performance.
 *
 * Used for monitoring cache effectiveness and debugging.
 */
export interface CacheStatistics {
	/**
	 * Total number of cache entries
	 */
	totalEntries: number;

	/**
	 * Total size of all cached data in bytes
	 */
	totalSize: number;

	/**
	 * Number of cache hits during this session
	 */
	hitCount: number;

	/**
	 * Number of cache misses during this session
	 */
	missCount: number;

	/**
	 * Average time to restore from cache in milliseconds
	 */
	avgRestoreTime: number;

	/**
	 * Average time to store to cache in milliseconds
	 */
	avgStoreTime: number;

	/**
	 * When the cache was last pruned (if ever)
	 */
	lastPruned?: string; // ISO-8601 timestamp
}

/**
 * Global cache key components that apply to all tasks.
 *
 * These values are computed once at build startup and reused for all cache operations.
 */
export interface GlobalCacheKeyComponents {
	/**
	 * Cache schema version for forward/backward compatibility
	 *
	 * This should be incremented when the cache format changes in an incompatible way.
	 */
	cacheSchemaVersion: number;

	/**
	 * Node.js version (from process.version, e.g., "v20.15.1")
	 */
	nodeVersion: string;

	/**
	 * CPU architecture (from process.arch, e.g., "x64", "arm64")
	 *
	 * Different architectures can produce different outputs for native modules.
	 */
	arch: string;

	/**
	 * Platform identifier (from process.platform, e.g., "linux", "darwin", "win32")
	 */
	platform: string;

	/**
	 * Hash of the lockfile (pnpm-lock.yaml)
	 */
	lockfileHash: string;

	/**
	 * NODE_ENV environment variable value (if set)
	 *
	 * Some build tools produce different outputs in development vs production mode.
	 */
	nodeEnv?: string;

	/**
	 * Cache bust variables (FLUID_BUILD_CACHE_BUST*)
	 *
	 * Environment variables starting with FLUID_BUILD_CACHE_BUST can be used
	 * to manually invalidate caches without changing code or dependencies.
	 */
	cacheBustVars?: Record<string, string>;
}

/**
 * Options for configuring the shared cache.
 */
export interface SharedCacheOptions {
	/**
	 * Path to the cache directory
	 */
	cacheDir: string;

	/**
	 * Repository root directory
	 */
	repoRoot: string;

	/**
	 * Global cache key components
	 */
	globalKeyComponents: GlobalCacheKeyComponents;

	/**
	 * Whether to verify file integrity when restoring from cache
	 * (adds overhead but catches corruption)
	 */
	verifyIntegrity?: boolean;

	/**
	 * Whether to skip writing to cache (read-only mode)
	 */
	skipCacheWrite?: boolean;
}

/**
 * Strategy for detecting output files produced by a task.
 *
 * Different tasks may require different strategies for identifying outputs.
 */
export interface OutputDetectionStrategy {
	/**
	 * Capture state before task execution
	 */
	beforeExecution(): Promise<Set<string>>;

	/**
	 * Capture state after task execution
	 */
	afterExecution(): Promise<Set<string>>;

	/**
	 * Get the files that were created or modified
	 */
	getNewFiles(): string[];
}
