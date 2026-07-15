/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";
import { getRepoPath, sizeof } from "../utils";

describe("helpers", () => {
	describe("getRepoPath", () => {
		it("builds a path from valid components", () => {
			assert.strictEqual(getRepoPath("tenant", "doc"), "tenant/doc");
			assert.strictEqual(getRepoPath("tenant", "doc", "owner"), "owner/tenant/doc");
			assert.strictEqual(getRepoPath("tenant"), "tenant");
		});
		it("rejects a bare upward traversal in documentId", () => {
			// Regression: `parse("..").dir` is "", so the previous check let ".." through.
			assert.throws(() => getRepoPath("tenant", ".."), /Invalid repo name \(documentId\)/);
		});
		it("rejects a bare upward traversal in tenantId", () => {
			assert.throws(() => getRepoPath("..", "doc"), /Invalid repo name \(tenantId\)/);
		});
		it("rejects a bare upward traversal in owner", () => {
			assert.throws(() => getRepoPath("tenant", "doc", ".."), /Invalid repo owner/);
		});
		it("rejects a current-directory reference", () => {
			assert.throws(() => getRepoPath("tenant", "."), /Invalid repo name \(documentId\)/);
		});
		it("rejects separators in components", () => {
			assert.throws(() => getRepoPath("tenant", "a/b"), /Invalid repo name \(documentId\)/);
			assert.throws(() => getRepoPath("tenant", "a\\b"), /Invalid repo name \(documentId\)/);
			assert.throws(() => getRepoPath("tenant", "../x"), /Invalid repo name \(documentId\)/);
		});
		it("rejects absolute paths", () => {
			assert.throws(() => getRepoPath("tenant", "/etc"), /Invalid repo name \(documentId\)/);
		});
		it("rejects Windows-style absolute paths", () => {
			assert.throws(() => getRepoPath("tenant", "\\etc"), /Invalid repo name \(documentId\)/);
			assert.throws(
				() => getRepoPath("tenant", "C:\\etc"),
				/Invalid repo name \(documentId\)/,
			);
			assert.throws(() => getRepoPath("C:\\etc", "doc"), /Invalid repo name \(tenantId\)/);
		});
		it("rejects an empty tenantId", () => {
			assert.throws(() => getRepoPath(""), /Invalid repo name \(tenantId\)/);
		});
	});

	describe("sizeof", () => {
		const data = "Hello, World!";
		const dataSize = Buffer.byteLength(data, "utf8"); // 13 bytes

		it("should return correct size for string", () => {
			assert.strictEqual(sizeof(data), dataSize);
		});
		it("should return correct size for Buffer", () => {
			const buffer = Buffer.from(data, "utf8");
			assert.strictEqual(sizeof(buffer), dataSize);
		});
		it("should return correct size for ArrayBufferView", () => {
			const uint8Array = new Uint8Array(Buffer.from(data, "utf8"));
			assert.strictEqual(sizeof(uint8Array), dataSize);
		});
		it("should return correct size for Iterable string", () => {
			function* iterator() {
				for (const char of data) {
					yield char;
				}
			}
			const iterable = iterator();
			assert.strictEqual(sizeof(iterable), dataSize);
		});
		it("should return correct size for Iterable ArrayBufferView", () => {
			const uint8Array1 = new Uint8Array(Buffer.from(data.split(" ")[0], "utf8"));
			const uint8Array2 = new Uint8Array(Buffer.from(data.split(" ")[1], "utf8"));
			function* iterator() {
				yield uint8Array1;
				yield uint8Array2;
			}
			const iterable = iterator();
			assert.strictEqual(sizeof(iterable), dataSize - 1); // space is 1 byte
		});
	});
});
