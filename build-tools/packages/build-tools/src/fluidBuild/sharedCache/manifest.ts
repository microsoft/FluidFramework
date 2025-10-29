/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import type { CacheManifest } from "./types.js";
import { atomicWriteJson } from "./atomicWrite.js";

/**
 * Write a cache manifest to disk.
 *
 * The manifest contains all metadata about a cached task execution,
 * including input/output file hashes, execution time, and environment info.
 *
 * Uses atomic write operations to ensure crash safety.
 *
 * @param manifestPath - Path where the manifest should be written
 * @param manifest - The manifest data to write
 */
export async function writeManifest(
	manifestPath: string,
	manifest: CacheManifest,
): Promise<void> {
	// Validate manifest before writing
	validateManifest(manifest);

	// Write atomically with pretty formatting for human readability
	await atomicWriteJson(manifestPath, manifest, true);
}

/**
 * Read and parse a cache manifest from disk.
 *
 * @param manifestPath - Path to the manifest.json file
 * @returns The parsed manifest, or undefined if the file doesn't exist or is invalid
 */
export async function readManifest(manifestPath: string): Promise<CacheManifest | undefined> {
	try {
		const content = await readFile(manifestPath, "utf8");
		const manifest = JSON.parse(content) as CacheManifest;

		// Validate the parsed manifest
		validateManifest(manifest);

		return manifest;
	} catch (error) {
		// File doesn't exist, is not valid JSON, or failed validation
		return undefined;
	}
}

/**
 * Validate that a manifest has all required fields and valid values.
 *
 * @param manifest - The manifest to validate
 * @throws Error if the manifest is invalid
 */
function validateManifest(manifest: CacheManifest): void {
	// Check required fields exist
	if (!manifest.version) {
		throw new Error("Manifest missing version field");
	}

	if (!manifest.cacheKey) {
		throw new Error("Manifest missing cacheKey field");
	}

	if (!manifest.packageName) {
		throw new Error("Manifest missing packageName field");
	}

	if (!manifest.taskName) {
		throw new Error("Manifest missing taskName field");
	}

	if (!manifest.executable) {
		throw new Error("Manifest missing executable field");
	}

	if (!manifest.command) {
		throw new Error("Manifest missing command field");
	}

	// Validate version is supported
	if (manifest.version !== 1) {
		throw new Error(`Unsupported manifest version: ${manifest.version}`);
	}

	// Validate exit code (only success should be cached)
	if (manifest.exitCode !== 0) {
		throw new Error(`Invalid exit code in manifest: ${manifest.exitCode} (only 0 is valid)`);
	}

	// Validate execution time
	if (typeof manifest.executionTimeMs !== "number" || manifest.executionTimeMs < 0) {
		throw new Error(`Invalid executionTimeMs: ${manifest.executionTimeMs}`);
	}

	// Validate environment fields
	if (!manifest.nodeVersion) {
		throw new Error("Manifest missing nodeVersion field");
	}

	if (!manifest.platform) {
		throw new Error("Manifest missing platform field");
	}

	if (!manifest.lockfileHash) {
		throw new Error("Manifest missing lockfileHash field");
	}

	// Validate arrays exist
	if (!Array.isArray(manifest.inputFiles)) {
		throw new Error("Manifest inputFiles must be an array");
	}

	if (!Array.isArray(manifest.outputFiles)) {
		throw new Error("Manifest outputFiles must be an array");
	}

	// Validate stdout/stderr (should be strings, can be empty)
	if (typeof manifest.stdout !== "string") {
		throw new Error("Manifest stdout must be a string");
	}

	if (typeof manifest.stderr !== "string") {
		throw new Error("Manifest stderr must be a string");
	}

	// Validate file entries
	for (const file of manifest.inputFiles) {
		if (!file.path || !file.hash) {
			throw new Error("Invalid input file entry: missing path or hash");
		}
	}

	for (const file of manifest.outputFiles) {
		if (!file.path || !file.hash) {
			throw new Error("Invalid output file entry: missing path or hash");
		}
		if (typeof file.size !== "number" || file.size < 0) {
			throw new Error(`Invalid output file size: ${file.size}`);
		}
	}

	// Validate timestamps
	if (!manifest.createdAt) {
		throw new Error("Manifest missing createdAt field");
	}

	if (!manifest.lastAccessedAt) {
		throw new Error("Manifest missing lastAccessedAt field");
	}

	// Validate timestamps are valid ISO-8601 dates
	const createdDate = new Date(manifest.createdAt);
	if (Number.isNaN(createdDate.getTime())) {
		throw new Error(`Invalid createdAt timestamp: ${manifest.createdAt}`);
	}

	const accessedDate = new Date(manifest.lastAccessedAt);
	if (Number.isNaN(accessedDate.getTime())) {
		throw new Error(`Invalid lastAccessedAt timestamp: ${manifest.lastAccessedAt}`);
	}
}

/**
 * Update the lastAccessedAt timestamp in a manifest file.
 *
 * This is used to track cache entry usage for LRU pruning in the future.
 *
 * @param manifestPath - Path to the manifest.json file
 */
export async function updateManifestAccessTime(manifestPath: string): Promise<void> {
	const manifest = await readManifest(manifestPath);
	if (manifest === undefined) {
		throw new Error(`Failed to read manifest at ${manifestPath}`);
	}

	manifest.lastAccessedAt = new Date().toISOString();
	await writeManifest(manifestPath, manifest);
}

/**
 * Create a manifest from task execution results.
 *
 * @param options - Parameters for creating the manifest
 * @returns A complete manifest ready to be written
 */
export function createManifest(options: {
	cacheKey: string;
	packageName: string;
	taskName: string;
	executable: string;
	command: string;
	exitCode: 0;
	executionTimeMs: number;
	nodeVersion: string;
	platform: string;
	lockfileHash: string;
	inputFiles: ReadonlyArray<{ path: string; hash: string }>;
	outputFiles: ReadonlyArray<{ path: string; hash: string; size: number }>;
	stdout: string;
	stderr: string;
}): CacheManifest {
	const now = new Date().toISOString();

	return {
		version: 1,
		cacheKey: options.cacheKey,
		packageName: options.packageName,
		taskName: options.taskName,
		executable: options.executable,
		command: options.command,
		exitCode: options.exitCode,
		executionTimeMs: options.executionTimeMs,
		nodeVersion: options.nodeVersion,
		platform: options.platform,
		lockfileHash: options.lockfileHash,
		inputFiles: options.inputFiles,
		outputFiles: options.outputFiles,
		stdout: options.stdout,
		stderr: options.stderr,
		createdAt: now,
		lastAccessedAt: now,
	};
}
