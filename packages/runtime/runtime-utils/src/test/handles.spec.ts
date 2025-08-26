/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { fluidHandleSymbol } from "@fluidframework/core-interfaces";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";

import { isFluidHandle, lookupBlobStorageId } from "../handles.js";

describe("Handles", () => {
	it("isFluidHandle", () => {
		assert(!isFluidHandle(0));
		assert(!isFluidHandle({}));
		assert(!isFluidHandle(undefined));
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
		assert(!isFluidHandle({ IFluidHandle: null }));

		// Symbol based:
		assert(isFluidHandle({ [fluidHandleSymbol]: {} }));
	});

	describe("lookupBlobStorageId", () => {
		// Helper to create a mock handle
		const createMockHandle = (absolutePath: string) => {
			const mockHandleInternal = { absolutePath, [fluidHandleSymbol]: {} };
			return {
				[fluidHandleSymbol]: mockHandleInternal
			} as any;
		};

		it("throws error for non-blob handles", () => {
			const mockRuntime = {
				lookupBlobStorageId: () => "storage-id-123"
			} as unknown as IContainerRuntime;

			const nonBlobHandle = createMockHandle("/non-blob/path");

			assert.throws(() => {
				lookupBlobStorageId(mockRuntime, nonBlobHandle);
			}, /Handle does not point to a blob/);
		});

		it("throws error for invalid blob handle path", () => {
			const mockRuntime = {
				lookupBlobStorageId: () => "storage-id-123"
			} as unknown as IContainerRuntime;

			const invalidHandle = createMockHandle("/_blobs/");

			assert.throws(() => {
				lookupBlobStorageId(mockRuntime, invalidHandle);
			}, /Invalid blob handle path format/);
		});

		it("returns storage ID for valid blob handle", () => {
			const expectedStorageId = "storage-id-123";
			const mockRuntime = {
				lookupBlobStorageId: (localId: string) => {
					assert.strictEqual(localId, "test-local-id");
					return expectedStorageId;
				}
			} as unknown as IContainerRuntime;

			const blobHandle = createMockHandle("/_blobs/test-local-id");

			const result = lookupBlobStorageId(mockRuntime, blobHandle);
			assert.strictEqual(result, expectedStorageId);
		});

		it("returns undefined when runtime returns undefined", () => {
			const mockRuntime = {
				lookupBlobStorageId: () => undefined
			} as unknown as IContainerRuntime;

			const blobHandle = createMockHandle("/_blobs/pending-blob-id");

			const result = lookupBlobStorageId(mockRuntime, blobHandle);
			assert.strictEqual(result, undefined);
		});
	});
});
