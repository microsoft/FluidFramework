/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { randomBytes } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import * as path from "node:path";

/**
 * Atomically write data to a file.
 *
 * This uses the temp-file-and-rename pattern to ensure that writes are atomic:
 * 1. Write to a temporary file in the same directory
 * 2. Rename the temp file to the target path (atomic operation on POSIX systems)
 *
 * This prevents partial writes from being visible and ensures crash safety.
 * If the process crashes during the write, either the old file or new file will
 * be present, but never a partially-written file.
 *
 * @param targetPath - The final path where the file should be written
 * @param data - The data to write (string or Buffer)
 * @param encoding - Text encoding (only used if data is a string, defaults to 'utf8')
 * @returns Promise that resolves when the write is complete
 */
export async function atomicWrite(
	targetPath: string,
	data: string | Buffer,
	encoding: BufferEncoding = "utf8",
): Promise<void> {
	// Ensure parent directory exists
	const parentDir = path.dirname(targetPath);
	await mkdir(parentDir, { recursive: true });

	// Generate a unique temporary filename in the same directory
	// (must be same directory for rename to be atomic)
	const tempPath = path.join(parentDir, `.tmp-${randomBytes(8).toString("hex")}`);

	try {
		// Write to temporary file
		if (typeof data === "string") {
			await writeFile(tempPath, data, encoding);
		} else {
			await writeFile(tempPath, data);
		}

		// Atomically rename temp file to target
		// On POSIX systems, this is guaranteed to be atomic
		// On Windows, this is atomic if target doesn't exist, otherwise may not be
		await rename(tempPath, targetPath);
	} catch (error) {
		// Clean up temp file if write failed
		try {
			await unlink(tempPath);
		} catch {
			// Ignore cleanup errors
		}
		throw error;
	}
}

/**
 * Atomically write JSON data to a file with pretty formatting.
 *
 * This is a convenience wrapper around atomicWrite for JSON data.
 *
 * @param targetPath - The final path where the JSON file should be written
 * @param data - The data to serialize to JSON
 * @param pretty - Whether to pretty-print the JSON (default: true)
 * @returns Promise that resolves when the write is complete
 */
export async function atomicWriteJson(
	targetPath: string,
	data: unknown,
	pretty: boolean = true,
): Promise<void> {
	const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
	await atomicWrite(targetPath, json, "utf8");
}
