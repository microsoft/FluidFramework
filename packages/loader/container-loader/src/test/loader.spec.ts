/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IProvideLayerCompatDetails } from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { FluidErrorTypes, type ConfigTypes } from "@fluidframework/core-interfaces/internal";
import type {
	IDocumentService,
	IDocumentServiceFactory,
	IResolvedUrl,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import {
	isFluidError,
	MockLogger,
	wrapConfigProviderWithDefaults,
	mixinMonitoringContext,
	createChildLogger,
	toITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { Container } from "../container.js";
import { Loader } from "../loader.js";
import type { IPendingDetachedContainerState } from "../serializedStateManager.js";

import { AbsentProperty, failProxy, failSometimeProxy } from "./failProxy.js";
import {
	createTestCodeLoaderProxy,
	createTestDocumentServiceFactoryProxy,
} from "./testProxies.js";

const documentServiceFactoryFailProxy = failSometimeProxy<
	IDocumentServiceFactory & IProvideLayerCompatDetails
>({
	ILayerCompatDetails: AbsentProperty,
});

describe("loader unit test", () => {
	it("rehydrateDetachedContainerFromSnapshot with invalid format", async () => {
		const loader = new Loader({
			codeLoader: failProxy(),
			documentServiceFactory: documentServiceFactoryFailProxy,
			urlResolver: failProxy(),
		});

		try {
			await loader.rehydrateDetachedContainerFromSnapshot(`{"foo":"bar"}`);
			assert.fail("should fail");
		} catch (error) {
			assert.strict(isFluidError(error), `should be a Fluid error: ${error}`);
			assert.strictEqual(
				error.errorType,
				FluidErrorTypes.usageError,
				"should be a usage error",
			);
		}
	});

	it("rehydrateDetachedContainerFromSnapshot with valid format", async () => {
		const loader = new Loader({
			codeLoader: createTestCodeLoaderProxy(),
			documentServiceFactory: documentServiceFactoryFailProxy,
			urlResolver: failProxy(),
		});
		const detached = await loader.createDetachedContainer({ package: "none" });
		const detachedContainerState = detached.serialize();
		const parsedState = JSON.parse(detachedContainerState) as IPendingDetachedContainerState;
		assert.strictEqual(parsedState.attached, false);
		assert.strictEqual(parsedState.hasAttachmentBlobs, false);
		assert.strictEqual(Object.keys(parsedState.snapshotBlobs).length, 4);
		assert(parsedState.baseSnapshot !== undefined);
		await loader.rehydrateDetachedContainerFromSnapshot(detachedContainerState);
	});

	it("rehydrateDetachedContainerFromSnapshot with valid format and attachment blobs", async () => {
		const loader = new Loader({
			codeLoader: createTestCodeLoaderProxy({ createDetachedBlob: true }),
			documentServiceFactory: documentServiceFactoryFailProxy,
			urlResolver: failProxy(),
		});
		const detached = await loader.createDetachedContainer({ package: "none" });
		const detachedContainerState = detached.serialize();
		const parsedState = JSON.parse(detachedContainerState) as IPendingDetachedContainerState;
		assert.strictEqual(parsedState.attached, false);
		assert.strictEqual(parsedState.hasAttachmentBlobs, true);
		assert.strictEqual(Object.keys(parsedState.snapshotBlobs).length, 4);
		assert(parsedState.baseSnapshot !== undefined);
		await loader.rehydrateDetachedContainerFromSnapshot(detachedContainerState);
	});

	it("serialize and rehydrateDetachedContainerFromSnapshot while attaching", async () => {
		const loader = new Loader({
			codeLoader: createTestCodeLoaderProxy(),
			documentServiceFactory: documentServiceFactoryFailProxy,
			urlResolver: failProxy(),
			configProvider: {
				getRawConfig: (name): ConfigTypes =>
					name === "Fluid.Container.DisableCloseOnAttachFailure" ? true : undefined,
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
		assert(parsedState.baseSnapshot !== undefined);
		await loader.rehydrateDetachedContainerFromSnapshot(detachedContainerState);
	});

	it("serialize and rehydrateDetachedContainerFromSnapshot while attaching with valid format and attachment blobs", async () => {
		const resolvedUrl: IResolvedUrl = {
			id: uuid(),
			endpoints: {},
			tokens: {},
			type: "fluid",
			url: "none",
		};
		const loader = new Loader({
			codeLoader: createTestCodeLoaderProxy({ createDetachedBlob: true }),
			documentServiceFactory: createTestDocumentServiceFactoryProxy(resolvedUrl),
			urlResolver: failSometimeProxy<IUrlResolver>({
				resolve: async () => resolvedUrl,
			}),
			configProvider: {
				getRawConfig: (name): ConfigTypes =>
					name === "Fluid.Container.DisableCloseOnAttachFailure" ? true : undefined,
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
		assert.strictEqual(parsedState.hasAttachmentBlobs, true);
		assert.strictEqual(Object.keys(parsedState.snapshotBlobs).length, 4);
		assert(parsedState.baseSnapshot !== undefined);
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
			documentServiceFactory: documentServiceFactoryFailProxy,
			codeLoader: createTestCodeLoaderProxy(),
			options: {},
			scope: {},
			subLogger: toITelemetryLoggerExt(logger.logger),
		});
	});

	it("can attach with `IRuntime` only implementing `setConnectionState`", async () => {
		const resolvedUrl: IResolvedUrl = {
			id: "none",
			endpoints: {},
			tokens: {},
			type: "fluid",
			url: "none",
		};
		const urlResolver = failSometimeProxy<IUrlResolver>({
			resolve: async () => resolvedUrl,
		});
		const loader = new Loader({
			codeLoader: createTestCodeLoaderProxy({ runtimeWithout_setConnectionStatus: true }),
			documentServiceFactory: createTestDocumentServiceFactoryProxy(resolvedUrl),
			urlResolver,
		});
		const container = await loader.createDetachedContainer({ package: "none" });
		await container.attach({ url: "none" });
	});
});

describe("DisableLoadConnectionRetries", () => {
	const resolvedUrl: IResolvedUrl = {
		id: uuid(),
		endpoints: {},
		tokens: {},
		type: "fluid",
		url: `https://localhost/tenant/${uuid()}`,
	};

	const urlResolver = failSometimeProxy<IUrlResolver>({
		resolve: async () => resolvedUrl,
	});

	function createRetryableError(message: string): Error {
		const error = new Error(message);
		(error as unknown as { canRetry: boolean }).canRetry = true;
		return error;
	}

	it("load rejects when connectToStorage fails with retryable error and flag is enabled", async () => {
		const documentServiceFactory = failSometimeProxy<
			IDocumentServiceFactory & IProvideLayerCompatDetails
		>({
			createDocumentService: async () =>
				failSometimeProxy<IDocumentService>({
					policies: {},
					resolvedUrl,
					connectToStorage: async () => {
						throw createRetryableError("transient storage failure");
					},
					connectToDeltaStream: async () => new Promise(() => {}),
					on: AbsentProperty,
					off: AbsentProperty,
					dispose: () => {},
				}),
			ILayerCompatDetails: AbsentProperty,
		});

		const loader = new Loader({
			codeLoader: createTestCodeLoaderProxy(),
			documentServiceFactory,
			urlResolver,
			configProvider: {
				getRawConfig: (name): ConfigTypes =>
					name === "Fluid.Container.DisableLoadConnectionRetries" ? true : undefined,
			},
		});

		// With the flag enabled, the load should reject immediately instead of retrying.
		await assert.rejects(
			async () => loader.resolve({ url: "test" }),
			"Load should reject when storage connection fails with retries disabled",
		);
	});

	it("load rejects when connectToDeltaStream fails with retryable error and flag is enabled", async () => {
		const documentServiceFactory = failSometimeProxy<
			IDocumentServiceFactory & IProvideLayerCompatDetails
		>({
			createDocumentService: async () =>
				failSometimeProxy<IDocumentService>({
					policies: {},
					resolvedUrl,
					connectToStorage: async () => new Promise(() => {}),
					connectToDeltaStream: async (): Promise<never> => {
						throw createRetryableError("transient connection failure");
					},
					on: AbsentProperty,
					off: AbsentProperty,
					dispose: () => {},
				}),
			ILayerCompatDetails: AbsentProperty,
		});

		const loader = new Loader({
			codeLoader: createTestCodeLoaderProxy(),
			documentServiceFactory,
			urlResolver,
			configProvider: {
				getRawConfig: (name): ConfigTypes =>
					name === "Fluid.Container.DisableLoadConnectionRetries" ? true : undefined,
			},
		});

		// With the flag enabled, the load should reject immediately instead of retrying.
		await assert.rejects(
			async () => loader.resolve({ url: "test" }),
			"Load should reject when delta connection fails with retries disabled",
		);
	});
});
