/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { fluidHandleSymbol, type IFluidHandle } from "@fluidframework/core-interfaces";

import { isFluidHandle, lookupTemporaryBlobStorageId } from "../handles.js";

describe("Handles", () => {
	it("encodeCompactIdToString() with strings", () => {
		it("isFluidHandle", () => {
			assert(!isFluidHandle(0));
			assert(!isFluidHandle({}));
			assert(!isFluidHandle(undefined));
			// eslint-disable-next-line unicorn/no-null -- We want to explicitly test for null
			assert(!isFluidHandle(null));
			assert(!isFluidHandle([]));
			assert(!isFluidHandle({ get: () => {} }));
			assert(!isFluidHandle({ IFluidHandle: 5, get: () => {} }));

			// Legacy compatibility for non symbol based handle
			const loopy = { IFluidHandle: {} };
			loopy.IFluidHandle = loopy;
			assert(isFluidHandle(loopy));
			assert(!isFluidHandle({ IFluidHandle: 5 }));
			assert(!isFluidHandle({ IFluidHandle: {} }));
			// eslint-disable-next-line unicorn/no-null -- We want to explicitly test for null
			assert(!isFluidHandle({ IFluidHandle: null }));

			// Symbol based:
			assert(isFluidHandle({ [fluidHandleSymbol]: {} }));
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
