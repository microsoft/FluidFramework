/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createManifest,
	readManifest,
	updateManifestAccessTime,
	writeManifest,
} from "../../fluidBuild/sharedCache/manifest";
import type { CacheManifest } from "../../fluidBuild/sharedCache/types";

describe("Manifest", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "manifest-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("createManifest", () => {
		it("creates a valid manifest with all required fields", () => {
			const manifest = createManifest({
				cacheKey: "abc123",
				packageName: "@fluidframework/build-tools",
				taskName: "compile",
				executable: "tsc",
				command: "tsc --build",
				exitCode: 0,
				executionTimeMs: 1234,
				cacheSchemaVersion: 1,
				nodeVersion: "v20.15.1",
				arch: "x64",
				platform: "linux",
				lockfileHash: "lock123",
				inputFiles: [{ path: "src/index.ts", hash: "hash1" }],
				outputFiles: [{ path: "dist/index.js", hash: "hash2", size: 1024 }],
				stdout: "Compilation successful",
				stderr: "",
			});

			assert.strictEqual(manifest.version, 1);
			assert.strictEqual(manifest.cacheKey, "abc123");
			assert.strictEqual(manifest.packageName, "@fluidframework/build-tools");
			assert.strictEqual(manifest.taskName, "compile");
			assert.strictEqual(manifest.executable, "tsc");
			assert.strictEqual(manifest.command, "tsc --build");
			assert.strictEqual(manifest.exitCode, 0);
			assert.strictEqual(manifest.executionTimeMs, 1234);
			assert.strictEqual(manifest.nodeVersion, "v20.15.1");
			assert.strictEqual(manifest.platform, "linux");
			assert.strictEqual(manifest.lockfileHash, "lock123");
			assert.strictEqual(manifest.inputFiles.length, 1);
			assert.strictEqual(manifest.outputFiles.length, 1);
			assert.strictEqual(manifest.stdout, "Compilation successful");
			assert.strictEqual(manifest.stderr, "");
			assert.ok(manifest.createdAt);
			assert.ok(manifest.lastAccessedAt);
		});

		it("sets createdAt and lastAccessedAt to same value", () => {
			const manifest = createManifest({
				cacheKey: "abc123",
				packageName: "@fluidframework/build-tools",
				taskName: "compile",
				executable: "tsc",
				command: "tsc --build",
				exitCode: 0,
				executionTimeMs: 1234,
				cacheSchemaVersion: 1,
				nodeVersion: "v20.15.1",
				arch: "x64",
				platform: "linux",
				lockfileHash: "lock123",
				inputFiles: [],
				outputFiles: [],
				stdout: "",
				stderr: "",
			});

			assert.strictEqual(manifest.createdAt, manifest.lastAccessedAt);
		});

		it("handles empty input and output files", () => {
			const manifest = createManifest({
				cacheKey: "abc123",
				packageName: "@fluidframework/build-tools",
				taskName: "compile",
				executable: "tsc",
				command: "tsc --build",
				exitCode: 0,
				executionTimeMs: 1234,
				cacheSchemaVersion: 1,
				nodeVersion: "v20.15.1",
				arch: "x64",
				platform: "linux",
				lockfileHash: "lock123",
				inputFiles: [],
				outputFiles: [],
				stdout: "",
				stderr: "",
			});

			assert.strictEqual(manifest.inputFiles.length, 0);
			assert.strictEqual(manifest.outputFiles.length, 0);
		});

		it("handles multiple input and output files", () => {
			const manifest = createManifest({
				cacheKey: "abc123",
				packageName: "@fluidframework/build-tools",
				taskName: "compile",
				executable: "tsc",
				command: "tsc --build",
				exitCode: 0,
				executionTimeMs: 1234,
				cacheSchemaVersion: 1,
				nodeVersion: "v20.15.1",
				arch: "x64",
				platform: "linux",
				lockfileHash: "lock123",
				inputFiles: [
					{ path: "src/index.ts", hash: "hash1" },
					{ path: "src/util.ts", hash: "hash2" },
				],
				outputFiles: [
					{ path: "dist/index.js", hash: "hash3", size: 1024 },
					{ path: "dist/util.js", hash: "hash4", size: 512 },
				],
				stdout: "",
				stderr: "",
			});

			assert.strictEqual(manifest.inputFiles.length, 2);
			assert.strictEqual(manifest.outputFiles.length, 2);
		});
	});

	describe("writeManifest and readManifest", () => {
		it("successfully writes and reads a manifest", async () => {
			const manifestPath = join(tempDir, "manifest.json");
			const original = createManifest({
				cacheKey: "abc123",
				packageName: "@fluidframework/build-tools",
				taskName: "compile",
				executable: "tsc",
				command: "tsc --build",
				exitCode: 0,
				executionTimeMs: 1234,
				cacheSchemaVersion: 1,
				nodeVersion: "v20.15.1",
				arch: "x64",
				platform: "linux",
				lockfileHash: "lock123",
				inputFiles: [{ path: "src/index.ts", hash: "hash1" }],
				outputFiles: [{ path: "dist/index.js", hash: "hash2", size: 1024 }],
				stdout: "Success",
				stderr: "",
			});

			await writeManifest(manifestPath, original);
			const read = await readManifest(manifestPath);

			assert.ok(read);
			assert.deepStrictEqual(read, original);
		});

		it("returns undefined for non-existent manifest", async () => {
			const manifestPath = join(tempDir, "non-existent.json");
			const result = await readManifest(manifestPath);
			assert.strictEqual(result, undefined);
		});

		it("returns undefined for corrupt JSON", async () => {
			const manifestPath = join(tempDir, "corrupt.json");
			await writeFile(manifestPath, "{ invalid json }");
			const result = await readManifest(manifestPath);
			assert.strictEqual(result, undefined);
		});

		it("returns undefined for invalid manifest structure", async () => {
			const manifestPath = join(tempDir, "invalid.json");
			await writeFile(manifestPath, JSON.stringify({ version: 999 }));
			const result = await readManifest(manifestPath);
			assert.strictEqual(result, undefined);
		});

		it("writes manifest with pretty formatting", async () => {
			const manifestPath = join(tempDir, "manifest.json");
			const manifest = createManifest({
				cacheKey: "abc123",
				packageName: "@fluidframework/build-tools",
				taskName: "compile",
				executable: "tsc",
				command: "tsc --build",
				exitCode: 0,
				executionTimeMs: 1234,
				cacheSchemaVersion: 1,
				nodeVersion: "v20.15.1",
				arch: "x64",
				platform: "linux",
				lockfileHash: "lock123",
				inputFiles: [],
				outputFiles: [],
				stdout: "",
				stderr: "",
			});

			await writeManifest(manifestPath, manifest);
			const content = await readFile(manifestPath, "utf8");

			// Verify it's pretty-printed (contains newlines and indentation)
			assert.ok(content.includes("\n"));
			assert.ok(content.includes("  ")); // 2-space indentation
		});
	});

	describe("Manifest validation", () => {
		it("rejects manifest with missing version", async () => {
			const manifestPath = join(tempDir, "manifest.json");
			const invalid = {
				cacheKey: "abc",
			} as unknown as CacheManifest;

			await assert.rejects(async () => {
				await writeManifest(manifestPath, invalid);
			}, /missing version field/);
		});

		it("rejects manifest with unsupported version", async () => {
			const manifestPath = join(tempDir, "manifest.json");
			const manifest = createManifest({
				cacheKey: "abc123",
				packageName: "@fluidframework/build-tools",
				taskName: "compile",
				executable: "tsc",
				command: "tsc --build",
				exitCode: 0,
				executionTimeMs: 1234,
				cacheSchemaVersion: 1,
				nodeVersion: "v20.15.1",
				arch: "x64",
				platform: "linux",
				lockfileHash: "lock123",
				inputFiles: [],
				outputFiles: [],
				stdout: "",
				stderr: "",
			});
			(manifest as { version: number }).version = 999;

			await assert.rejects(async () => {
				await writeManifest(manifestPath, manifest);
			}, /Unsupported manifest version/);
		});

		it("rejects manifest with non-zero exit code", async () => {
			const manifestPath = join(tempDir, "manifest.json");
			const manifest = createManifest({
				cacheKey: "abc123",
				packageName: "@fluidframework/build-tools",
				taskName: "compile",
				executable: "tsc",
				command: "tsc --build",
				exitCode: 0,
				executionTimeMs: 1234,
				cacheSchemaVersion: 1,
				nodeVersion: "v20.15.1",
				arch: "x64",
				platform: "linux",
				lockfileHash: "lock123",
				inputFiles: [],
				outputFiles: [],
				stdout: "",
				stderr: "",
			});
			(manifest as { exitCode: number }).exitCode = 1;

			await assert.rejects(async () => {
				await writeManifest(manifestPath, manifest);
			}, /Invalid exit code/);
		});

		it("rejects manifest with negative execution time", async () => {
			const manifestPath = join(tempDir, "manifest.json");
			const manifest = createManifest({
				cacheKey: "abc123",
				packageName: "@fluidframework/build-tools",
				taskName: "compile",
				executable: "tsc",
				command: "tsc --build",
				exitCode: 0,
				executionTimeMs: 1234,
				cacheSchemaVersion: 1,
				nodeVersion: "v20.15.1",
				arch: "x64",
				platform: "linux",
				lockfileHash: "lock123",
				inputFiles: [],
				outputFiles: [],
				stdout: "",
				stderr: "",
			});
			manifest.executionTimeMs = -100;

			await assert.rejects(async () => {
				await writeManifest(manifestPath, manifest);
			}, /Invalid executionTimeMs/);
		});

		it("rejects manifest with invalid input file entry", async () => {
			const manifestPath = join(tempDir, "manifest.json");
			const manifest = createManifest({
				cacheKey: "abc123",
				packageName: "@fluidframework/build-tools",
				taskName: "compile",
				executable: "tsc",
				command: "tsc --build",
				exitCode: 0,
				executionTimeMs: 1234,
				cacheSchemaVersion: 1,
				nodeVersion: "v20.15.1",
				arch: "x64",
				platform: "linux",
				lockfileHash: "lock123",
				inputFiles: [{ path: "src/index.ts", hash: "hash1" }],
				outputFiles: [],
				stdout: "",
				stderr: "",
			});
			manifest.inputFiles = [{ path: "", hash: "" }];

			await assert.rejects(async () => {
				await writeManifest(manifestPath, manifest);
			}, /Invalid input file entry/);
		});

		it("rejects manifest with invalid output file entry", async () => {
			const manifestPath = join(tempDir, "manifest.json");
			const manifest = createManifest({
				cacheKey: "abc123",
				packageName: "@fluidframework/build-tools",
				taskName: "compile",
				executable: "tsc",
				command: "tsc --build",
				exitCode: 0,
				executionTimeMs: 1234,
				cacheSchemaVersion: 1,
				nodeVersion: "v20.15.1",
				arch: "x64",
				platform: "linux",
				lockfileHash: "lock123",
				inputFiles: [],
				outputFiles: [{ path: "dist/index.js", hash: "hash1", size: 1024 }],
				stdout: "",
				stderr: "",
			});
			manifest.outputFiles = [{ path: "dist/index.js", hash: "", size: -1 }];

			await assert.rejects(async () => {
				await writeManifest(manifestPath, manifest);
			}, /Invalid output file/);
		});

		it("rejects manifest with invalid timestamp", async () => {
			const manifestPath = join(tempDir, "manifest.json");
			const manifest = createManifest({
				cacheKey: "abc123",
				packageName: "@fluidframework/build-tools",
				taskName: "compile",
				executable: "tsc",
				command: "tsc --build",
				exitCode: 0,
				executionTimeMs: 1234,
				cacheSchemaVersion: 1,
				nodeVersion: "v20.15.1",
				arch: "x64",
				platform: "linux",
				lockfileHash: "lock123",
				inputFiles: [],
				outputFiles: [],
				stdout: "",
				stderr: "",
			});
			manifest.createdAt = "not-a-valid-date";

			await assert.rejects(async () => {
				await writeManifest(manifestPath, manifest);
			}, /Invalid createdAt timestamp/);
		});

		it("rejects manifest with non-string stdout", async () => {
			const manifestPath = join(tempDir, "manifest.json");
			const manifest = createManifest({
				cacheKey: "abc123",
				packageName: "@fluidframework/build-tools",
				taskName: "compile",
				executable: "tsc",
				command: "tsc --build",
				exitCode: 0,
				executionTimeMs: 1234,
				cacheSchemaVersion: 1,
				nodeVersion: "v20.15.1",
				arch: "x64",
				platform: "linux",
				lockfileHash: "lock123",
				inputFiles: [],
				outputFiles: [],
				stdout: "",
				stderr: "",
			});
			manifest.stdout = 123 as unknown as string;

			await assert.rejects(async () => {
				await writeManifest(manifestPath, manifest);
			}, /stdout must be a string/);
		});

		it("rejects manifest with non-string stderr", async () => {
			const manifestPath = join(tempDir, "manifest.json");
			const manifest = createManifest({
				cacheKey: "abc123",
				packageName: "@fluidframework/build-tools",
				taskName: "compile",
				executable: "tsc",
				command: "tsc --build",
				exitCode: 0,
				executionTimeMs: 1234,
				cacheSchemaVersion: 1,
				nodeVersion: "v20.15.1",
				arch: "x64",
				platform: "linux",
				lockfileHash: "lock123",
				inputFiles: [],
				outputFiles: [],
				stdout: "",
				stderr: "",
			});
			manifest.stderr = null as unknown as string;

			await assert.rejects(async () => {
				await writeManifest(manifestPath, manifest);
			}, /stderr must be a string/);
		});
	});

	describe("updateManifestAccessTime", () => {
		it("updates lastAccessedAt timestamp", async () => {
			const manifestPath = join(tempDir, "manifest.json");
			const manifest = createManifest({
				cacheKey: "abc123",
				packageName: "@fluidframework/build-tools",
				taskName: "compile",
				executable: "tsc",
				command: "tsc --build",
				exitCode: 0,
				executionTimeMs: 1234,
				cacheSchemaVersion: 1,
				nodeVersion: "v20.15.1",
				arch: "x64",
				platform: "linux",
				lockfileHash: "lock123",
				inputFiles: [],
				outputFiles: [],
				stdout: "",
				stderr: "",
			});

			await writeManifest(manifestPath, manifest);
			const originalAccessTime = manifest.lastAccessedAt;

			// Wait a bit to ensure timestamp is different
			await new Promise((resolve) => setTimeout(resolve, 10));

			await updateManifestAccessTime(manifestPath);
			const updated = await readManifest(manifestPath);

			assert.ok(updated);
			assert.notStrictEqual(updated.lastAccessedAt, originalAccessTime);
			assert.strictEqual(updated.createdAt, manifest.createdAt); // Should not change
		});

		it("throws error for non-existent manifest", async () => {
			const manifestPath = join(tempDir, "non-existent.json");

			await assert.rejects(async () => {
				await updateManifestAccessTime(manifestPath);
			}, /Failed to read manifest/);
		});
	});

	describe("writeManifest in subdirectory", () => {
		it("writes manifest to a specific file in a directory structure", async () => {
			const entryDir = join(tempDir, "cache-entry-dir");
			const manifestPath = join(entryDir, "manifest.json");
			const manifest = createManifest({
				cacheKey: "abc123",
				packageName: "@fluidframework/build-tools",
				taskName: "compile",
				executable: "tsc",
				command: "tsc --build",
				exitCode: 0,
				executionTimeMs: 1234,
				cacheSchemaVersion: 1,
				nodeVersion: "v20.15.1",
				arch: "x64",
				platform: "linux",
				lockfileHash: "lock123",
				inputFiles: [],
				outputFiles: [],
				stdout: "",
				stderr: "",
			});

			await writeManifest(manifestPath, manifest);
			const read = await readManifest(manifestPath);

			assert.ok(read);
			assert.deepStrictEqual(read, manifest);
		});
	});
});
