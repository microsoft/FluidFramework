/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { IRuntime } from "@fluidframework/container-definitions/internal";
import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import {
	IDocumentService,
	IDocumentServiceFactory,
	type IDocumentStorageService,
	type IResolvedUrl,
	type IUrlResolver,
	ICreateBlobResponse,
} from "@fluidframework/driver-definitions/internal";
import {
	isFluidError,
	MockLogger,
	wrapConfigProviderWithDefaults,
	mixinMonitoringContext,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { Container } from "../container.js";
import { IDetachedBlobStorage, Loader } from "../loader.js";
import type { IPendingDetachedContainerState } from "../serializedStateManager.js";

import { failProxy, failSometimeProxy } from "./failProxy.js";

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

	it("ConnectionStateHandler feature gate overrides", () => {
		const configProvider = wrapConfigProviderWithDefaults(
			undefined, // original provider
			{
				"Fluid.Container.DisableCatchUpBeforeDeclaringConnected": true,
				"Fluid.Container.DisableJoinSignalWait": true,
			},
		);

		const logger = mixinMonitoringContext(
			createChildLogger({ logger: new MockLogger() }),
			configProvider,
		);

		// Ensure that this call does not crash due to potential reentrnacy:
		// - Container.constructor
		// - ConnectionStateHandler.constructor
		// - fetching overwrites from config
		// - logs event about fetching config
		// - calls property getters on logger setup by Container.constructor
		// - containerConnectionState getter
		// - Container.connectionState getter
		// - Container.connectionStateHandler.connectionState - crash, as Container.connectionStateHandler is undefined (not setup yet).
		new Container({
			urlResolver: failProxy(),
			documentServiceFactory: failProxy(),
			codeLoader,
			options: {},
			scope: {},
			subLogger: logger.logger,
		});
	});
});
