/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWrite, atomicWriteJson } from "../../fluidBuild/sharedCache/atomicWrite";

describe("Atomic Write", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "atomic-write-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("atomicWrite", () => {
		it("writes string content to file", async () => {
			const filePath = join(tempDir, "test.txt");
			const content = "Hello, world!";

			await atomicWrite(filePath, content);

			const readContent = await readFile(filePath, "utf8");
			assert.strictEqual(readContent, content);
		});

		it("writes Buffer content to file", async () => {
			const filePath = join(tempDir, "test.bin");
			const buffer = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]);

			await atomicWrite(filePath, buffer);

			const readBuffer = await readFile(filePath);
			assert.deepStrictEqual(readBuffer, buffer);
		});

		it("creates parent directories if they don't exist", async () => {
			const filePath = join(tempDir, "nested", "deep", "test.txt");
			const content = "test content";

			await atomicWrite(filePath, content);

			const readContent = await readFile(filePath, "utf8");
			assert.strictEqual(readContent, content);
		});

		it("overwrites existing file", async () => {
			const filePath = join(tempDir, "test.txt");

			await writeFile(filePath, "old content");
			await atomicWrite(filePath, "new content");

			const readContent = await readFile(filePath, "utf8");
			assert.strictEqual(readContent, "new content");
		});

		it("respects encoding parameter for string data", async () => {
			const filePath = join(tempDir, "test.txt");
			const content = "Hello, 世界";

			await atomicWrite(filePath, content, "utf8");

			const readContent = await readFile(filePath, "utf8");
			assert.strictEqual(readContent, content);
		});

		it("does not leave temporary files after successful write", async () => {
			const filePath = join(tempDir, "test.txt");
			const content = "test content";

			await atomicWrite(filePath, content);

			const files = await readdir(tempDir);
			// Should only contain the target file, no .tmp-* files
			assert.strictEqual(files.length, 1);
			assert.strictEqual(files[0], "test.txt");
		});

		it("cleans up temporary file on write error", async () => {
			// Create an invalid path that will fail during rename
			// (trying to write to a directory instead of a file)
			const dirPath = join(tempDir, "subdir");
			await writeFile(join(tempDir, "subdir"), ""); // Create as file first

			const filePath = join(dirPath, "test.txt");

			await assert.rejects(async () => {
				await atomicWrite(filePath, "content");
			});

			// Verify no .tmp-* files were left behind in tempDir
			const files = await readdir(tempDir);
			const tmpFiles = files.filter((f) => f.startsWith(".tmp-"));
			assert.strictEqual(tmpFiles.length, 0);
		});

		it("handles empty string", async () => {
			const filePath = join(tempDir, "empty.txt");

			await atomicWrite(filePath, "");

			const readContent = await readFile(filePath, "utf8");
			assert.strictEqual(readContent, "");
		});

		it("handles empty Buffer", async () => {
			const filePath = join(tempDir, "empty.bin");

			await atomicWrite(filePath, Buffer.alloc(0));

			const readBuffer = await readFile(filePath);
			assert.strictEqual(readBuffer.length, 0);
		});

		it("handles large content", async () => {
			const filePath = join(tempDir, "large.txt");
			const largeContent = "x".repeat(1024 * 1024); // 1MB

			await atomicWrite(filePath, largeContent);

			const readContent = await readFile(filePath, "utf8");
			assert.strictEqual(readContent, largeContent);
		});

		it("preserves binary data integrity", async () => {
			const filePath = join(tempDir, "binary.bin");
			const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd, 0xfc]);

			await atomicWrite(filePath, buffer);

			const readBuffer = await readFile(filePath);
			assert.deepStrictEqual(readBuffer, buffer);
		});
	});

	describe("atomicWriteJson", () => {
		it("writes JSON with pretty formatting by default", async () => {
			const filePath = join(tempDir, "test.json");
			const data = {
				name: "test",
				version: 1,
				items: ["a", "b", "c"],
			};

			await atomicWriteJson(filePath, data);

			const content = await readFile(filePath, "utf8");
			const parsed = JSON.parse(content);

			assert.deepStrictEqual(parsed, data);
			// Verify pretty formatting (contains newlines and indentation)
			assert.ok(content.includes("\n"));
			assert.ok(content.includes("  ")); // 2-space indentation
		});

		it("writes compact JSON when pretty is false", async () => {
			const filePath = join(tempDir, "test.json");
			const data = {
				name: "test",
				version: 1,
			};

			await atomicWriteJson(filePath, data, false);

			const content = await readFile(filePath, "utf8");
			const parsed = JSON.parse(content);

			assert.deepStrictEqual(parsed, data);
			// Verify compact formatting (no extra whitespace)
			assert.strictEqual(content, JSON.stringify(data));
		});

		it("handles nested objects", async () => {
			const filePath = join(tempDir, "nested.json");
			const data = {
				level1: {
					level2: {
						level3: {
							value: "deep",
						},
					},
				},
			};

			await atomicWriteJson(filePath, data);

			const content = await readFile(filePath, "utf8");
			const parsed = JSON.parse(content);

			assert.deepStrictEqual(parsed, data);
		});

		it("handles arrays", async () => {
			const filePath = join(tempDir, "array.json");
			const data = [1, 2, 3, "four", { five: 5 }];

			await atomicWriteJson(filePath, data);

			const content = await readFile(filePath, "utf8");
			const parsed = JSON.parse(content);

			assert.deepStrictEqual(parsed, data);
		});

		it("handles null and primitive values", async () => {
			const filePath1 = join(tempDir, "null.json");
			const filePath2 = join(tempDir, "number.json");
			const filePath3 = join(tempDir, "string.json");
			const filePath4 = join(tempDir, "boolean.json");

			await atomicWriteJson(filePath1, null);
			await atomicWriteJson(filePath2, 42);
			await atomicWriteJson(filePath3, "hello");
			await atomicWriteJson(filePath4, true);

			assert.strictEqual(await readFile(filePath1, "utf8"), "null");
			assert.strictEqual(await readFile(filePath2, "utf8"), "42");
			assert.strictEqual(await readFile(filePath3, "utf8"), '"hello"');
			assert.strictEqual(await readFile(filePath4, "utf8"), "true");
		});

		it("handles unicode characters", async () => {
			const filePath = join(tempDir, "unicode.json");
			const data = {
				english: "Hello",
				chinese: "你好",
				emoji: "👋🌍",
			};

			await atomicWriteJson(filePath, data);

			const content = await readFile(filePath, "utf8");
			const parsed = JSON.parse(content);

			assert.deepStrictEqual(parsed, data);
		});

		it("creates parent directories", async () => {
			const filePath = join(tempDir, "nested", "data.json");
			const data = { test: "value" };

			await atomicWriteJson(filePath, data);

			const content = await readFile(filePath, "utf8");
			const parsed = JSON.parse(content);

			assert.deepStrictEqual(parsed, data);
		});

		it("overwrites existing JSON file", async () => {
			const filePath = join(tempDir, "test.json");
			const oldData = { old: "value" };
			const newData = { new: "value" };

			await atomicWriteJson(filePath, oldData);
			await atomicWriteJson(filePath, newData);

			const content = await readFile(filePath, "utf8");
			const parsed = JSON.parse(content);

			assert.deepStrictEqual(parsed, newData);
		});
	});
});
