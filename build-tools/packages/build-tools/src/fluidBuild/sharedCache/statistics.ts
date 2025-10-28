/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";
import type { CacheStatistics } from "./types.js";
import { atomicWriteJson } from "./atomicWrite.js";

/**
 * File name for persisted statistics
 */
const STATISTICS_FILE = "statistics.json";

/**
 * Load cache statistics from disk.
 *
 * @param cacheDir - Path to the cache directory
 * @returns The persisted statistics, or default statistics if none exist
 */
export async function loadStatistics(cacheDir: string): Promise<CacheStatistics> {
	const statsPath = path.join(cacheDir, STATISTICS_FILE);

	// Return default statistics if file doesn't exist
	if (!existsSync(statsPath)) {
		return {
			totalEntries: 0,
			totalSize: 0,
			hitCount: 0,
			missCount: 0,
			avgRestoreTime: 0,
			avgStoreTime: 0,
		};
	}

	try {
		const content = await readFile(statsPath, "utf8");
		const stats = JSON.parse(content) as CacheStatistics;

		// Validate required fields
		if (
			typeof stats.totalEntries !== "number" ||
			typeof stats.totalSize !== "number" ||
			typeof stats.hitCount !== "number" ||
			typeof stats.missCount !== "number" ||
			typeof stats.avgRestoreTime !== "number" ||
			typeof stats.avgStoreTime !== "number"
		) {
			throw new Error("Invalid statistics file format");
		}

		return stats;
	} catch (error) {
		// Return default statistics if file is corrupted
		console.warn(
			`Warning: Failed to load cache statistics: ${error instanceof Error ? error.message : String(error)}`,
		);
		return {
			totalEntries: 0,
			totalSize: 0,
			hitCount: 0,
			missCount: 0,
			avgRestoreTime: 0,
			avgStoreTime: 0,
		};
	}
}

/**
 * Save cache statistics to disk.
 *
 * @param cacheDir - Path to the cache directory
 * @param stats - The statistics to save
 */
export async function saveStatistics(cacheDir: string, stats: CacheStatistics): Promise<void> {
	const statsPath = path.join(cacheDir, STATISTICS_FILE);

	try {
		await atomicWriteJson(statsPath, stats, true);
	} catch (error) {
		// Graceful degradation: log warning but don't fail
		console.warn(
			`Warning: Failed to save cache statistics: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Update total entries and size statistics by scanning the cache directory.
 *
 * This is useful for getting accurate totals after manual cache cleanup
 * or when statistics file is lost/corrupted.
 *
 * @param cacheDir - Path to the cache directory
 * @param stats - The statistics object to update
 */
export async function updateCacheSizeStats(
	cacheDir: string,
	stats: CacheStatistics,
): Promise<void> {
	const { readdir, stat } = await import("node:fs/promises");
	const entriesDir = path.join(cacheDir, "v1", "entries");

	try {
		// Get all cache entry directories
		const entries = await readdir(entriesDir, { withFileTypes: true });
		const entryDirs = entries.filter((e) => e.isDirectory());

		let totalSize = 0;
		let totalEntries = 0;

		// Calculate total size by summing all files in each entry
		for (const entry of entryDirs) {
			const entryPath = path.join(entriesDir, entry.name);
			const outputsDir = path.join(entryPath, "outputs");

			try {
				// Recursively calculate directory size
				totalSize += await getDirectorySize(outputsDir);
				totalEntries++;
			} catch {
				// Skip entries that don't have outputs directory
			}
		}

		// Update statistics
		stats.totalEntries = totalEntries;
		stats.totalSize = totalSize;
	} catch (error) {
		// Graceful degradation
		console.warn(
			`Warning: Failed to update cache size statistics: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Recursively calculate the total size of a directory in bytes.
 *
 * @param dirPath - Path to the directory
 * @returns Total size in bytes
 */
async function getDirectorySize(dirPath: string): Promise<number> {
	const { readdir, stat } = await import("node:fs/promises");

	let totalSize = 0;

	try {
		const entries = await readdir(dirPath, { withFileTypes: true });

		for (const entry of entries) {
			const entryPath = path.join(dirPath, entry.name);

			if (entry.isDirectory()) {
				totalSize += await getDirectorySize(entryPath);
			} else if (entry.isFile()) {
				const stats = await stat(entryPath);
				totalSize += stats.size;
			}
		}
	} catch {
		// Return 0 if directory doesn't exist or is inaccessible
	}

	return totalSize;
}
