/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

/**
 * Copy a file from source to destination, creating parent directories as needed.
 *
 * @param sourcePath - Absolute path to the source file
 * @param destPath - Absolute path to the destination file
 */
export async function copyFileWithDirs(sourcePath: string, destPath: string): Promise<void> {
	// Create parent directory if it doesn't exist
	const destDir = dirname(destPath);
	await mkdir(destDir, { recursive: true });

	// Copy the file
	await copyFile(sourcePath, destPath);
}

/**
 * Copy multiple files, maintaining their relative directory structure.
 *
 * @param files - Array of file objects with source and destination paths
 * @param sourceRoot - Root directory for source paths
 * @param destRoot - Root directory for destination paths
 * @returns Number of files successfully copied
 */
export async function copyFiles(
	files: ReadonlyArray<{ sourcePath: string; relativePath: string }>,
	sourceRoot: string,
	destRoot: string,
): Promise<number> {
	let copiedCount = 0;

	for (const file of files) {
		try {
			const sourcePath = file.sourcePath;
			const destPath = join(destRoot, file.relativePath);

			await copyFileWithDirs(sourcePath, destPath);
			copiedCount++;
		} catch (error) {
			// Log error but continue with other files
			console.warn(`Warning: Failed to copy file ${file.relativePath}: ${error}`);
		}
	}

	return copiedCount;
}

/**
 * Hash a file's contents using SHA-256.
 *
 * For large files, uses streaming to avoid loading the entire file into memory.
 *
 * @param filePath - Absolute path to the file
 * @returns SHA-256 hash as a hexadecimal string
 */
export async function hashFile(filePath: string): Promise<string> {
	// For small files (< 1MB), read directly into memory
	const fileStats = await stat(filePath);
	const fileSizeBytes = fileStats.size;

	if (fileSizeBytes < 1024 * 1024) {
		// Small file: read into memory
		const content = await readFile(filePath);
		return createHash("sha256").update(content).digest("hex");
	}

	// Large file: use streaming
	return hashFileStreaming(filePath);
}

/**
 * Hash a file using streaming (for large files).
 *
 * @param filePath - Absolute path to the file
 * @returns SHA-256 hash as a hexadecimal string
 */
function hashFileStreaming(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = createHash("sha256");
		const stream = createReadStream(filePath);

		stream.on("data", (chunk) => {
			hash.update(chunk);
		});

		stream.on("end", () => {
			resolve(hash.digest("hex"));
		});

		stream.on("error", (error) => {
			reject(error);
		});
	});
}

/**
 * Hash multiple files in parallel.
 *
 * @param filePaths - Array of absolute file paths
 * @returns Array of objects containing path and hash
 */
export async function hashFiles(
	filePaths: readonly string[],
): Promise<Array<{ path: string; hash: string }>> {
	const hashPromises = filePaths.map(async (path) => {
		try {
			const hash = await hashFile(path);
			return { path, hash };
		} catch (error) {
			throw new Error(`Failed to hash file ${path}: ${error}`);
		}
	});

	return Promise.all(hashPromises);
}

/**
 * Hash multiple files in parallel, including their sizes.
 *
 * @param filePaths - Array of absolute file paths
 * @returns Array of objects containing path, hash, and size
 */
export async function hashFilesWithSize(
	filePaths: readonly string[],
): Promise<Array<{ path: string; hash: string; size: number }>> {
	const hashPromises = filePaths.map(async (path) => {
		try {
			const [hash, stats] = await Promise.all([hashFile(path), getFileStats(path)]);
			return { path, hash, size: stats.size };
		} catch (error) {
			throw new Error(`Failed to hash file ${path}: ${error}`);
		}
	});

	return Promise.all(hashPromises);
}

/**
 * Verify the integrity of a file by comparing its hash to an expected value.
 *
 * @param filePath - Absolute path to the file
 * @param expectedHash - Expected SHA-256 hash
 * @returns True if the file's hash matches the expected hash
 */
export async function verifyFileIntegrity(
	filePath: string,
	expectedHash: string,
): Promise<boolean> {
	try {
		const actualHash = await hashFile(filePath);
		return actualHash === expectedHash;
	} catch {
		return false;
	}
}

/**
 * Verify the integrity of multiple files.
 *
 * @param files - Array of files with paths and expected hashes
 * @returns Object indicating success and any failed files
 */
export async function verifyFilesIntegrity(
	files: ReadonlyArray<{ path: string; hash: string }>,
): Promise<{
	success: boolean;
	failedFiles: string[];
}> {
	const failedFiles: string[] = [];

	for (const file of files) {
		const isValid = await verifyFileIntegrity(file.path, file.hash);
		if (!isValid) {
			failedFiles.push(file.path);
		}
	}

	return {
		success: failedFiles.length === 0,
		failedFiles,
	};
}

/**
 * Get file statistics (size, modification time, etc.).
 *
 * @param filePath - Absolute path to the file
 * @returns File statistics object
 */
export async function getFileStats(filePath: string): Promise<{
	size: number;
	modifiedTime: Date;
}> {
	const stats = await stat(filePath);
	return {
		size: stats.size,
		modifiedTime: stats.mtime,
	};
}

/**
 * Calculate the total size of multiple files.
 *
 * @param filePaths - Array of absolute file paths
 * @returns Total size in bytes
 */
export async function calculateTotalSize(filePaths: readonly string[]): Promise<number> {
	let totalSize = 0;

	for (const filePath of filePaths) {
		try {
			const stats = await getFileStats(filePath);
			totalSize += stats.size;
		} catch {
			// Skip files that don't exist or can't be read
			continue;
		}
	}

	return totalSize;
}

/**
 * Check if a file is a binary file (vs text file).
 *
 * Uses a simple heuristic: read first 8KB and check for null bytes.
 *
 * @param filePath - Absolute path to the file
 * @returns True if the file appears to be binary
 */
export async function isBinaryFile(filePath: string): Promise<boolean> {
	try {
		// Read first 8KB of file
		const buffer = Buffer.alloc(8192);
		const fd = await (await import("node:fs/promises")).open(filePath, "r");
		const { bytesRead } = await fd.read(buffer, 0, 8192, 0);
		await fd.close();

		// Check for null bytes (strong indicator of binary content)
		for (let i = 0; i < bytesRead; i++) {
			if (buffer[i] === 0) {
				return true;
			}
		}

		return false;
	} catch {
		// If we can't read the file, assume it's binary
		return true;
	}
}

/**
 * Format file size for human-readable display.
 *
 * @param bytes - Size in bytes
 * @returns Formatted string (e.g., "1.2 MB")
 */
export function formatFileSize(bytes: number): string {
	const units = ["B", "KB", "MB", "GB", "TB"];
	let size = bytes;
	let unitIndex = 0;

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}

	return `${size.toFixed(1)} ${units[unitIndex]}`;
}
