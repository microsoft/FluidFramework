/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import { AttachState } from "@fluidframework/container-definitions";
import { Deferred } from "@fluidframework/core-utils/internal";
import { ICreateBlobResponse } from "@fluidframework/driver-definitions/internal";
import type { IDocumentStorageService } from "@fluidframework/driver-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { BlobManager, IBlobManagerRuntime, type IPendingBlobs } from "../blobManager/index.js";
import {
	ContainerFluidHandleContext,
	IContainerHandleContextRuntime,
} from "../containerHandleContext.js";
export const failProxy = <T extends object>(handler: Partial<T> = {}): T => {
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
function createBlobManager(
	overrides?: Partial<ConstructorParameters<typeof BlobManager>[0]>,
): BlobManager {
	const runtime = failProxy<IBlobManagerRuntime & IContainerHandleContextRuntime>({
		baseLogger: createChildLogger(),
		attachState: AttachState.Attached,
		resolveHandle: async () => {
			throw new Error("not implemented");
		},
	});
	const routeContext = new ContainerFluidHandleContext("/", runtime, undefined);
	return new BlobManager(
		failProxy({
			// defaults, these can still be overridden below
			runtime,
			routeContext,
			blobManagerLoadInfo: {},
			stashedBlobs: undefined,
			localBlobIdGenerator: undefined,
			isBlobDeleted: () => false,
			blobRequested: () => {},
			// overrides
			...overrides,
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
	blob: "storageIdWithoutUploadTime",
	storageId: "storageIdWithoutUploadTime",
};
const blobAttachMessage = {
	clientId: "clientid",
	minimumSequenceNumber: 1,
	referenceSequenceNumber: 1,
	sequenceNumber: 1,
	type: "blobAttach",
	timestamp: Date.now(),
};

describe("BlobManager ", () => {
	it("Create blob", async () => {
		const blobManager = createBlobManager({
			sendBlobAttachOp(_localId, _storageId) {},
			stashedBlobs: {},
			localBlobIdGenerator: () => "localId",
			isBlobDeleted: () => false,
			storage: failProxy<IDocumentStorageService>({
				createBlob: async () => {
					return { id: "blobId" };
				},
			}),
		});
		const blob: ArrayBufferLike = stringToBuffer("content", "utf8");
		const blobHandleP = blobManager.createBlob(blob);
		blobManager.processBlobAttachMessage(
			{
				...blobAttachMessage,
				metadata: {
					localId: "localId",
					blobId: "blobId",
				},
			},
			true,
		);
		const blobHandle = await blobHandleP;
		console.log("blobHandle", blobHandle);
		assert.strictEqual(bufferToString(await blobHandle.get(), "utf8"), "content");
	});

	it.only("Create blob expired", async () => {
		const d = new Deferred<void>();
		const blobManager = createBlobManager({
			sendBlobAttachOp(_localId, _storageId) {
				d.resolve();
			},
			stashedBlobs: {},
			localBlobIdGenerator: () => "localId",
			storage: failProxy<IDocumentStorageService>({
				createBlob: async () => {
					return { id: "blobId" };
				},
				readBlob: async () => {
					return stringToBuffer("content", "utf8");
				},
			}),
		});
		const blob: ArrayBufferLike = stringToBuffer("content", "utf8");
		const blobHandleP = blobManager.createBlob(blob);
		await d.promise;
		blobManager.processBlobAttachMessage(
			{
				...blobAttachMessage,
				metadata: {
					localId: "localId",
					blobId: "blobId",
				},
			},
			true,
		);
		const blobHandle = await blobHandleP;
		blobHandle.attachGraph();
		console.log("blobHandle", blobHandle);
		assert.strictEqual(bufferToString(await blobHandle.get(), "utf8"), "content");
		blobManager.processBlobAttachMessage(
			{
				...blobAttachMessage,
				metadata: {
					localId: "localId",
					blobId: "blobId",
				},
			},
			true,
		);
	});
	it("Process blob and complete stashed upload after", async () => {});
	it("Already stashed blob", async () => {
		const createResponse = new Deferred<ICreateBlobResponse>();
		const blobManager = createBlobManager({
			stashedBlobs: {},
			storage: failProxy<IDocumentStorageService>({
				createBlob: async () => {
					return createResponse.promise;
				},
			}),
		});
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.stashedBlobsUploadP,
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		createResponse.resolve({
			id: "a",
		});
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.stashedBlobsUploadP,
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
		assert.strictEqual(blobManager.allBlobsAttached, true);
	});
	it("Stashed blob with upload older than TTL", async () => {
		const createResponse = new Deferred<ICreateBlobResponse>();
		const blobManager = createBlobManager({
			stashedBlobs: {
				olderThanTTL,
			},
			storage: failProxy<IDocumentStorageService>({
				createBlob: async () => {
					return createResponse.promise;
				},
			}),
		});
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.stashedBlobsUploadP,
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		createResponse.resolve({
			id: "a",
		});
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.stashedBlobsUploadP,
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
		assert.strictEqual(blobManager.allBlobsAttached, true);
	});
	it("Stashed blob with upload within TTL half-life", async () => {
		const blobManager = createBlobManager({
			stashedBlobs: {
				withinTTLHalfLife,
			},
		});
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
		await blobManager.stashedBlobsUploadP;
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
	});
	it("Stashed blob without upload time", async () => {
		const createResponse = new Deferred<ICreateBlobResponse>();
		const blobManager = createBlobManager({
			stashedBlobs: {
				storageIdWithoutUploadTime,
			},
			storage: failProxy<IDocumentStorageService>({
				createBlob: async () => {
					return { id: "a" };
				},
			}),
		});
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.stashedBlobsUploadP,
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		createResponse.resolve({
			id: "a",
		});
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.stashedBlobsUploadP,
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
		assert.strictEqual(blobManager.allBlobsAttached, true);
	});
	it("Mixed stashed blobs", async () => {
		const letUploadsComplete = new Deferred<void>();
		const stashedBlobs = generatePairwiseOptions<IPendingBlobs[string]>({
			acked: [undefined, true, false],
			blob: ["content"],
			minTTLInSeconds: [undefined, 100],
			storageId: [undefined, "id"],
			uploadTime: [Date.now() - 100 * 1000, Date.now() - 25 * 1000, undefined],
		}).reduce<IPendingBlobs>((pv, cv, i) => {
			if (cv.storageId) {
				cv.storageId += i.toString();
			}
			cv.blob = i.toString();
			pv[i] = cv;
			return pv;
		}, {});
		const blobManager = createBlobManager({
			stashedBlobs,
			storage: failProxy<IDocumentStorageService>({
				createBlob: async (b) => {
					await letUploadsComplete.promise;
					return { id: `id:${bufferToString(b, "utf8")}` };
				},
			}),
		});
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.stashedBlobsUploadP,
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), true);
		letUploadsComplete.resolve();
		await Promise.race([
			new Promise<void>((resolve) => setTimeout(() => resolve(), 10)),
			blobManager.stashedBlobsUploadP,
		]);
		assert.strictEqual(blobManager.hasPendingStashedUploads(), false);
		assert.strictEqual(blobManager.allBlobsAttached, true);
	});
});
