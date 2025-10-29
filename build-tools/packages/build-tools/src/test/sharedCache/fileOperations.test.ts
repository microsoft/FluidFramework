/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	calculateTotalSize,
	copyFileWithDirs,
	copyFiles,
	formatFileSize,
	getFileStats,
	hashFile,
	hashFiles,
	hashFilesWithSize,
	isBinaryFile,
	verifyFileIntegrity,
	verifyFilesIntegrity,
} from "../../fluidBuild/sharedCache/fileOperations";

describe("File Operations", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "file-ops-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("hashFile", () => {
		it("produces consistent hash for same content", async () => {
			const filePath = join(tempDir, "test.txt");
			await writeFile(filePath, "hello world");

			const hash1 = await hashFile(filePath);
			const hash2 = await hashFile(filePath);

			assert.strictEqual(hash1, hash2);
		});

		it("produces different hashes for different content", async () => {
			const file1 = join(tempDir, "test1.txt");
			const file2 = join(tempDir, "test2.txt");

			await writeFile(file1, "hello");
			await writeFile(file2, "world");

			const hash1 = await hashFile(file1);
			const hash2 = await hashFile(file2);

			assert.notStrictEqual(hash1, hash2);
		});

		it("produces 64-character hex hash", async () => {
			const filePath = join(tempDir, "test.txt");
			await writeFile(filePath, "test content");

			const hash = await hashFile(filePath);

			assert.strictEqual(hash.length, 64);
			assert.match(hash, /^[0-9a-f]{64}$/);
		});

		it("handles empty file", async () => {
			const filePath = join(tempDir, "empty.txt");
			await writeFile(filePath, "");

			const hash = await hashFile(filePath);

			assert.strictEqual(hash.length, 64);
		});

		it("handles large file with streaming", async () => {
			const filePath = join(tempDir, "large.txt");
			// Create a file larger than 1MB to trigger streaming
			const largeContent = "x".repeat(2 * 1024 * 1024); // 2MB
			await writeFile(filePath, largeContent);

			const hash = await hashFile(filePath);

			assert.strictEqual(hash.length, 64);
			assert.match(hash, /^[0-9a-f]{64}$/);
		});

		it("handles binary file", async () => {
			const filePath = join(tempDir, "binary.bin");
			const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]);
			await writeFile(filePath, buffer);

			const hash = await hashFile(filePath);

			assert.strictEqual(hash.length, 64);
		});

		it("throws error for non-existent file", async () => {
			const filePath = join(tempDir, "non-existent.txt");

			await assert.rejects(async () => {
				await hashFile(filePath);
			});
		});
	});

	describe("hashFiles", () => {
		it("hashes multiple files in parallel", async () => {
			const file1 = join(tempDir, "test1.txt");
			const file2 = join(tempDir, "test2.txt");

			await writeFile(file1, "content1");
			await writeFile(file2, "content2");

			const results = await hashFiles([file1, file2]);

			assert.strictEqual(results.length, 2);
			assert.strictEqual(results[0].path, file1);
			assert.strictEqual(results[1].path, file2);
			assert.strictEqual(results[0].hash.length, 64);
			assert.strictEqual(results[1].hash.length, 64);
			assert.notStrictEqual(results[0].hash, results[1].hash);
		});

		it("handles empty file list", async () => {
			const results = await hashFiles([]);
			assert.strictEqual(results.length, 0);
		});

		it("throws error if any file fails", async () => {
			const file1 = join(tempDir, "test1.txt");
			const file2 = join(tempDir, "non-existent.txt");

			await writeFile(file1, "content1");

			await assert.rejects(async () => {
				await hashFiles([file1, file2]);
			}, /Failed to hash file/);
		});
	});

	describe("hashFilesWithSize", () => {
		it("hashes files and returns sizes", async () => {
			const file1 = join(tempDir, "test1.txt");
			const file2 = join(tempDir, "test2.txt");

			await writeFile(file1, "content1"); // 8 bytes
			await writeFile(file2, "ab"); // 2 bytes

			const results = await hashFilesWithSize([file1, file2]);

			assert.strictEqual(results.length, 2);
			assert.strictEqual(results[0].path, file1);
			assert.strictEqual(results[0].size, 8);
			assert.strictEqual(results[1].path, file2);
			assert.strictEqual(results[1].size, 2);
			assert.strictEqual(results[0].hash.length, 64);
			assert.strictEqual(results[1].hash.length, 64);
		});
	});

	describe("verifyFileIntegrity", () => {
		it("returns true for matching hash", async () => {
			const filePath = join(tempDir, "test.txt");
			await writeFile(filePath, "test content");

			const hash = await hashFile(filePath);
			const isValid = await verifyFileIntegrity(filePath, hash);

			assert.strictEqual(isValid, true);
		});

		it("returns false for non-matching hash", async () => {
			const filePath = join(tempDir, "test.txt");
			await writeFile(filePath, "test content");

			const wrongHash = "0".repeat(64);
			const isValid = await verifyFileIntegrity(filePath, wrongHash);

			assert.strictEqual(isValid, false);
		});

		it("returns false for non-existent file", async () => {
			const filePath = join(tempDir, "non-existent.txt");
			const hash = "0".repeat(64);

			const isValid = await verifyFileIntegrity(filePath, hash);

			assert.strictEqual(isValid, false);
		});
	});

	describe("verifyFilesIntegrity", () => {
		it("returns success for all valid files", async () => {
			const file1 = join(tempDir, "test1.txt");
			const file2 = join(tempDir, "test2.txt");

			await writeFile(file1, "content1");
			await writeFile(file2, "content2");

			const hash1 = await hashFile(file1);
			const hash2 = await hashFile(file2);

			const result = await verifyFilesIntegrity([
				{ path: file1, hash: hash1 },
				{ path: file2, hash: hash2 },
			]);

			assert.strictEqual(result.success, true);
			assert.strictEqual(result.failedFiles.length, 0);
		});

		it("returns failed files for invalid hashes", async () => {
			const file1 = join(tempDir, "test1.txt");
			const file2 = join(tempDir, "test2.txt");

			await writeFile(file1, "content1");
			await writeFile(file2, "content2");

			const hash1 = await hashFile(file1);
			const wrongHash = "0".repeat(64);

			const result = await verifyFilesIntegrity([
				{ path: file1, hash: hash1 },
				{ path: file2, hash: wrongHash },
			]);

			assert.strictEqual(result.success, false);
			assert.strictEqual(result.failedFiles.length, 1);
			assert.strictEqual(result.failedFiles[0], file2);
		});

		it("handles empty file list", async () => {
			const result = await verifyFilesIntegrity([]);

			assert.strictEqual(result.success, true);
			assert.strictEqual(result.failedFiles.length, 0);
		});
	});

	describe("copyFileWithDirs", () => {
		it("copies file to destination", async () => {
			const source = join(tempDir, "source.txt");
			const dest = join(tempDir, "dest.txt");

			await writeFile(source, "test content");
			await copyFileWithDirs(source, dest);

			const content = await readFile(dest, "utf8");
			assert.strictEqual(content, "test content");
		});

		it("creates parent directories", async () => {
			const source = join(tempDir, "source.txt");
			const dest = join(tempDir, "nested", "deep", "dest.txt");

			await writeFile(source, "test content");
			await copyFileWithDirs(source, dest);

			const content = await readFile(dest, "utf8");
			assert.strictEqual(content, "test content");
		});

		it("throws error for non-existent source", async () => {
			const source = join(tempDir, "non-existent.txt");
			const dest = join(tempDir, "dest.txt");

			await assert.rejects(async () => {
				await copyFileWithDirs(source, dest);
			});
		});
	});

	describe("copyFiles", () => {
		it("copies multiple files with relative paths", async () => {
			const sourceRoot = join(tempDir, "source");
			const destRoot = join(tempDir, "dest");

			const file1 = join(sourceRoot, "file1.txt");
			const file2 = join(sourceRoot, "sub", "file2.txt");

			// Create source files with directories using copyFileWithDirs helper
			await writeFile(join(tempDir, "temp1.txt"), "content1");
			await writeFile(join(tempDir, "temp2.txt"), "content2");
			await copyFileWithDirs(join(tempDir, "temp1.txt"), file1);
			await copyFileWithDirs(join(tempDir, "temp2.txt"), file2);

			const files = [
				{ sourcePath: file1, relativePath: "file1.txt" },
				{ sourcePath: file2, relativePath: "sub/file2.txt" },
			];

			const count = await copyFiles(files, sourceRoot, destRoot);

			assert.strictEqual(count, 2);

			const dest1Content = await readFile(join(destRoot, "file1.txt"), "utf8");
			const dest2Content = await readFile(join(destRoot, "sub/file2.txt"), "utf8");

			assert.strictEqual(dest1Content, "content1");
			assert.strictEqual(dest2Content, "content2");
		});

		it("continues on error and returns partial count", async () => {
			const sourceRoot = join(tempDir, "source");
			const destRoot = join(tempDir, "dest");

			const file1 = join(sourceRoot, "file1.txt");
			const file2 = join(sourceRoot, "non-existent.txt");

			await writeFile(join(tempDir, "temp1.txt"), "content1");
			await copyFileWithDirs(join(tempDir, "temp1.txt"), file1);

			const files = [
				{ sourcePath: file1, relativePath: "file1.txt" },
				{ sourcePath: file2, relativePath: "file2.txt" },
			];

			const count = await copyFiles(files, sourceRoot, destRoot);

			// Should copy only the first file
			assert.strictEqual(count, 1);
		});

		it("handles empty file list", async () => {
			const sourceRoot = join(tempDir, "source");
			const destRoot = join(tempDir, "dest");

			const count = await copyFiles([], sourceRoot, destRoot);

			assert.strictEqual(count, 0);
		});
	});

	describe("getFileStats", () => {
		it("returns file size and modification time", async () => {
			const filePath = join(tempDir, "test.txt");
			await writeFile(filePath, "hello world"); // 11 bytes

			const stats = await getFileStats(filePath);

			assert.strictEqual(stats.size, 11);
			assert.ok(stats.modifiedTime instanceof Date);
		});

		it("throws error for non-existent file", async () => {
			const filePath = join(tempDir, "non-existent.txt");

			await assert.rejects(async () => {
				await getFileStats(filePath);
			});
		});
	});

	describe("calculateTotalSize", () => {
		it("calculates total size of multiple files", async () => {
			const file1 = join(tempDir, "test1.txt");
			const file2 = join(tempDir, "test2.txt");

			await writeFile(file1, "hello"); // 5 bytes
			await writeFile(file2, "world!"); // 6 bytes

			const totalSize = await calculateTotalSize([file1, file2]);

			assert.strictEqual(totalSize, 11);
		});

		it("skips non-existent files", async () => {
			const file1 = join(tempDir, "test1.txt");
			const file2 = join(tempDir, "non-existent.txt");

			await writeFile(file1, "hello"); // 5 bytes

			const totalSize = await calculateTotalSize([file1, file2]);

			assert.strictEqual(totalSize, 5);
		});

		it("returns 0 for empty file list", async () => {
			const totalSize = await calculateTotalSize([]);
			assert.strictEqual(totalSize, 0);
		});
	});

	describe("isBinaryFile", () => {
		it("returns false for text file", async () => {
			const filePath = join(tempDir, "text.txt");
			await writeFile(filePath, "Hello, world! This is text.");

			const isBinary = await isBinaryFile(filePath);

			assert.strictEqual(isBinary, false);
		});

		it("returns true for file with null bytes", async () => {
			const filePath = join(tempDir, "binary.bin");
			const buffer = Buffer.from([0x48, 0x00, 0x65, 0x6c, 0x6c, 0x6f]); // "H\0ello"
			await writeFile(filePath, buffer);

			const isBinary = await isBinaryFile(filePath);

			assert.strictEqual(isBinary, true);
		});

		it("handles empty file", async () => {
			const filePath = join(tempDir, "empty.txt");
			await writeFile(filePath, "");

			const isBinary = await isBinaryFile(filePath);

			assert.strictEqual(isBinary, false);
		});

		it("returns true for non-existent file", async () => {
			const filePath = join(tempDir, "non-existent.bin");

			const isBinary = await isBinaryFile(filePath);

			// Should return true as a safe default
			assert.strictEqual(isBinary, true);
		});
	});

	describe("formatFileSize", () => {
		it("formats bytes", () => {
			assert.strictEqual(formatFileSize(0), "0.0 B");
			assert.strictEqual(formatFileSize(512), "512.0 B");
			assert.strictEqual(formatFileSize(1023), "1023.0 B");
		});

		it("formats kilobytes", () => {
			assert.strictEqual(formatFileSize(1024), "1.0 KB");
			assert.strictEqual(formatFileSize(2048), "2.0 KB");
			assert.strictEqual(formatFileSize(1536), "1.5 KB");
		});

		it("formats megabytes", () => {
			assert.strictEqual(formatFileSize(1024 * 1024), "1.0 MB");
			assert.strictEqual(formatFileSize(2.5 * 1024 * 1024), "2.5 MB");
		});

		it("formats gigabytes", () => {
			assert.strictEqual(formatFileSize(1024 * 1024 * 1024), "1.0 GB");
			assert.strictEqual(formatFileSize(3.7 * 1024 * 1024 * 1024), "3.7 GB");
		});

		it("formats terabytes", () => {
			assert.strictEqual(formatFileSize(1024 * 1024 * 1024 * 1024), "1.0 TB");
			assert.strictEqual(formatFileSize(2.3 * 1024 * 1024 * 1024 * 1024), "2.3 TB");
		});

		it("handles fractional values", () => {
			const result = formatFileSize(1536); // 1.5 KB
			assert.match(result, /1\.5 KB/);
		});
	});
});
