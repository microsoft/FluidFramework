/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { ISharedMap } from "@fluidframework/map/internal";
import type {
	FluidDataStoreContextInternal,
	IFluidDataStoreChannelCollection,
	IFluidDataStoreFactory,
	IFluidDataStoreFactoryInternal,
	IFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import {
	createSummarizerCore,
	getRequiredPendingLocalState,
	summarizeNow,
	type ITestFluidObject,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";

describeCompat("Native channel collections", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap } = apis.dds;
	const { LeafChannelRuntime } = apis.dataRuntime.packages.datastore;
	const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;
	const { TestFluidObjectFactory } = apis.dataRuntime;
	const legacyFactory = new TestFluidObjectFactory([], "legacy-child");
	const channelFactory = SharedMap.getFactory();
	const leafFactory: IFluidDataStoreFactoryInternal = {
		type: channelFactory.type,
		isLeafChannel: true,
		get IFluidDataStoreFactory() {
			return this;
		},
		async instantiateDataStore(context, existing) {
			return LeafChannelRuntime.load(context, existing, channelFactory);
		},
	};
	const registry: IFluidDataStoreRegistry = {
		get IFluidDataStoreRegistry() {
			return this;
		},
		async get(type) {
			return type === leafFactory.type
				? leafFactory
				: type === factory.type
					? factory
					: type === legacyFactory.type
						? legacyFactory
						: undefined;
		},
	};
	const factory: IFluidDataStoreFactory & {
		IFluidDataStoreRegistry: IFluidDataStoreRegistry;
	} = {
		type: "native-collection",
		IFluidDataStoreRegistry: registry,
		get IFluidDataStoreFactory() {
			return this;
		},
		async instantiateDataStore(context, existing) {
			const nativeContext = context as FluidDataStoreContextInternal;
			assert(nativeContext.createChannelCollection !== undefined);
			return nativeContext.createChannelCollection(async (collection) => {
				if (!existing) {
					const root = await collection.createDataStore(leafFactory, "root");
					collection.bind(root.entryPoint);
				}
				return collection;
			});
		},
	};
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: factory,
		registryEntries: [[factory.type, factory]],
		oldestSupportedClient: "3.12.0",
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: {
					state: "disableHeuristics",
					initialSummarizerDelayMs: 0,
					maxAckWaitTime: 20000,
					maxOpsSinceLastSummary: 7000,
				},
			},
		},
	});

	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	async function getRoot(collection: IFluidDataStoreChannelCollection): Promise<ISharedMap> {
		return (await (await collection.getDataStoreEntryPoint("root")).get()) as ISharedMap;
	}

	it("routes handles to genuinely nested leaves and composites", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const parent = (await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const root = await getRoot(parent);
		const childStore = await parent.createDataStore(factory);
		const child = (await childStore.entryPoint.get()) as IFluidDataStoreChannelCollection;
		const childRoot = await getRoot(child);
		childRoot.set("value", 42);
		root.set("child", childStore.entryPoint);
		await provider.ensureSynchronized();

		const remote = await provider.loadContainer(runtimeFactory);
		const parent2 = (await remote.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const root2 = await getRoot(parent2);
		const handle = root2.get<IFluidHandle<IFluidDataStoreChannelCollection>>("child");
		assert(handle !== undefined);
		const child2 = await handle.get();
		const childRoot2 = await getRoot(child2);
		assert.equal(childRoot2.get("value"), 42);
		assert.equal(
			toFluidHandleInternal(childRoot.handle).absolutePath,
			`${toFluidHandleInternal(childStore.entryPoint).absolutePath}/root`,
		);
		childRoot2.set("value", 43);
		await provider.ensureSynchronized();
		assert.equal(childRoot.get("value"), 43);
	});

	it("attaches ancestors when only a descendant handle is referenced", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const parent = (await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const root = await getRoot(parent);
		const childStore = await parent.createDataStore(factory);
		const child = (await childStore.entryPoint.get()) as IFluidDataStoreChannelCollection;
		const leaf = await getRoot(child);
		leaf.set("value", 42);
		root.set("descendant", leaf.handle);
		await provider.ensureSynchronized();
		assert.equal(childStore.entryPoint.isAttached, true);

		const remote = await provider.loadContainer(runtimeFactory);
		const remoteRoot = await getRoot(
			(await remote.getEntryPoint()) as IFluidDataStoreChannelCollection,
		);
		const handle = remoteRoot.get<IFluidHandle<ISharedMap>>("descendant");
		assert(handle !== undefined);
		assert.equal((await handle.get()).get("value"), 42);
	});

	it("preserves nested identities and aliases across summary reload", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const parent = (await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const root = await getRoot(parent);
		const childStore = await parent.createDataStore(factory);
		const child = (await childStore.entryPoint.get()) as IFluidDataStoreChannelCollection;
		const leaf = await getRoot(child);
		leaf.set("value", 42);
		assert.equal(await childStore.trySetAlias("named"), "Success");
		root.set("child", childStore.entryPoint);
		await provider.ensureSynchronized();

		const loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory]]);
		const { summarizer } = await createSummarizerCore(container, loader);
		const { summaryVersion } = await summarizeNow(summarizer);
		const remote = await provider.loadContainer(runtimeFactory, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});
		const parent2 = (await remote.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const child2 = (await (
			await parent2.getDataStoreEntryPoint("named")
		).get()) as IFluidDataStoreChannelCollection;
		assert.equal((await getRoot(child2)).get("value"), 42);

		const graph = await parent2.getGCData();
		const rootPath = toFluidHandleInternal(parent2.entryPoint).absolutePath;
		assert(graph.gcNodes["/root"]?.includes(rootPath));
		assert(graph.gcNodes["/"]?.includes(`${rootPath}/root`));
	});

	it("rejects a client compatibility target older than native nesting", async () => {
		const incompatibleFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: factory,
			registryEntries: [[factory.type, factory]],
			oldestSupportedClient: "3.11.0",
		});
		const container = await provider.createContainer(incompatibleFactory);
		const parent = (await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
		await assert.rejects(
			parent.createDataStore(factory),
			/Nested data stores require oldestSupportedClient >= 3.12.0/,
		);
	});

	it("allows a composite channel to be the root of another composite", async () => {
		const rootFactory: IFluidDataStoreFactory & {
			IFluidDataStoreRegistry: IFluidDataStoreRegistry;
		} = {
			type: "composite-root",
			IFluidDataStoreRegistry: registry,
			get IFluidDataStoreFactory() {
				return this;
			},
			async instantiateDataStore(context, existing) {
				const nativeContext = context as FluidDataStoreContextInternal;
				assert(nativeContext.createChannelCollection !== undefined);
				return nativeContext.createChannelCollection(async (collection) => {
					if (!existing) {
						const createdRoot = await collection.createDataStore(factory, "root");
						collection.bind(createdRoot.entryPoint);
					}
					return (await collection.getDataStoreEntryPoint("root")).get();
				});
			},
		};
		const outerFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: rootFactory,
			registryEntries: [[rootFactory.type, rootFactory]],
			oldestSupportedClient: "3.12.0",
		});
		const container = await provider.createContainer(outerFactory);
		const root = await getRoot(
			(await container.getEntryPoint()) as IFluidDataStoreChannelCollection,
		);
		root.set("value", 42);
		await provider.ensureSynchronized();
		const remote = await provider.loadContainer(outerFactory);
		const root2 = await getRoot(
			(await remote.getEntryPoint()) as IFluidDataStoreChannelCollection,
		);
		assert.equal(root2.get("value"), 42);
	});

	it("hosts legacy data stores alongside native leaves", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const collection = (await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const root = await getRoot(collection);
		const legacyStore = await collection.createDataStore(legacyFactory);
		const legacy = (await legacyStore.entryPoint.get()) as ITestFluidObject;
		legacy.root.set("leaf", root.handle);
		root.set("legacy", legacyStore.entryPoint);
		await provider.ensureSynchronized();
		const remote = await provider.loadContainer(runtimeFactory);
		const remoteRoot = await getRoot(
			(await remote.getEntryPoint()) as IFluidDataStoreChannelCollection,
		);
		const handle = remoteRoot.get<IFluidHandle<ITestFluidObject>>("legacy");
		assert(handle !== undefined);
		const legacy2 = await handle.get();
		const leafHandle = legacy2.root.get<IFluidHandle<ISharedMap>>("leaf");
		assert(leafHandle !== undefined);
		assert.equal(await leafHandle.get(), remoteRoot);
		assert.deepEqual(legacy2.context.packagePath, [factory.type, legacyFactory.type]);
	});

	it("rehydrates nested stashed operations and rolls back staged changes", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const collection = (await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const root = await getRoot(collection);
		const legacyStore = await collection.createDataStore(legacyFactory);
		const legacy = (await legacyStore.entryPoint.get()) as ITestFluidObject;
		root.set("legacy", legacyStore.entryPoint);
		root.set("value", 1);
		await provider.ensureSynchronized();
		const staging = legacy.context.containerRuntime.enterStagingMode();
		root.set("value", 2);
		staging.discardChanges();
		assert.equal(root.get("value"), 1);

		await provider.opProcessingController.pauseProcessing(container);
		root.set("value", 42);
		const pending = await getRequiredPendingLocalState(container);
		container.close();
		provider.opProcessingController.resumeProcessing();
		const reloaded = await provider.loadContainer(
			runtimeFactory,
			undefined,
			undefined,
			pending,
		);
		const reloadedRoot = await getRoot(
			(await reloaded.getEntryPoint()) as IFluidDataStoreChannelCollection,
		);
		assert.equal(reloadedRoot.get("value"), 42);
		await provider.ensureSynchronized();
	});

	it("routes signals to a nested data store without changing its application payload", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const collection = (await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const root = await getRoot(collection);
		const childStore = await collection.createDataStore(legacyFactory);
		const child = (await childStore.entryPoint.get()) as ITestFluidObject;
		root.set("child", childStore.entryPoint);
		await provider.ensureSynchronized();
		const remote = await provider.loadContainer(runtimeFactory);
		const remoteRoot = await getRoot(
			(await remote.getEntryPoint()) as IFluidDataStoreChannelCollection,
		);
		const handle = remoteRoot.get<IFluidHandle<ITestFluidObject>>("child");
		assert(handle !== undefined);
		const remoteChild = await handle.get();
		const received = new Promise<unknown>((resolve) => {
			remoteChild.runtime.on("signal", (message, local) => {
				if (!local && message.type === "nested") resolve(message.content);
			});
		});
		const payload = { address: "application-payload", contents: 42 };
		child.runtime.submitSignal("nested", payload);
		assert.deepEqual(await received, payload);
	});
});
