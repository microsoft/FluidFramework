/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { fluidHandleSymbol, type IFluidHandle } from "@fluidframework/core-interfaces";
import type { IContainerRuntimeBase } from "@fluidframework/runtime-definitions/internal";

import {
	getDataStorePackagePath,
	isFluidHandle,
	lookupTemporaryBlobStorageId,
} from "../handles.js";

describe("Handles", () => {
	it("isFluidHandle", () => {
		assert(!isFluidHandle(0));
		assert(!isFluidHandle({}));
		assert(!isFluidHandle(undefined));
		// eslint-disable-next-line unicorn/no-null -- We want to explicitly test for null
		assert(!isFluidHandle(null));
		assert(!isFluidHandle([]));
		assert(!isFluidHandle({ get: () => {} }));
		assert(!isFluidHandle({ IFluidHandle: 5, get: () => {} }));

		// Legacy non-symbol-based handles are not recognized.
		const loopy = { IFluidHandle: {} };
		loopy.IFluidHandle = loopy;
		assert(!isFluidHandle(loopy));
		assert(!isFluidHandle({ IFluidHandle: 5 }));
		assert(!isFluidHandle({ IFluidHandle: {} }));
		// eslint-disable-next-line unicorn/no-null -- We want to explicitly test for null
		assert(!isFluidHandle({ IFluidHandle: null }));

		// Symbol based:
		assert(isFluidHandle({ [fluidHandleSymbol]: {} }));
	});

	describe("getDataStorePackagePath", () => {
		it("forwards the handle's absolute path without resolving the handle", async () => {
			const paths: string[] = [];
			const runtime = {
				getDataStorePackagePath: async (path: string) => {
					paths.push(path);
					return path === "/store/dds" ? ["store-package", "nested-package"] : undefined;
				},
			} as unknown as IContainerRuntimeBase;
			const handle = {
				[fluidHandleSymbol]: {
					absolutePath: "/store/dds",
					[fluidHandleSymbol]: {},
				},
				get: () => {
					throw new Error("The handle should not be resolved");
				},
			} as unknown as IFluidHandle;
			const missingHandle = {
				[fluidHandleSymbol]: {
					absolutePath: "/missing",
					[fluidHandleSymbol]: {},
				},
			} as unknown as IFluidHandle;

			assert.deepEqual(await getDataStorePackagePath(runtime, handle), [
				"store-package",
				"nested-package",
			]);
			assert.equal(await getDataStorePackagePath(runtime, missingHandle), undefined);
			assert.deepEqual(paths, ["/store/dds", "/missing"]);
		});

		it("rejects invalid handles", async () => {
			const runtime = {
				getDataStorePackagePath: async () => ["store-package"],
			} as unknown as IContainerRuntimeBase;

			await assert.rejects(getDataStorePackagePath(runtime, {} as unknown as IFluidHandle), {
				name: "TypeError",
				message: "Invalid IFluidHandle",
			});
		});

		it("rejects runtimes without the internal package path lookup", async () => {
			const runtime = {} as unknown as IContainerRuntimeBase;
			const handle = {
				[fluidHandleSymbol]: {
					absolutePath: "/store/dds",
					[fluidHandleSymbol]: {},
				},
			} as unknown as IFluidHandle;

			await assert.rejects(getDataStorePackagePath(runtime, handle), {
				name: "TypeError",
				message: "Container runtime does not support data store package path lookup",
			});
		});
	});

	describe("lookupTemporaryBlobStorageId", () => {
		// Helper to create a mock handle
		function createMockHandle(absolutePath?: string): IFluidHandle {
			return {
				[fluidHandleSymbol]: {
					absolutePath,
					[fluidHandleSymbol]: {},
				},
			} as unknown as IFluidHandle;
		}

		it("throws error for non-blob handles", () => {
			const mockRuntime = {
				lookupTemporaryBlobStorageId: () => "storage-id-123",
			} as unknown as IContainerRuntime;

			const nonBlobHandle = createMockHandle("/non-blob/path");

			assert.throws(() => {
				lookupTemporaryBlobStorageId(mockRuntime, nonBlobHandle);
			}, /Handle does not point to a blob/);
		});

		it("throws error for invalid blob handle path", () => {
			const mockRuntime = {
				lookupTemporaryBlobStorageId: () => "storage-id-123",
			} as unknown as IContainerRuntime;

			const invalidHandle = createMockHandle("/_blobs/");

			assert.throws(() => {
				lookupTemporaryBlobStorageId(mockRuntime, invalidHandle);
			}, /Invalid blob handle path format/);
		});

		it("returns storage ID for valid blob handle", () => {
			const expectedStorageId = "storage-id-123";
			const mockRuntime = {
				lookupTemporaryBlobStorageId: (localId: string) => {
					assert.strictEqual(localId, "test-local-id");
					return expectedStorageId;
				},
			} as unknown as IContainerRuntime;

			const blobHandle = createMockHandle("/_blobs/test-local-id");

			const result = lookupTemporaryBlobStorageId(mockRuntime, blobHandle);
			assert.strictEqual(result, expectedStorageId);
		});

		it("returns undefined when runtime returns undefined", () => {
			const mockRuntime = {
				lookupTemporaryBlobStorageId: () => undefined,
			} as unknown as IContainerRuntime;

			const blobHandle = createMockHandle("/_blobs/pending-blob-id");

			const result = lookupTemporaryBlobStorageId(mockRuntime, blobHandle);
			assert.strictEqual(result, undefined);
		});
	});
});
