/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { Deferred } from "@fluidframework/core-utils/internal";
import type { IDocumentStorageService } from "@fluidframework/driver-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { BlobManager, IBlobManagerRuntime } from "../blobManager/index.js";
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
			createBlobPayloadPending: false,
			// overrides
			...overrides,
		}),
	);
}

const blobAttachMessage = {
	clientId: "clientid",
	minimumSequenceNumber: 1,
	referenceSequenceNumber: 1,
	sequenceNumber: 1,
	type: "blobAttach",
	timestamp: Date.now(),
};

describe("BlobHandles", () => {
	it("Create blob", async () => {
		// Deferred promise that will be resolve once we send a blob attach. It is used mainly
		// to simulate correct order or blob operations: create -> onUploadResolve -> process.
		const d = new Deferred<void>();
		const blobManager = createBlobManager({
			sendBlobAttachOp(_localId, _storageId) {
				d.resolve();
			},
			stashedBlobs: {},
			localBlobIdGenerator: () => "localId",
			isBlobDeleted: () => false,
			storage: failProxy<IDocumentStorageService>({
				createBlob: async () => {
					return { id: "blobId" };
				},
				readBlob: async () => {
					return stringToBuffer("contentFromStorage", "utf8");
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
		// getting blob handle before attaching from the pending blob list
		assert.strictEqual(bufferToString(await blobHandle.get(), "utf8"), "content");
		blobHandle.attachGraph();
		// getting blob handle after attaching from storage
		assert.strictEqual(bufferToString(await blobHandle.get(), "utf8"), "contentFromStorage");
	});

	it("Reupload expired blob", async () => {
		const d = new Deferred<void>();
		let count = 0;
		const blobManager = createBlobManager({
			sendBlobAttachOp(_localId, _storageId) {
				d.resolve();
			},
			stashedBlobs: {},
			localBlobIdGenerator: () => "localId",
			storage: failProxy<IDocumentStorageService>({
				createBlob: async () => {
					count++;
					return { id: "blobId", minTTLInSeconds: count < 3 ? -1 : undefined };
				},
				readBlob: async () => {
					return stringToBuffer("content", "utf8");
				},
			}),
		});
		const blob: ArrayBufferLike = stringToBuffer("content", "utf8");
		const blobHandleP = blobManager.createBlob(blob);
		await d.promise;
		assert.strictEqual(count, 3, "test did not try to reupload");
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
		assert.strictEqual(bufferToString(await blobHandle.get(), "utf8"), "content");
	});
});
