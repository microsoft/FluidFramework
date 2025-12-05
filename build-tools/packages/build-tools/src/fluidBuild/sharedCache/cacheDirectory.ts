/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Current cache format version.
 *
 * Increment this when making breaking changes to the cache structure or manifest format.
 */
const CACHE_VERSION = 1;

/**
 * Root-level cache metadata stored in index.json.
 */
interface CacheIndexMetadata {
	/**
	 * Cache format version
	 */
	version: number;

	/**
	 * When the cache was created
	 */
	createdAt: string;

	/**
	 * Last time the cache was accessed
	 */
	lastAccessedAt: string;
}

/**
 * Version-specific cache metadata stored in v{N}/metadata.json.
 */
interface CacheVersionMetadata {
	/**
	 * Schema version for this cache format
	 */
	schemaVersion: number;

	/**
	 * When this version's cache was created
	 */
	createdAt: string;

	/**
	 * Description of this cache format version
	 */
	description: string;
}

/**
 * Initialize the cache directory structure.
 *
 * Creates the following structure:
 * ```
 * {cacheRoot}/
 * ├── index.json           # Global metadata
 * └── v1/                  # Versioned cache format
 *     ├── metadata.json    # Version-specific metadata
 *     └── entries/         # Cache entries directory
 * ```
 *
 * @param cacheRoot - Root directory for the cache
 * @returns Path to the cache entries directory
 */
export async function initializeCacheDirectory(cacheRoot: string): Promise<string> {
	// Create root directory
	await mkdir(cacheRoot, { recursive: true });

	// Initialize or update root index
	const indexPath = join(cacheRoot, "index.json");
	await initializeIndexMetadata(indexPath);

	// Create versioned cache directory
	const versionDir = join(cacheRoot, `v${CACHE_VERSION}`);
	await mkdir(versionDir, { recursive: true });

	// Initialize version metadata
	const versionMetadataPath = join(versionDir, "metadata.json");
	await initializeVersionMetadata(versionMetadataPath);

	// Create entries directory
	const entriesDir = join(versionDir, "entries");
	await mkdir(entriesDir, { recursive: true });

	return entriesDir;
}

/**
 * Get the path to a cache entry directory for a given cache key.
 *
 * @param cacheRoot - Root directory for the cache
 * @param cacheKey - The cache key
 * @returns Path to the cache entry directory
 */
export function getCacheEntryPath(cacheRoot: string, cacheKey: string): string {
	return join(cacheRoot, `v${CACHE_VERSION}`, "entries", cacheKey);
}

/**
 * Get the path to the cache entries directory.
 *
 * @param cacheRoot - Root directory for the cache
 * @returns Path to the entries directory
 */
export function getCacheEntriesDirectory(cacheRoot: string): string {
	return join(cacheRoot, `v${CACHE_VERSION}`, "entries");
}

/**
 * Check if a cache entry exists for the given cache key.
 *
 * @param cacheRoot - Root directory for the cache
 * @param cacheKey - The cache key to check
 * @returns True if the entry exists
 */
export function cacheEntryExists(cacheRoot: string, cacheKey: string): boolean {
	const entryPath = getCacheEntryPath(cacheRoot, cacheKey);
	const manifestPath = join(entryPath, "manifest.json");
	return existsSync(manifestPath);
}

/**
 * Initialize or update the root index metadata.
 *
 * @param indexPath - Path to index.json
 */
async function initializeIndexMetadata(indexPath: string): Promise<void> {
	const now = new Date().toISOString();

	if (existsSync(indexPath)) {
		// Update existing index
		try {
			const existingData = await readFile(indexPath, "utf8");
			const existing: CacheIndexMetadata = JSON.parse(existingData);
			existing.lastAccessedAt = now;
			await writeFile(indexPath, JSON.stringify(existing, null, 2), "utf8");
		} catch (error) {
			// If we can't read/parse existing index, create a new one
			await createNewIndexMetadata(indexPath, now);
		}
	} else {
		// Create new index
		await createNewIndexMetadata(indexPath, now);
	}
}

/**
 * Create a new index metadata file.
 *
 * @param indexPath - Path to index.json
 * @param timestamp - Current timestamp
 */
async function createNewIndexMetadata(indexPath: string, timestamp: string): Promise<void> {
	const metadata: CacheIndexMetadata = {
		version: CACHE_VERSION,
		createdAt: timestamp,
		lastAccessedAt: timestamp,
	};
	await writeFile(indexPath, JSON.stringify(metadata, null, 2), "utf8");
}

/**
 * Initialize version-specific metadata.
 *
 * @param metadataPath - Path to v{N}/metadata.json
 */
async function initializeVersionMetadata(metadataPath: string): Promise<void> {
	if (existsSync(metadataPath)) {
		// Metadata already exists
		return;
	}

	const metadata: CacheVersionMetadata = {
		schemaVersion: CACHE_VERSION,
		createdAt: new Date().toISOString(),
		description: "Shared cache for fluid-build task outputs",
	};

	await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
}

/**
 * Get paths for all components of a cache entry.
 *
 * @param cacheRoot - Root directory for the cache
 * @param cacheKey - The cache key
 * @returns Object containing all relevant paths for the cache entry
 */
export function getCacheEntryPaths(
	cacheRoot: string,
	cacheKey: string,
): {
	entryDir: string;
	manifestPath: string;
	outputsDir: string;
	stdoutPath: string;
	stderrPath: string;
} {
	const entryDir = getCacheEntryPath(cacheRoot, cacheKey);
	return {
		entryDir,
		manifestPath: join(entryDir, "manifest.json"),
		outputsDir: join(entryDir, "outputs"),
		stdoutPath: join(entryDir, "stdout.log"),
		stderrPath: join(entryDir, "stderr.log"),
	};
}

/**
 * Validate that the cache directory structure is valid.
 *
 * @param cacheRoot - Root directory for the cache
 * @returns True if the cache structure is valid, false otherwise
 */
export async function validateCacheStructure(cacheRoot: string): Promise<boolean> {
	try {
		// Check root directory exists
		if (!existsSync(cacheRoot)) {
			return false;
		}

		// Check index.json exists and is valid
		const indexPath = join(cacheRoot, "index.json");
		if (!existsSync(indexPath)) {
			return false;
		}

		const indexData = await readFile(indexPath, "utf8");
		const index: CacheIndexMetadata = JSON.parse(indexData);
		if (index.version !== CACHE_VERSION) {
			return false;
		}

		// Check versioned directory exists
		const versionDir = join(cacheRoot, `v${CACHE_VERSION}`);
		if (!existsSync(versionDir)) {
			return false;
		}

		// Check version metadata exists
		const metadataPath = join(versionDir, "metadata.json");
		if (!existsSync(metadataPath)) {
			return false;
		}

		// Check entries directory exists
		const entriesDir = join(versionDir, "entries");
		if (!existsSync(entriesDir)) {
			return false;
		}

		return true;
	} catch {
		return false;
	}
}
