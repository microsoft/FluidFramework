/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const failProxy = <T extends object>(handler: Partial<T> = {}): T => {
	const proxy: T = new Proxy<T>(handler as T, {
		get: (t, p, r) => {
			if (p === "then") {
				return undefined;
			}
			if (handler !== undefined && p in handler) {
				return Reflect.get(t, p, r);
			}
			throw new Error(`${p.toString()} not implemented`);
		},
	});
	return proxy;
};

// function createBlobManager(overrides?: Partial<ConstructorParameters<typeof BlobManager>[0]>) {
// 	const runtime = failProxy<IBlobManagerRuntime & IContainerHandleContextRuntime>({
// 		baseLogger: createChildLogger(),
// 		attachState: AttachState.Attached,
// 		resolveHandle: async () => {
// 			throw new Error("not implemented");
// 		},
// 	});
// 	const routeContext = new ContainerFluidHandleContext("/", runtime, undefined);
// 	return new BlobManager(
// 		failProxy({
// 			// defaults, these can still be overridden below
// 			runtime,
// 			routeContext,
// 			blobManagerLoadInfo: {},
// 			stashedBlobs: undefined,
// 			localBlobIdGenerator: undefined,
// 			storage: failProxy<IRuntimeStorageService>(),
// 			sendBlobAttachOp: () => {},
// 			blobRequested: () => {},
// 			isBlobDeleted: () => false,
// 			createBlobPayloadPending: false,

// 			// overrides
// 			...overrides,
// 		}),
// 	);
// }

// const olderThanTTL: IPendingBlobs[string] = {
// 	blob: "olderThanTTL",
// 	minTTLInSeconds: 100,
// 	uploadTime: Date.now() - 100 * 1000,
// };

// const withinTTLHalfLife: IPendingBlobs[string] = {
// 	blob: "withinTTLHalfLife",
// 	storageId: "withinTTLHalfLife",
// 	minTTLInSeconds: 100,
// 	uploadTime: Date.now() - 25 * 1000,
// };

// const storageIdWithoutUploadTime: IPendingBlobs[string] = {
// 	blob: "storageIdWithoutUploadTime",
// 	storageId: "storageIdWithoutUploadTime",
// };

// ADO#44999: Update for placeholder pending blob creation and getPendingLocalState
describe.skip("BlobManager.stashed", () => {
	it("is in correct state when no stashed blobs are provided", async () => {});

	it("starts uploads for stashed blobs that had not finished their upload", async () => {});

	it("reacts appropriately if a BlobAttach op is processed while uploading the corresponding stashed blob", async () => {});

	it("reacts appropriately when a stashed blob completes its upload", async () => {});

	it("reuploads a stashed blob if its uploadTime is older than the TTL", async () => {});

	it("does not reupload a stashed blob if its uploadTime is within the TTL half-life", async () => {});

	it("reuploads a stashed blob if it does not have an uploadTime", async () => {});

	it("successfully completes uploads for a variety of starting stashed blob states", async () => {});
});
