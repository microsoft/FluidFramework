/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import type { IDocumentStorageService } from "@fluidframework/driver-definitions/internal";
import { Deferred } from "@fluidframework/core-utils/internal";
import { ICreateBlobResponse } from "@fluidframework/protocol-definitions";
import { BlobManager, IBlobManagerRuntime, type IPendingBlobs } from "../blobManager.js";

export const failProxy = <T extends object>(handler: Partial<T> = {}) => {
	const proxy: T = new Proxy<T>(handler as T, {
		get: (t, p, r) => {
			if (p === "then") {
				return undefined;
			}
			if (handler !== undefined && p in handler) {
				return Reflect.get(t, p, r);
			}
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return failProxy();
		},
	});
	return proxy;
};

function createBlobManager(overrides?: Partial<ConstructorParameters<typeof BlobManager>[0]>) {
	return new BlobManager(
		failProxy({
			...overrides,
			runtime:
				overrides?.runtime ??
				failProxy<IBlobManagerRuntime>({ logger: createChildLogger() }),
			snapshot: overrides?.snapshot ?? {},
			stashedBlobs: overrides?.stashedBlobs,
		}),
	);
}

const olderThanTTL: IPendingBlobs[string] = {
	blob: "olderThanTTL",
	minTTLInSeconds: 100,
	uploadTime: Date.now() - 100 * 1000,
};

const withinTTLHalfLife: IPendingBlobs[string] = {
	blob: "withinTTLHalfLife",
	storageId: "withinTTLHalfLife",
	minTTLInSeconds: 100,
	uploadTime: Date.now() - 25 * 1000,
};

const storageIdWithoutUploadTime: IPendingBlobs[string] = {
	blob: "withinTTLHalfLife",
	storageId: "withinTTLHalfLife",
};

describe("BlobManager.stashed", () => {
	it("No Pending Stashed Uploads", async () => {
		const blobManager = createBlobManager();
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
		await blobManager.trackPendingStashedUploads();
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
	});

	it("Stashed blob", async () => {
		const createResponse = new Deferred<ICreateBlobResponse>();
		const blobManager = createBlobManager({
			stashedBlobs: {
				a: {
					blob: "a",
				},
			},
			getStorage: () =>
				failProxy<IDocumentStorageService>({
					createBlob: async () => {
						return createResponse.promise;
					},
				}),
		});
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.trackPendingStashedUploads(),
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		createResponse.resolve({
			id: "a",
		});
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.trackPendingStashedUploads(),
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
	});

	it("Stashed blob with upload older than TTL", async () => {
		const createResponse = new Deferred<ICreateBlobResponse>();
		const blobManager = createBlobManager({
			stashedBlobs: {
				olderThanTTL,
			},
			getStorage: () =>
				failProxy<IDocumentStorageService>({
					createBlob: async () => {
						return createResponse.promise;
					},
				}),
		});
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.trackPendingStashedUploads(),
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		createResponse.resolve({
			id: "a",
		});
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.trackPendingStashedUploads(),
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
	});

	it("Stashed blob with upload within TTL half-life", async () => {
		const blobManager = createBlobManager({
			stashedBlobs: {
				withinTTLHalfLife,
			},
		});
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
		await blobManager.trackPendingStashedUploads();
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
	});

	it("Stashed blob with upload without upload time", async () => {
		const createResponse = new Deferred<ICreateBlobResponse>();
		const blobManager = createBlobManager({
			stashedBlobs: {
				storageIdWithoutTTL: storageIdWithoutUploadTime,
			},
			getStorage: () =>
				failProxy<IDocumentStorageService>({
					createBlob: async () => {
						return createResponse.promise;
					},
				}),
		});
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.trackPendingStashedUploads(),
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		createResponse.resolve({
			id: "a",
		});
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.trackPendingStashedUploads(),
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
	});

	it("Mixed stashed blobs", async () => {
		const createResponse = new Deferred<ICreateBlobResponse>();
		const blobManager = createBlobManager({
			stashedBlobs: {
				olderThanTTL,
				withinTTLHalfLife,
				storageIdWithoutUploadTime,
				a: {
					blob: "a",
				},
			},
			getStorage: () =>
				failProxy<IDocumentStorageService>({
					createBlob: async () => {
						return createResponse.promise;
					},
				}),
		});
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.trackPendingStashedUploads(),
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		createResponse.resolve({
			id: "a",
		});
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.trackPendingStashedUploads(),
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
	});
});
