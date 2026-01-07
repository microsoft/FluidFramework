/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type {
	IDocumentStorageService,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";

import { PrefetchDocumentStorageService } from "../prefetchDocumentStorageService.js";

/**
 * Mock storage service for testing
 */
class MockStorageService implements Partial<IDocumentStorageService> {
	public readBlobCalls: string[] = [];
	public shouldFail = false;
	public failureError = new Error("Mock read failure");

	public async readBlob(blobId: string): Promise<ArrayBufferLike> {
		this.readBlobCalls.push(blobId);
		if (this.shouldFail) {
			throw this.failureError;
		}
		return new Uint8Array([1, 2, 3]).buffer;
	}

	public async getSnapshotTree(): Promise<ISnapshotTree | null> {
		return {
			blobs: {
				".metadata": "blob1",
				"header": "blob2",
				"quorumMembers": "blob3",
				"other": "blob4",
			},
			trees: {},
		};
	}

	public get policies() {
		return undefined;
	}
}

describe("PrefetchDocumentStorageService", () => {
	let mockStorage: MockStorageService;
	let prefetchService: PrefetchDocumentStorageService;

	beforeEach(() => {
		mockStorage = new MockStorageService();
		prefetchService = new PrefetchDocumentStorageService(
			mockStorage as unknown as IDocumentStorageService,
		);
	});

	afterEach(() => {
		prefetchService.stopPrefetch();
	});

	it("should propagate errors to callers who await readBlob", async () => {
		mockStorage.shouldFail = true;
		const testError = new Error("Network failure");
		mockStorage.failureError = testError;

		// Direct readBlob call should receive the error
		await assert.rejects(
			async () => prefetchService.readBlob("someBlob"),
			(error: Error) => error.message === "Network failure",
		);
	});

	it("should clear cache on retryable errors allowing retry", async () => {
		const retryableError = new Error("Retryable error");
		(retryableError as any).canRetry = true;
		mockStorage.failureError = retryableError;
		mockStorage.shouldFail = true;

		// First call fails
		await assert.rejects(async () => prefetchService.readBlob("blob1"));

		// Reset mock to succeed
		mockStorage.shouldFail = false;
		mockStorage.readBlobCalls = [];

		// Second call should retry (not use cached error)
		const result = await prefetchService.readBlob("blob1");
		assert.strictEqual(result.byteLength, 3, "Should return blob data");
		assert.strictEqual(mockStorage.readBlobCalls.length, 1);
	});

	it("should successfully prefetch blobs", async () => {
		// Trigger prefetch
		await prefetchService.getSnapshotTree();

		// Wait for prefetch
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Verify blobs were prefetched
		assert.ok(mockStorage.readBlobCalls.length > 0);

		// Clear call tracking
		mockStorage.readBlobCalls = [];

		// Reading a prefetched blob should use cache (no new call)
		await prefetchService.readBlob("blob1");
		assert.strictEqual(mockStorage.readBlobCalls.length, 0, "Should use cached prefetch");
	});
});
