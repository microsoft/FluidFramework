/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";
import type { Request } from "express";
import {
	Constants,
	getRepoManagerParamsFromRequest,
	getRepositoryRoot,
	getRepoPath,
	sizeof,
} from "../utils";

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

	describe("authorized repository root", () => {
		const physicalContainerName = "pd2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

		function createRequest(headers: Record<string, string | undefined>): Request {
			return {
				params: {
					owner: "owner",
					repo: "repository",
				},
				get: (name: string) => headers[name],
			} as unknown as Request;
		}

		it("uses an authorized physical container when all proof headers are valid", () => {
			const params = getRepoManagerParamsFromRequest(
				createRequest({
					[Constants.StorageRoutingIdHeader]: "tenant:document",
					[Constants.DocumentContainerNameHeader]: physicalContainerName,
					[Constants.DocumentStorageLayoutHeader]: "v2",
					[Constants.DocumentLifecycleVersionHeader]: "generation-1",
				}),
			);

			assert.strictEqual(getRepositoryRoot(params), `${physicalContainerName}/document`);
			assert.deepStrictEqual(params.fileSystemManagerParams, {
				storageName: undefined,
				simplifiedCustomData: undefined,
				physicalContainerName,
				storageLayoutVersion: "v2",
				storageLifecycleVersion: "generation-1",
			});
		});

		for (const invalidPhysicalContainerName of [
			"../victim",
			"victim/path",
			"victim\\path",
			"victim%2fpath",
			"victim%5cpath",
			"ab",
			"-victim",
			"victim-",
			"victim--container",
			"Victim",
		]) {
			it(`rejects invalid physical container ${invalidPhysicalContainerName}`, () => {
				assert.throws(
					() =>
						getRepositoryRoot(
							getRepoManagerParamsFromRequest(
								createRequest({
									[Constants.StorageRoutingIdHeader]: "tenant:document",
									[Constants.DocumentContainerNameHeader]:
										invalidPhysicalContainerName,
									[Constants.DocumentStorageLayoutHeader]: "v2",
									[Constants.DocumentLifecycleVersionHeader]: "generation-1",
								}),
							),
						),
					/Invalid physical container name/,
				);
			});
		}

		for (const testCase of [
			{
				name: "missing physical container",
				headers: {
					[Constants.DocumentStorageLayoutHeader]: "v2",
					[Constants.DocumentLifecycleVersionHeader]: "generation-1",
				},
			},
			{
				name: "missing storage layout",
				headers: {
					[Constants.DocumentContainerNameHeader]: physicalContainerName,
					[Constants.DocumentLifecycleVersionHeader]: "generation-1",
				},
			},
			{
				name: "invalid storage layout",
				headers: {
					[Constants.DocumentContainerNameHeader]: physicalContainerName,
					[Constants.DocumentStorageLayoutHeader]: "v3",
					[Constants.DocumentLifecycleVersionHeader]: "generation-1",
				},
			},
			{
				name: "missing lifecycle version",
				headers: {
					[Constants.DocumentContainerNameHeader]: physicalContainerName,
					[Constants.DocumentStorageLayoutHeader]: "v2",
				},
			},
		]) {
			it(`rejects ${testCase.name} proof headers`, () => {
				assert.throws(
					() =>
						getRepositoryRoot(
							getRepoManagerParamsFromRequest(
								createRequest({
									[Constants.StorageRoutingIdHeader]: "tenant:document",
									...testCase.headers,
								}),
							),
						),
					/Invalid document storage proof headers/,
				);
			});
		}

		it("preserves the tenant-qualified root when proof headers are absent", () => {
			const params = getRepoManagerParamsFromRequest(
				createRequest({
					[Constants.StorageRoutingIdHeader]: "tenant:document",
				}),
			);

			assert.strictEqual(getRepositoryRoot(params), "tenant/document");
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
