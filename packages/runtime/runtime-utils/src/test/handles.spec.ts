/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { fluidHandleSymbol } from "@fluidframework/core-interfaces";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";

import { isFluidHandle, lookupBlobURL } from "../handles.js";

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

	describe("lookupBlobURL", () => {
		// Helper to create a mock handle
		const createMockHandle = (absolutePath: string) => {
			const mockHandleInternal = { absolutePath, [fluidHandleSymbol]: {} };
			return {
				[fluidHandleSymbol]: mockHandleInternal
			} as any;
		};

		it("throws error for non-blob handles", () => {
			const mockRuntime = {
				lookupBlobURL: () => "https://example.com/blob/url"
			} as unknown as IContainerRuntime;

			const nonBlobHandle = createMockHandle("/non-blob/path");

			assert.throws(() => {
				lookupBlobURL(mockRuntime, nonBlobHandle);
			}, /Handle does not point to a blob/);
		});

		it("throws error for invalid blob handle path", () => {
			const mockRuntime = {
				lookupBlobURL: () => "https://example.com/blob/url"
			} as unknown as IContainerRuntime;

			const invalidHandle = createMockHandle("/_blobs/");

			assert.throws(() => {
				lookupBlobURL(mockRuntime, invalidHandle);
			}, /Invalid blob handle path format/);
		});

		it("returns blob URL for valid blob handle", () => {
			const expectedUrl = "https://example.com/blobs/test-storage-id/content";
			const mockRuntime = {
				lookupBlobURL: (localId: string) => {
					assert.strictEqual(localId, "test-local-id");
					return expectedUrl;
				}
			} as unknown as IContainerRuntime;

			const blobHandle = createMockHandle("/_blobs/test-local-id");

			const result = lookupBlobURL(mockRuntime, blobHandle);
			assert.strictEqual(result, expectedUrl);
		});

		it("returns undefined when runtime returns undefined", () => {
			const mockRuntime = {
				lookupBlobURL: () => undefined
			} as unknown as IContainerRuntime;

			const blobHandle = createMockHandle("/_blobs/pending-blob-id");

			const result = lookupBlobURL(mockRuntime, blobHandle);
			assert.strictEqual(result, undefined);
		});
	});
});
