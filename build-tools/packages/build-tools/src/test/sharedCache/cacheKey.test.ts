/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import {
	computeCacheKey,
	hashContent,
	shortCacheKey,
	verifyCacheKey,
} from "../../fluidBuild/sharedCache/cacheKey";
import type { CacheKeyInputs } from "../../fluidBuild/sharedCache/types";

describe("Cache Key", () => {
	describe("computeCacheKey", () => {
		const baseInputs: CacheKeyInputs = {
			packageName: "@fluidframework/build-tools",
			taskName: "compile",
			executable: "tsc",
			command: "tsc --build",
			inputHashes: [
				{ path: "src/index.ts", hash: "abc123" },
				{ path: "src/util.ts", hash: "def456" },
			],
			cacheSchemaVersion: 1,
			nodeVersion: "v20.15.1",
			arch: "x64",
			platform: "linux",
			lockfileHash: "lock123",
		};

		it("produces a 64-character hex string", () => {
			const key = computeCacheKey(baseInputs);
			assert.strictEqual(key.length, 64);
			assert.match(key, /^[0-9a-f]{64}$/);
		});

		it("is deterministic - same inputs produce same key", () => {
			const key1 = computeCacheKey(baseInputs);
			const key2 = computeCacheKey(baseInputs);
			assert.strictEqual(key1, key2);
		});

		it("changes when package name changes", () => {
			const key1 = computeCacheKey(baseInputs);
			const key2 = computeCacheKey({
				...baseInputs,
				packageName: "@fluidframework/different-package",
			});
			assert.notStrictEqual(key1, key2);
		});

		it("changes when task name changes", () => {
			const key1 = computeCacheKey(baseInputs);
			const key2 = computeCacheKey({ ...baseInputs, taskName: "build" });
			assert.notStrictEqual(key1, key2);
		});

		it("changes when command changes", () => {
			const key1 = computeCacheKey(baseInputs);
			const key2 = computeCacheKey({ ...baseInputs, command: "tsc --build --force" });
			assert.notStrictEqual(key1, key2);
		});

		it("changes when input file hash changes", () => {
			const key1 = computeCacheKey(baseInputs);
			const key2 = computeCacheKey({
				...baseInputs,
				inputHashes: [
					{ path: "src/index.ts", hash: "abc123" },
					{ path: "src/util.ts", hash: "different-hash" }, // Changed
				],
			});
			assert.notStrictEqual(key1, key2);
		});

		it("changes when input file path changes", () => {
			const key1 = computeCacheKey(baseInputs);
			const key2 = computeCacheKey({
				...baseInputs,
				inputHashes: [
					{ path: "src/index.ts", hash: "abc123" },
					{ path: "src/different.ts", hash: "def456" }, // Changed path
				],
			});
			assert.notStrictEqual(key1, key2);
		});

		it("changes when Node version changes", () => {
			const key1 = computeCacheKey(baseInputs);
			const key2 = computeCacheKey({ ...baseInputs, nodeVersion: "v22.0.0" });
			assert.notStrictEqual(key1, key2);
		});

		it("changes when platform changes", () => {
			const key1 = computeCacheKey(baseInputs);
			const key2 = computeCacheKey({ ...baseInputs, platform: "win32" });
			assert.notStrictEqual(key1, key2);
		});

		it("changes when lockfile hash changes", () => {
			const key1 = computeCacheKey(baseInputs);
			const key2 = computeCacheKey({ ...baseInputs, lockfileHash: "different-lock" });
			assert.notStrictEqual(key1, key2);
		});

		it("is order-independent for input hashes", () => {
			const key1 = computeCacheKey({
				...baseInputs,
				inputHashes: [
					{ path: "src/index.ts", hash: "abc123" },
					{ path: "src/util.ts", hash: "def456" },
				],
			});
			const key2 = computeCacheKey({
				...baseInputs,
				inputHashes: [
					{ path: "src/util.ts", hash: "def456" }, // Swapped order
					{ path: "src/index.ts", hash: "abc123" },
				],
			});
			assert.strictEqual(key1, key2);
		});

		it("is order-independent for config hashes", () => {
			const key1 = computeCacheKey({
				...baseInputs,
				configHashes: { "tsconfig.json": "abc", ".eslintrc": "def" },
			});
			const key2 = computeCacheKey({
				...baseInputs,
				configHashes: { ".eslintrc": "def", "tsconfig.json": "abc" }, // Swapped order
			});
			assert.strictEqual(key1, key2);
		});

		it("handles optional tool version", () => {
			const key1 = computeCacheKey(baseInputs);
			const key2 = computeCacheKey({ ...baseInputs, toolVersion: "5.3.0" });
			assert.notStrictEqual(key1, key2);
		});

		it("handles optional config hashes", () => {
			const key1 = computeCacheKey(baseInputs);
			const key2 = computeCacheKey({
				...baseInputs,
				configHashes: { "tsconfig.json": "abc123" },
			});
			assert.notStrictEqual(key1, key2);
		});

		it("handles empty input hashes", () => {
			const key = computeCacheKey({ ...baseInputs, inputHashes: [] });
			assert.strictEqual(key.length, 64);
		});
	});

	describe("verifyCacheKey", () => {
		const baseInputs: CacheKeyInputs = {
			packageName: "@fluidframework/build-tools",
			taskName: "compile",
			executable: "tsc",
			command: "tsc --build",
			inputHashes: [{ path: "src/index.ts", hash: "abc123" }],
			cacheSchemaVersion: 1,
			nodeVersion: "v20.15.1",
			arch: "x64",
			platform: "linux",
			lockfileHash: "lock123",
		};

		it("returns true when cache key matches inputs", () => {
			const key = computeCacheKey(baseInputs);
			assert.strictEqual(verifyCacheKey(key, baseInputs), true);
		});

		it("returns false when cache key doesn't match inputs", () => {
			const key = computeCacheKey(baseInputs);
			const differentInputs = { ...baseInputs, taskName: "build" };
			assert.strictEqual(verifyCacheKey(key, differentInputs), false);
		});

		it("returns false for completely invalid key", () => {
			const invalidKey = "not-a-valid-key";
			assert.strictEqual(verifyCacheKey(invalidKey, baseInputs), false);
		});
	});

	describe("shortCacheKey", () => {
		it("returns first 12 characters", () => {
			const key = "abcdef1234567890".repeat(4);
			const short = shortCacheKey(key);
			assert.strictEqual(short, "abcdef123456");
			assert.strictEqual(short.length, 12);
		});

		it("handles short inputs", () => {
			const key = "abc123";
			const short = shortCacheKey(key);
			assert.strictEqual(short, "abc123");
		});
	});

	describe("hashContent", () => {
		it("produces consistent hash for same content", () => {
			const content = "hello world";
			const hash1 = hashContent(content);
			const hash2 = hashContent(content);
			assert.strictEqual(hash1, hash2);
		});

		it("produces different hashes for different content", () => {
			const hash1 = hashContent("hello");
			const hash2 = hashContent("world");
			assert.notStrictEqual(hash1, hash2);
		});

		it("produces 64-character hex string", () => {
			const hash = hashContent("test");
			assert.strictEqual(hash.length, 64);
			assert.match(hash, /^[0-9a-f]{64}$/);
		});

		it("handles empty string", () => {
			const hash = hashContent("");
			assert.strictEqual(hash.length, 64);
		});

		it("handles unicode content", () => {
			const hash = hashContent("Hello 世界 🌍");
			assert.strictEqual(hash.length, 64);
		});
	});
});
