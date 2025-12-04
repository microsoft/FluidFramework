/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "chai";
import { zipSync } from "fflate";
import { Readable } from "stream";
import { unzipStream } from "../../dist/utilities/unzipStream";

/**
 * Helper to create a readable stream from a buffer
 */
function bufferToStream(buffer: Buffer): NodeJS.ReadableStream {
	const stream = new Readable();
	stream.push(buffer);
	stream.push(null);
	return stream;
}

/**
 * Helper to create a zip file with test content
 */
function createZipFile(files: Record<string, string | Buffer>): Buffer {
	const zipContents: Record<string, Uint8Array> = {};
	for (const [path, content] of Object.entries(files)) {
		if (typeof content === "string") {
			zipContents[path] = new TextEncoder().encode(content);
		} else {
			zipContents[path] = content;
		}
	}
	const zipped = zipSync(zipContents);
	return Buffer.from(zipped);
}

describe("unzipStream", () => {
	describe("basic extraction", () => {
		it("should extract a simple zip file with one file", async () => {
			const testContent = "Hello, World!";
			const zipBuffer = createZipFile({ "test.txt": testContent });
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream);

			assert.strictEqual(result.size, 1, "Should have exactly one file");
			assert.isTrue(result.has("test.txt"), "Should contain test.txt");
			const content = result.get("test.txt");
			assert.isDefined(content, "File content should be defined");
			assert.strictEqual(
				content!.toString("utf-8"),
				testContent,
				"Content should match original",
			);
		});

		it("should extract a zip file with multiple files", async () => {
			const files = {
				"file1.txt": "Content 1",
				"file2.txt": "Content 2",
				"file3.txt": "Content 3",
			};
			const zipBuffer = createZipFile(files);
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream);

			assert.strictEqual(result.size, 3, "Should have three files");
			for (const [path, expectedContent] of Object.entries(files)) {
				assert.isTrue(result.has(path), `Should contain ${path}`);
				const content = result.get(path);
				assert.isDefined(content, `Content of ${path} should be defined`);
				assert.strictEqual(
					content!.toString("utf-8"),
					expectedContent,
					`Content of ${path} should match`,
				);
			}
		});

		it("should extract nested directory structures", async () => {
			const files = {
				"dir1/file1.txt": "File in dir1",
				"dir1/dir2/file2.txt": "File in nested dir",
				"dir3/file3.txt": "File in dir3",
				"root.txt": "File at root",
			};
			const zipBuffer = createZipFile(files);
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream);

			assert.strictEqual(result.size, 4, "Should have four files");
			for (const [path, expectedContent] of Object.entries(files)) {
				assert.isTrue(result.has(path), `Should contain ${path}`);
				const content = result.get(path);
				assert.strictEqual(
					content!.toString("utf-8"),
					expectedContent,
					`Content of ${path} should match`,
				);
			}
		});
	});

	describe("filtering with baseFolder", () => {
		it("should filter files by baseFolder prefix", async () => {
			const files = {
				"folder/file1.txt": "Content 1",
				"folder/file2.txt": "Content 2",
				"other/file3.txt": "Content 3",
			};
			const zipBuffer = createZipFile(files);
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream, "folder");

			assert.strictEqual(result.size, 2, "Should have two files from folder");
			assert.isTrue(result.has("file1.txt"), "Should contain file1.txt without folder prefix");
			assert.isTrue(result.has("file2.txt"), "Should contain file2.txt without folder prefix");
			assert.isFalse(
				result.has("file3.txt"),
				"Should not contain file3.txt from other folder",
			);
		});

		it("should strip baseFolder prefix from returned paths", async () => {
			const files = {
				"my-artifact/stats.json": '{"webpack": "stats"}',
				"my-artifact/bundle.js": "console.log('hello');",
			};
			const zipBuffer = createZipFile(files);
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream, "my-artifact");

			assert.strictEqual(result.size, 2, "Should have two files");
			assert.isTrue(result.has("stats.json"), "Should have stats.json without prefix");
			assert.isTrue(result.has("bundle.js"), "Should have bundle.js without prefix");
			assert.isFalse(result.has("my-artifact/stats.json"), "Should not have prefixed path");
		});

		it("should handle nested folders with baseFolder", async () => {
			const files = {
				"base/sub1/file1.txt": "Content 1",
				"base/sub2/file2.txt": "Content 2",
				"other/file3.txt": "Content 3",
			};
			const zipBuffer = createZipFile(files);
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream, "base");

			assert.strictEqual(result.size, 2, "Should have two files from base folder");
			assert.isTrue(result.has("sub1/file1.txt"), "Should preserve nested structure");
			assert.isTrue(result.has("sub2/file2.txt"), "Should preserve nested structure");
		});

		it("should return empty map when baseFolder doesn't exist", async () => {
			const files = {
				"folder1/file1.txt": "Content 1",
				"folder2/file2.txt": "Content 2",
			};
			const zipBuffer = createZipFile(files);
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream, "nonexistent");

			assert.strictEqual(result.size, 0, "Should have no files");
		});
	});

	describe("lazy decompression", () => {
		it("should support Map interface methods", async () => {
			const files = {
				"file1.txt": "Content 1",
				"file2.txt": "Content 2",
				"file3.txt": "Content 3",
			};
			const zipBuffer = createZipFile(files);
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream);

			// Test keys()
			const keys = Array.from(result.keys()).sort();
			assert.deepStrictEqual(
				keys,
				["file1.txt", "file2.txt", "file3.txt"],
				"keys() should return all file names",
			);

			// Test values()
			const values = Array.from(result.values());
			assert.strictEqual(values.length, 3, "values() should return all file contents");
			for (const value of values) {
				assert.instanceOf(value, Buffer, "Each value should be a Buffer");
			}

			// Test entries()
			const entries = Array.from(result.entries());
			assert.strictEqual(entries.length, 3, "entries() should return all key-value pairs");
			for (const [key, value] of entries) {
				assert.isString(key, "Entry key should be a string");
				assert.instanceOf(value, Buffer, "Entry value should be a Buffer");
			}

			// Test has()
			assert.isTrue(result.has("file1.txt"), "has() should return true for existing file");
			assert.isFalse(
				result.has("nonexistent.txt"),
				"has() should return false for non-existing file",
			);

			// Test get()
			assert.isDefined(
				result.get("file1.txt"),
				"get() should return buffer for existing file",
			);
			assert.isUndefined(
				result.get("nonexistent.txt"),
				"get() should return undefined for non-existing file",
			);

			// Test size
			assert.strictEqual(result.size, 3, "size should return correct count");
		});

		it("should cache decompressed files on subsequent access", async () => {
			const testContent = "Test content for caching";
			const zipBuffer = createZipFile({ "test.txt": testContent });
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream);

			// First access
			const buffer1 = result.get("test.txt");
			// Second access - should return the same buffer instance if cached
			const buffer2 = result.get("test.txt");

			assert.strictEqual(buffer1, buffer2, "Should return the same buffer instance (cached)");
		});

		it("should handle iteration correctly", async () => {
			const files = {
				"a.txt": "A",
				"b.txt": "B",
				"c.txt": "C",
			};
			const zipBuffer = createZipFile(files);
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream);

			// Test for...of iteration
			const collected: Array<[string, Buffer]> = [];
			for (const entry of result) {
				collected.push(entry);
			}

			assert.strictEqual(collected.length, 3, "Should iterate over all entries");
			for (const [key, value] of collected) {
				assert.isTrue(result.has(key), `Iterated key ${key} should exist in map`);
				assert.instanceOf(value, Buffer, "Iterated value should be a Buffer");
			}
		});

		it("should decompress files only when accessed", async () => {
			const files = {
				"file1.txt": "A".repeat(1000),
				"file2.txt": "B".repeat(1000),
				"file3.txt": "C".repeat(1000),
			};
			const zipBuffer = createZipFile(files);
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream);

			// Map should know about all files without decompressing them
			assert.strictEqual(result.size, 3, "Should know size without decompression");
			assert.isTrue(result.has("file1.txt"), "Should know file1 exists");
			assert.isTrue(result.has("file2.txt"), "Should know file2 exists");
			assert.isTrue(result.has("file3.txt"), "Should know file3 exists");

			// Access only one file
			const content1 = result.get("file1.txt");
			assert.isDefined(content1, "Should decompress when accessed");
			assert.strictEqual(content1!.toString("utf-8"), "A".repeat(1000));

			// Other files should still be accessible
			const content2 = result.get("file2.txt");
			assert.strictEqual(content2!.toString("utf-8"), "B".repeat(1000));
		});

		it("should handle forEach iteration", async () => {
			const files = {
				"file1.txt": "Content 1",
				"file2.txt": "Content 2",
			};
			const zipBuffer = createZipFile(files);
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream);

			const collected: Array<[Buffer, string, Map<string, Buffer>]> = [];
			result.forEach((value, key, map) => {
				collected.push([value, key, map]);
			});

			assert.strictEqual(collected.length, 2, "forEach should visit all entries");
			for (const [value, key, map] of collected) {
				assert.instanceOf(value, Buffer, "Value should be a Buffer");
				assert.isString(key, "Key should be a string");
				assert.strictEqual(map, result, "Map should be the result object");
			}
		});
	});

	describe("binary content handling", () => {
		it("should correctly handle binary content", async () => {
			const binaryContent = Buffer.from([0x00, 0x01, 0xff, 0x7f, 0x80, 0xab, 0xcd, 0xef]);
			const zipBuffer = createZipFile({ "binary.bin": binaryContent });
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream);

			assert.strictEqual(result.size, 1, "Should have one file");
			const extractedContent = result.get("binary.bin");
			assert.isDefined(extractedContent, "Binary content should be defined");
			assert.deepStrictEqual(
				extractedContent,
				binaryContent,
				"Binary content should match exactly",
			);
		});

		it("should handle large file content", async () => {
			const largeContent = Buffer.alloc(100 * 1024, "x"); // 100KB
			const zipBuffer = createZipFile({ "large.txt": largeContent });
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream);

			assert.strictEqual(result.size, 1, "Should have one file");
			const extractedContent = result.get("large.txt");
			assert.isDefined(extractedContent, "Large content should be defined");
			assert.strictEqual(
				extractedContent!.length,
				largeContent.length,
				"Large content should have correct length",
			);
		});
	});

	describe("edge cases", () => {
		it("should handle empty zip file", async () => {
			const emptyZip = zipSync({});
			const zipBuffer = Buffer.from(emptyZip);
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream);

			assert.strictEqual(result.size, 0, "Should have zero files");
		});

		it("should handle files with special characters in names", async () => {
			const files = {
				"file with spaces.txt": "Content 1",
				"file-with-dashes.txt": "Content 2",
				"file_with_underscores.txt": "Content 3",
				"file.multiple.dots.txt": "Content 4",
			};
			const zipBuffer = createZipFile(files);
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream);

			assert.strictEqual(result.size, 4, "Should have four files");
			for (const [path, expectedContent] of Object.entries(files)) {
				assert.isTrue(result.has(path), `Should contain ${path}`);
				assert.strictEqual(result.get(path)!.toString("utf-8"), expectedContent);
			}
		});

		it("should handle empty files", async () => {
			const files = {
				"empty.txt": "",
				"nonempty.txt": "content",
			};
			const zipBuffer = createZipFile(files);
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream);

			assert.strictEqual(result.size, 2, "Should have two files");
			assert.strictEqual(
				result.get("empty.txt")!.length,
				0,
				"Empty file should have zero length",
			);
			assert.isTrue(
				result.get("nonempty.txt")!.length > 0,
				"Non-empty file should have content",
			);
		});
	});

	describe("error handling", () => {
		it("should reject with error for invalid zip data", async () => {
			const invalidZip = Buffer.from("This is not a valid zip file");
			const stream = bufferToStream(invalidZip);

			try {
				await unzipStream(stream);
				assert.fail("Should have thrown an error");
			} catch (error) {
				assert.isDefined(error, "Should throw an error for invalid zip data");
			}
		});
	});

	describe("real-world scenarios", () => {
		it("should handle webpack stats file extraction scenario", async () => {
			const statsContent = JSON.stringify({
				chunks: [{ id: 1, files: ["bundle.js"] }],
				assets: [{ name: "bundle.js", size: 12345 }],
			});
			const files = {
				"bundleAnalysis/stats.json": statsContent,
				"bundleAnalysis/bundle.js": "console.log('test');",
				"other/file.txt": "ignored",
			};
			const zipBuffer = createZipFile(files);
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream, "bundleAnalysis");

			assert.strictEqual(result.size, 2, "Should extract only bundleAnalysis folder");
			assert.isTrue(result.has("stats.json"), "Should have stats.json");
			const extractedStats = JSON.parse(result.get("stats.json")!.toString("utf-8"));
			assert.strictEqual(
				extractedStats.chunks[0].id,
				1,
				"Should correctly parse extracted JSON",
			);
		});

		it("should iterate files for bundle buddy path extraction", async () => {
			const files = {
				"artifact/bundle1/stats.json": '{"name": "bundle1"}',
				"artifact/bundle2/stats.json": '{"name": "bundle2"}',
				"artifact/bundle3/stats.json": '{"name": "bundle3"}',
			};
			const zipBuffer = createZipFile(files);
			const stream = bufferToStream(zipBuffer);

			const result = await unzipStream(stream, "artifact");

			// Simulate how getBundlePathsFromZipObject uses the result
			const relativePaths: string[] = [...result.keys()];

			assert.strictEqual(relativePaths.length, 3, "Should get all relative paths");
			assert.isTrue(
				relativePaths.every((path) => path.includes("stats.json")),
				"All paths should be stats files",
			);
			assert.isTrue(
				relativePaths.every((path) => !path.startsWith("artifact/")),
				"Paths should not include the artifact prefix",
			);
		});
	});
});
