/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import { isPromiseLike, LazyPromise } from "@fluidframework/core-utils/internal";
import { IDocumentStorageService } from "@fluidframework/driver-definitions/internal";
import {
	IFluidDataStoreChannel,
	IFluidDataStoreFactory,
	IFluidDataStoreRegistry,
	IFluidParentContext,
	type NamedFluidDataStoreRegistryEntries,
	type IContainerRuntimeBase,
	type ISummarizerNodeWithGC,
} from "@fluidframework/runtime-definitions/internal";
import { isFluidError } from "@fluidframework/telemetry-utils/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import {
	FluidDataStoreContext,
	LocalDetachedFluidDataStoreContext,
} from "../dataStoreContext.js";

describe("createChildDataStore", () => {
	const throwNYI = () => {
		throw new Error("Method not implemented.");
	};
	const testContext = class TestContext extends FluidDataStoreContext {
		protected pkg = ["ParentDataStore"];
		public registry: IFluidDataStoreRegistry | undefined;
		public getInitialSnapshotDetails = throwNYI;
		public setAttachState = throwNYI;
		public getAttachSummary = throwNYI;
		public getAttachGCData = throwNYI;
		protected channel = new Proxy({} as unknown as IFluidDataStoreChannel, { get: throwNYI });
		protected channelP = new LazyPromise(async () => this.channel);
	};

	const createRegistry = (
		namedEntries?: NamedFluidDataStoreRegistryEntries,
	): IFluidDataStoreRegistry => ({
		get IFluidDataStoreRegistry() {
			return this;
		},
		async get(name) {
			return new Map(namedEntries).get(name);
		},
		getSync(name) {
			const entry = new Map(namedEntries).get(name);
			return isPromiseLike(entry) ? undefined : entry;
		},
	});

	const createContext = (namedEntries?: NamedFluidDataStoreRegistryEntries) => {
		const registry = createRegistry(namedEntries);
		const createSummarizerNodeFn = () =>
			new Proxy({} as unknown as ISummarizerNodeWithGC, { get: throwNYI });
		const storage = new Proxy({} as unknown as IDocumentStorageService, { get: throwNYI });

		const parentContext = {
			clientDetails: {
				capabilities: { interactive: true },
			},
			containerRuntime: {
				createDetachedDataStore(pkg, loadingGroupId) {
					return new LocalDetachedFluidDataStoreContext({
						channelToDataStoreFn: (channel) => ({
							entryPoint: channel.entryPoint,
							trySetAlias: throwNYI,
						}),
						createSummarizerNodeFn,
						id: "child",
						makeLocallyVisibleFn: throwNYI,
						parentContext,
						pkg,
						scope: {},
						snapshotTree: undefined,
						storage,
						loadingGroupId,
					});
				},
			} satisfies Partial<IContainerRuntimeBase> as unknown as IContainerRuntimeBase,
		} satisfies Partial<IFluidParentContext> as unknown as IFluidParentContext;

		const context = new testContext(
			{
				createSummarizerNodeFn,
				id: "parent",
				parentContext,
				scope: {},
				storage,
			},
			false,
			false,
			throwNYI,
		);
		context.registry = registry;
		return context;
	};

	const createFactory = (
		createDataStore?: IFluidDataStoreFactory["createDataStore"],
	): IFluidDataStoreFactory => ({
		type: "ChildDataStore",
		get IFluidDataStoreFactory() {
			return this;
		},
		instantiateDataStore: throwNYI,
		createDataStore,
	});

	it("Child factory does not support synchronous creation", async () => {
		const factory = createFactory();
		const context = createContext([[factory.type, factory]]);
		try {
			context.createChildDataStore(factory);
			assert.fail("should fail");
		} catch (error) {
			assert(isFluidError(error));
			assert(error.errorType === FluidErrorTypes.usageError);
			assert(error.getTelemetryProperties().noCreateDataStore === true);
		}
	});

	it("Child factory not registered", async () => {
		const factory = createFactory();
		const context = createContext();
		try {
			context.createChildDataStore(factory);
			assert.fail("should fail");
		} catch (error) {
			assert(isFluidError(error));
			assert(error.errorType === FluidErrorTypes.usageError);
			assert(error.getTelemetryProperties().isUndefined === true);
		}
	});

	it("Child factory is a different instance", async () => {
		const factory = createFactory();
		const context = createContext([[factory.type, createFactory()]]);

		try {
			context.createChildDataStore(factory);
			assert.fail("should fail");
		} catch (error) {
			assert(isFluidError(error));
			assert(error.errorType === FluidErrorTypes.usageError);
			assert(error.getTelemetryProperties().diffInstance === true);
		}
	});

	it("createChildDataStore", async () => {
		const factory = createFactory(() => ({ runtime: new MockFluidDataStoreRuntime() }));
		const context = createContext([[factory.type, factory]]);
		context.createChildDataStore(factory);
	});
});
