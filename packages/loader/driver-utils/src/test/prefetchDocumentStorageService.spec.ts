/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";

import { GenericNetworkError, NonRetryableError } from "../network.js";
import { PrefetchDocumentStorageService } from "../prefetchDocumentStorageService.js";

/**
 * Creates a retryable error for testing
 */
function createRetryableError(message: string): GenericNetworkError {
	return new GenericNetworkError(message, true, { driverVersion: undefined });
}

/**
 * Creates a non-retryable error for testing
 */
function createNonRetryableError(message: string): NonRetryableError<"genericNetworkError"> {
	return new NonRetryableError(message, "genericNetworkError", { driverVersion: undefined });
}

/**
 * Helper to wait for a condition with timeout
 */
async function waitForCondition(
	condition: () => boolean,
	timeoutMs: number = 1000,
	intervalMs: number = 5,
): Promise<void> {
	const startTime = Date.now();
	while (!condition()) {
		if (Date.now() - startTime > timeoutMs) {
			throw new Error("Condition not met within timeout");
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
}

/**
 * Mock storage service for testing
 */
class MockStorageService implements Partial<IDocumentStorageService> {
	public readBlobCalls: string[] = [];
	public shouldFail = false;
	public failureError: Error = new Error("Mock read failure");
	public shouldGetSnapshotTreeFail = false;
	public getSnapshotTreeError: Error = new Error("Mock getSnapshotTree failure");

	public async readBlob(blobId: string): Promise<ArrayBufferLike> {
		this.readBlobCalls.push(blobId);
		if (this.shouldFail) {
			throw this.failureError;
		}
		return new Uint8Array([1, 2, 3]).buffer;
	}

	// eslint-disable-next-line @rushstack/no-new-null
	public async getSnapshotTree(): Promise<ISnapshotTree | null> {
		if (this.shouldGetSnapshotTreeFail) {
			throw this.getSnapshotTreeError;
		}
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

	public get policies(): IDocumentStorageServicePolicies | undefined {
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
		mockStorage.failureError = createRetryableError("Retryable error");
		mockStorage.shouldFail = true;

		// First call fails
		await assert.rejects(async () => prefetchService.readBlob("blob1"));

		// Reset mock to succeed
		mockStorage.shouldFail = false;
		mockStorage.readBlobCalls = [];

		// Second call should retry (not use cached error)
		const result = await prefetchService.readBlob("blob1");
		assert.strictEqual(result.byteLength, 3, "Should return blob data after retry");
		assert.strictEqual(
			mockStorage.readBlobCalls.length,
			1,
			"Should perform exactly one new underlying read after cache is cleared",
		);
	});

	it("should NOT clear cache on non-retryable errors", async () => {
		const nonRetryableError = createNonRetryableError("Non-retryable error");
		mockStorage.failureError = nonRetryableError;
		mockStorage.shouldFail = true;

		// First call fails with non-retryable error
		await assert.rejects(
			async () => prefetchService.readBlob("blob1"),
			(error: Error) => error === nonRetryableError,
			"First call should receive the non-retryable error",
		);

		// Reset mock to return different data (to prove we're using cached rejection)
		mockStorage.shouldFail = false;
		mockStorage.readBlobCalls = [];

		// Second call should still fail with same cached non-retryable error
		// (cache should NOT be cleared for non-retryable errors)
		await assert.rejects(
			async () => prefetchService.readBlob("blob1"),
			(error: Error) => error === nonRetryableError,
			"Should receive the same cached non-retryable error",
		);
		assert.strictEqual(
			mockStorage.readBlobCalls.length,
			0,
			"Should not perform new underlying read - cached rejection should be returned",
		);
	});

	it("should successfully prefetch blobs", async () => {
		// Trigger prefetch
		await prefetchService.getSnapshotTree();

		// Wait for prefetch to complete using polling instead of fixed timeout
		await waitForCondition(() => mockStorage.readBlobCalls.length > 0);

		// Verify blobs were prefetched
		assert.ok(
			mockStorage.readBlobCalls.length > 0,
			"Prefetch should have triggered blob reads",
		);

		// Clear call tracking
		mockStorage.readBlobCalls = [];

		// Reading a prefetched blob should use cache (no new call)
		await prefetchService.readBlob("blob1");
		assert.strictEqual(mockStorage.readBlobCalls.length, 0, "Should use cached prefetch");
	});

	it("should not cause unhandled rejections on fire-and-forget prefetch failures", async () => {
		// Track unhandled rejections to verify none occur
		const unhandledRejections: unknown[] = [];
		const rejectionHandler = (reason: unknown): void => {
			unhandledRejections.push(reason);
		};
		process.on("unhandledRejection", rejectionHandler);

		try {
			// Set up to fail all blob reads with a non-retryable error
			// Using non-retryable so the error is cached and we can verify error identity
			const prefetchError = createNonRetryableError("Prefetch network failure");
			mockStorage.failureError = prefetchError;
			mockStorage.shouldFail = true;

			// Trigger prefetch via getSnapshotTree (fire-and-forget pattern)
			// The prefetch will fail, but should NOT cause unhandled rejection
			await prefetchService.getSnapshotTree();

			// Wait for prefetch attempts to occur
			await waitForCondition(() => mockStorage.readBlobCalls.length > 0);

			// Allow microtask queue to flush (for catch handlers to execute)
			await Promise.resolve();
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Verify no unhandled rejections occurred
			assert.strictEqual(
				unhandledRejections.length,
				0,
				`Expected no unhandled rejections, but got: ${JSON.stringify(unhandledRejections)}`,
			);

			// Also verify that explicit readBlob calls still receive the same cached error
			// (non-retryable errors remain cached, so we can verify error identity)
			await assert.rejects(
				async () => prefetchService.readBlob("blob1"),
				(error: Error) => error === prefetchError,
				"Explicit readBlob should receive the same cached error instance",
			);
		} finally {
			process.off("unhandledRejection", rejectionHandler);
		}
	});

	it("should not cause unhandled rejections when getSnapshotTree fails", async () => {
		// Track unhandled rejections to verify none occur
		const unhandledRejections: unknown[] = [];
		const rejectionHandler = (reason: unknown): void => {
			unhandledRejections.push(reason);
		};
		process.on("unhandledRejection", rejectionHandler);

		try {
			// Set up getSnapshotTree to fail (e.g., network timeout)
			const networkError = new Error("Socket timeout");
			mockStorage.shouldGetSnapshotTreeFail = true;
			mockStorage.getSnapshotTreeError = networkError;

			// getSnapshotTree internally does: void p.then(...).catch(...)
			// Without the .catch(), if p rejects, the derived promise from .then() also
			// rejects and causes an unhandled rejection. This test verifies the fix.
			await assert.rejects(
				async () => prefetchService.getSnapshotTree(),
				(error: Error) => error.message === "Socket timeout",
				"Caller should receive the error",
			);

			// Allow microtask queue to flush
			await Promise.resolve();
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Verify no unhandled rejections occurred
			assert.strictEqual(
				unhandledRejections.length,
				0,
				`Expected no unhandled rejections, but got: ${JSON.stringify(unhandledRejections)}`,
			);
		} finally {
			process.off("unhandledRejection", rejectionHandler);
		}
	});
});
