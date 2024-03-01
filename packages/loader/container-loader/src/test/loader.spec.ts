/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { v4 as uuid } from "uuid";
import { isFluidError } from "@fluidframework/telemetry-utils";
import { FluidErrorTypes } from "@fluidframework/core-interfaces";
import { ICreateBlobResponse, SummaryType } from "@fluidframework/protocol-definitions";
import { AttachState, IRuntime } from "@fluidframework/container-definitions";
import { stringToBuffer } from "@fluid-internal/client-utils";
import {
	IDocumentService,
	IDocumentServiceFactory,
	type IDocumentStorageService,
	type IResolvedUrl,
	type IUrlResolver,
} from "@fluidframework/driver-definitions";
import { IDetachedBlobStorage, Loader } from "../loader.js";
import { IPendingDetachedContainerState } from "../container.js";

const failProxy = <T extends object>() => {
	const proxy = new Proxy<T>({} as any as T, {
		get: (_, p) => {
			if (p === "then") {
				return undefined;
			}
			throw Error(`${p.toString()} not implemented`);
		},
	});
	return proxy;
};

const failSometimeProxy = <T extends object>(handler: Partial<T>) => {
	const proxy = new Proxy<T>(handler as T, {
		get: (t, p, r) => {
			if (p === "then") {
				return undefined;
			}
			if (p in handler) {
				return Reflect.get(t, p, r);
			}
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return failProxy();
		},
	});
	return proxy;
};

const codeLoader = {
	load: async () => {
		return {
			details: {
				package: "none",
			},
			module: {
				fluidExport: {
					IRuntimeFactory: {
						get IRuntimeFactory() {
							return this;
						},
						async instantiateRuntime(context, existing) {
							return failSometimeProxy<IRuntime>({
								createSummary: () => ({
									tree: {},
									type: SummaryType.Tree,
								}),
								setAttachState: () => {},
								getPendingLocalState: () => ({
									pending: [],
								}),
							});
						},
					},
				},
			},
		};
	},
};

describe("loader unit test", () => {
	it("rehydrateDetachedContainerFromSnapshot with invalid format", async () => {
		const loader = new Loader({
			codeLoader: failProxy(),
			documentServiceFactory: failProxy(),
			urlResolver: failProxy(),
		});

		try {
			await loader.rehydrateDetachedContainerFromSnapshot(`{"foo":"bar"}`);
			assert.fail("should fail");
		} catch (e) {
			assert.strict(isFluidError(e), `should be a Fluid error: ${e}`);
			assert.strictEqual(e.errorType, FluidErrorTypes.usageError, "should be a usage error");
		}
	});

	it("rehydrateDetachedContainerFromSnapshot with valid format", async () => {
		const loader = new Loader({
			codeLoader,
			documentServiceFactory: failProxy(),
			urlResolver: failProxy(),
		});
		const detached = await loader.createDetachedContainer({ package: "none" });
		const detachedContainerState = detached.serialize();
		const parsedState = JSON.parse(detachedContainerState) as IPendingDetachedContainerState;
		assert.strictEqual(parsedState.attached, false);
		assert.strictEqual(parsedState.hasAttachmentBlobs, false);
		assert.strictEqual(Object.keys(parsedState.snapshotBlobs).length, 4);
		assert.ok(parsedState.baseSnapshot);
		await loader.rehydrateDetachedContainerFromSnapshot(detachedContainerState);
	});

	it("rehydrateDetachedContainerFromSnapshot with valid format and attachment blobs", async () => {
		const blobs = new Map<string, ArrayBufferLike>();
		const detachedBlobStorage: IDetachedBlobStorage = {
			createBlob: async (file) => {
				const response: ICreateBlobResponse = {
					id: uuid(),
				};
				blobs.set(response.id, file);
				return response;
			},
			getBlobIds: () => [...blobs.keys()],
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			readBlob: async (id) => blobs.get(id)!,
			get size() {
				return blobs.size;
			},
		};
		const loader = new Loader({
			codeLoader,
			documentServiceFactory: failProxy(),
			urlResolver: failProxy(),
			detachedBlobStorage,
		});
		const detached = await loader.createDetachedContainer({ package: "none" });
		await detachedBlobStorage.createBlob(stringToBuffer("whatever", "utf8"));
		const detachedContainerState = detached.serialize();
		const parsedState = JSON.parse(detachedContainerState) as IPendingDetachedContainerState;
		assert.strictEqual(parsedState.attached, false);
		assert.strictEqual(parsedState.hasAttachmentBlobs, true);
		assert.strictEqual(Object.keys(parsedState.snapshotBlobs).length, 4);
		assert.ok(parsedState.baseSnapshot);
		await loader.rehydrateDetachedContainerFromSnapshot(detachedContainerState);
	});

	it("serialize and rehydrateDetachedContainerFromSnapshot while attaching", async () => {
		const loader = new Loader({
			codeLoader,
			documentServiceFactory: failProxy(),
			urlResolver: failProxy(),
			configProvider: {
				getRawConfig: (name) =>
					name === "Fluid.Container.RetryOnAttachFailure" ? true : undefined,
			},
		});
		const detached = await loader.createDetachedContainer({ package: "none" });
		await detached.attach({ url: "none" }).then(
			() => assert.fail("attach should fail"),
			() => {},
		);

		assert.strictEqual(detached.closed, false);
		assert.strictEqual(detached.attachState, AttachState.Attaching);

		const detachedContainerState = detached.serialize();
		const parsedState = JSON.parse(detachedContainerState) as IPendingDetachedContainerState;
		assert.strictEqual(parsedState.attached, false);
		assert.strictEqual(parsedState.hasAttachmentBlobs, false);
		assert.strictEqual(Object.keys(parsedState.snapshotBlobs).length, 4);
		assert.deepStrictEqual(parsedState.pendingRuntimeState, { pending: [] });
		assert.ok(parsedState.baseSnapshot);
		await loader.rehydrateDetachedContainerFromSnapshot(detachedContainerState);
	});

	it("serialize and rehydrateDetachedContainerFromSnapshot while attaching with valid format and attachment blobs", async () => {
		const blobs = new Map<string, ArrayBufferLike>();
		const detachedBlobStorage: IDetachedBlobStorage = {
			createBlob: async (file) => {
				const response: ICreateBlobResponse = {
					id: uuid(),
				};
				blobs.set(response.id, file);
				return response;
			},
			getBlobIds: () => [...blobs.keys()],
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			readBlob: async (id) => blobs.get(id)!,
			get size() {
				return blobs.size;
			},
		};
		const resolvedUrl: IResolvedUrl = {
			id: uuid(),
			endpoints: {},
			tokens: {},
			type: "fluid",
			url: "none",
		};
		const loader = new Loader({
			codeLoader,
			documentServiceFactory: failSometimeProxy<IDocumentServiceFactory>({
				createContainer: async () =>
					failSometimeProxy<IDocumentService>({
						policies: {},
						resolvedUrl,
						connectToStorage: async () =>
							failSometimeProxy<IDocumentStorageService>({
								createBlob: async () => ({ id: uuid() }),
							}),
					}),
			}),
			urlResolver: failSometimeProxy<IUrlResolver>({
				resolve: async () => resolvedUrl,
			}),
			detachedBlobStorage,
			configProvider: {
				getRawConfig: (name) =>
					name === "Fluid.Container.RetryOnAttachFailure" ? true : undefined,
			},
		});
		const detached = await loader.createDetachedContainer({ package: "none" });
		await detachedBlobStorage.createBlob(stringToBuffer("whatever", "utf8"));

		await detached.attach({ url: "none" }).then(
			() => assert.fail("attach should fail"),
			() => {},
		);

		assert.strictEqual(detached.closed, false);
		assert.strictEqual(detached.attachState, AttachState.Attaching);

		const detachedContainerState = detached.serialize();
		const parsedState = JSON.parse(detachedContainerState) as IPendingDetachedContainerState;
		assert.strictEqual(parsedState.attached, false);
		assert.strictEqual(parsedState.hasAttachmentBlobs, true);
		assert.strictEqual(Object.keys(parsedState.snapshotBlobs).length, 4);
		assert.ok(parsedState.baseSnapshot);
		await loader.rehydrateDetachedContainerFromSnapshot(detachedContainerState);
	});
});
