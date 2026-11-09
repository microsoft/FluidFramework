/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import {
	LoaderHeader,
	type IContainer,
	type IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import type { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import type {
	DataStoreKind,
	DataStoreRegistry,
	FluidContainerAttached,
	FluidContainerWithService,
} from "@fluidframework/driver-definitions/internal";
import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions";
import type { ISharedMap } from "@fluidframework/map/internal";
import type {
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
	IFluidDataStoreFactoryInternal,
	IFluidDataStoreChannelCollection,
	FluidDataStoreContextInternal,
	OldestSupportedClientVersion,
	IFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions/internal";
import {
	convertRegistry,
	dataStoreKindFromFactory,
	fluidContainerFromLegacy,
	makeCodeLoader,
	ServiceClientImplementation,
	ServiceContainerBase,
	toFluidHandleInternal,
} from "@fluidframework/runtime-utils/internal";
import {
	createSummarizerCore,
	defaultTestOldestSupportedClient,
	summarizeNow,
	waitForContainerConnection,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";

// The bridge must preserve the legacy implementation's named channels, factory identity, and document format.
describeCompat("Legacy data-store kind bridge", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap } = apis.dds;
	const { FluidDataStoreRuntime } = apis.dataRuntime;
	const { BaseContainerRuntimeFactory, ContainerRuntime } = apis.containerRuntime;
	const mapFactory = SharedMap.getFactory();
	const contexts = new WeakMap<ISharedMap, IFluidDataStoreContext>();
	const runtimes = new WeakMap<ISharedMap, InstanceType<typeof FluidDataStoreRuntime>>();
	const registry: IFluidDataStoreRegistry = {
		get IFluidDataStoreRegistry() {
			return this;
		},
		async get(type) {
			return type === factory.type ? factory : undefined;
		},
		getSync(type) {
			return type === factory.type ? factory : undefined;
		},
	};
	const factory: IFluidDataStoreFactory & {
		IFluidDataStoreRegistry: IFluidDataStoreRegistry;
	} = {
		type: "legacy-named-map",
		IFluidDataStoreRegistry: registry,
		get IFluidDataStoreFactory() {
			return this;
		},
		async instantiateDataStore(context, existing) {
			assert.equal(this, factory, "The original factory receiver must be preserved");
			const runtime = new FluidDataStoreRuntime(
				context,
				new Map([[mapFactory.type, mapFactory]]),
				existing,
				async (inner) => {
					const map = existing
						? await inner.getChannel("application-selected-root")
						: SharedMap.create(inner, "application-selected-root");
					assert(SharedMap.is(map));
					if (!existing) {
						map.bindToContext();
					}
					contexts.set(map, context);
					runtimes.set(map, runtime);
					return map;
				},
			);
			return runtime;
		},
	};
	const kind = dataStoreKindFromFactory<ISharedMap>(factory);
	const collections = new WeakMap<ISharedMap, IFluidDataStoreChannelCollection>();
	const leafRuntimes = new WeakMap<ISharedMap, IFluidDataStoreRuntime>();
	const leafFactory: IFluidDataStoreFactoryInternal = {
		type: mapFactory.type,
		isLeafChannel: true,
		get IFluidDataStoreFactory() {
			return this;
		},
		async instantiateDataStore(context, existing) {
			const runtime = await apis.dataRuntime.packages.datastore.LeafChannelRuntime.load(
				context,
				existing,
				mapFactory,
			);
			const map = await runtime.entryPoint.get();
			assert(SharedMap.is(map));
			leafRuntimes.set(map, runtime);
			return runtime;
		},
	};
	/**
	 * Replaces the parent runtime while retaining its factory type and root name, unlike the bridge-only fixture.
	 * This "NoCompat" suite exercises mixed APIs/layouts using current packages, not older framework versions.
	 */
	const modernFactory: IFluidDataStoreFactory & {
		IFluidDataStoreRegistry: IFluidDataStoreRegistry;
	} = {
		type: factory.type,
		get IFluidDataStoreFactory() {
			return this;
		},
		IFluidDataStoreRegistry: {
			get IFluidDataStoreRegistry() {
				return this;
			},
			async get(type) {
				return type === leafFactory.type
					? leafFactory
					: type === factory.type
						? factory
						: undefined;
			},
		},
		async instantiateDataStore(context, existing) {
			const internal = context as FluidDataStoreContextInternal;
			assert(internal.createChannelCollection !== undefined);
			return internal.createChannelCollection(async (collection) => {
				if (!existing) {
					const root = await collection.createDataStore(
						leafFactory,
						"application-selected-root",
					);
					collection.bind(root.entryPoint);
				}
				const handle = await collection.getDataStoreEntryPoint("application-selected-root");
				const map = (await handle.get()) as ISharedMap;
				collections.set(map, collection);
				return map;
			});
		},
	};
	const modernKind = dataStoreKindFromFactory<ISharedMap>(modernFactory);
	const kinds: DataStoreRegistry = async (type) => {
		assert.equal(type, factory.type);
		return kind;
	};

	const legacyFactory = new BaseContainerRuntimeFactory({
		oldestSupportedClient: defaultTestOldestSupportedClient,
		registryEntries: [[factory.type, factory]],
		provideEntryPoint: async (runtime) => {
			const root = await runtime.getAliasedDataStoreEntryPoint("root");
			assert(root !== undefined);
			return root.get();
		},
	});
	class LegacyCreatingFactory extends BaseContainerRuntimeFactory {
		public constructor(private readonly rootAlias = "root") {
			super({
				oldestSupportedClient: defaultTestOldestSupportedClient,
				registryEntries: [[factory.type, factory]],
				provideEntryPoint: async (runtime) => {
					const root = await runtime.getAliasedDataStoreEntryPoint(rootAlias);
					assert(root !== undefined);
					return root.get();
				},
			});
		}
		protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {
			const root = await runtime.createDataStore(factory.type);
			assert.equal(await root.trySetAlias(this.rootAlias), "Success");
		}
	}

	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	async function alphaFactory(
		registryKinds: DataStoreRegistry,
		root?: DataStoreKind,
		oldestSupportedClient: OldestSupportedClientVersion = defaultTestOldestSupportedClient,
	): Promise<IRuntimeFactory> {
		const loader = makeCodeLoader(
			registryKinds,
			oldestSupportedClient,
			async (parameters) => {
				const { runtime } = await ContainerRuntime.loadRuntime2({
					...parameters,
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
				if (!parameters.existing) {
					assert(parameters.newContainerRootType !== undefined);
					const store = await runtime.createDataStore(parameters.newContainerRootType);
					assert.equal(await store.trySetAlias("root"), "Success");
				}
				return runtime;
			},
			root,
		);
		const loaded = await loader.load(provider.defaultCodeDetails);
		const runtimeFactory = loaded.module.fluidExport.IRuntimeFactory;
		assert(runtimeFactory !== undefined);
		return runtimeFactory;
	}

	class TestServiceContainer<T> extends ServiceContainerBase<T> {
		public constructor(
			container: IContainer,
			publicRegistry: DataStoreRegistry,
			data: T,
			id?: string,
		) {
			super(publicRegistry as DataStoreRegistry<T>, undefined, container, data, id);
		}
		protected createAttachRequest(): IRequest {
			return provider.driver.createCreateNewRequest(provider.documentId);
		}
	}

	const client = new ServiceClientImplementation(undefined, {
		async createDetached<T>(
			registryKinds: DataStoreRegistry<T>,
			_options: undefined,
			root: DataStoreKind<T>,
		): Promise<FluidContainerWithService<T>> {
			const container = await provider.createDetachedContainer(
				await alphaFactory(registryKinds, root),
			);
			return new TestServiceContainer(
				container,
				registryKinds,
				(await container.getEntryPoint()) as T,
			);
		},
		async load<T>(
			registryKinds: DataStoreRegistry<T>,
			_options: undefined,
			id: string,
		): Promise<FluidContainerAttached<T>> {
			assert.equal(id, provider.documentId);
			const container = await provider.loadContainer(await alphaFactory(registryKinds));
			return new TestServiceContainer(
				container,
				registryKinds,
				(await container.getEntryPoint()) as T,
				id,
			) as TestServiceContainer<T> & { id: string };
		},
	});

	it("preserves factory identity and its nested registry", async () => {
		assert.equal(dataStoreKindFromFactory(factory), kind);
		const entry = await convertRegistry(kinds).get(factory.type);
		assert.equal(entry?.IFluidDataStoreFactory, factory);
		assert.equal(entry?.IFluidDataStoreRegistry, registry);
	});

	it("migrates the parent runtime while preserving legacy DDS operations and attachment", async () => {
		const container = await provider.createContainer(new LegacyCreatingFactory());
		const legacy = (await container.getEntryPoint()) as ISharedMap;
		legacy.set("value", 1);
		await provider.ensureSynchronized();
		const alpha = await client.loadContainer(provider.documentId, modernKind);
		await provider.ensureSynchronized();
		assert.equal(alpha.data.get("value"), 1);
		alpha.data.set("value", 2);
		await provider.ensureSynchronized();
		assert.equal(legacy.get("value"), 2);
		const runtime = runtimes.get(legacy);
		assert(runtime !== undefined);
		const oldChild = SharedMap.create(runtime, "later-old-child");
		oldChild.set("value", 42);
		legacy.set("oldChild", oldChild.handle);
		await provider.ensureSynchronized();
		const oldHandle = alpha.data.get<IFluidHandle<ISharedMap>>("oldChild");
		assert(oldHandle !== undefined);
		const newView = await oldHandle.get();
		newView.set("value", 43);
		await provider.ensureSynchronized();
		assert.equal(oldChild.get("value"), 43);
		const collection = collections.get(alpha.data);
		assert(collection !== undefined);
		const newChild = await collection.createDataStore(leafFactory);
		const newMap = (await newChild.entryPoint.get()) as ISharedMap;
		newMap.set("value", 44);
		alpha.data.set("newChild", newMap.handle);
		await provider.ensureSynchronized();
		const newHandle = legacy.get<IFluidHandle<ISharedMap>>("newChild");
		assert(newHandle !== undefined);
		assert.equal((await newHandle.get()).get("value"), 44);
		assert.equal(
			toFluidHandleInternal(alpha.data.handle).absolutePath,
			toFluidHandleInternal(legacy.handle).absolutePath,
		);
	});

	it("adds a composite child after rollout without relocating existing DDS children", async () => {
		const oldContainer = await provider.createContainer(new LegacyCreatingFactory());
		const oldRoot = (await oldContainer.getEntryPoint()) as ISharedMap;
		oldRoot.set("value", 42);
		const rootPath = toFluidHandleInternal(oldRoot.handle).absolutePath;
		await provider.ensureSynchronized();
		oldContainer.close();
		const runtimeFactory = await alphaFactory(async () => modernKind, undefined, "3.12.0");
		const container = await provider.loadContainer(runtimeFactory);
		const root = (await container.getEntryPoint()) as ISharedMap;
		assert.equal(toFluidHandleInternal(root.handle).absolutePath, rootPath);
		const collection = collections.get(root);
		assert(collection !== undefined);
		const nested = await collection.createDataStore(factory);
		const nestedMap = (await nested.entryPoint.get()) as ISharedMap;
		nestedMap.set("value", 43);
		root.set("nested", nestedMap.handle);
		await provider.ensureSynchronized();
		const loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory]]);
		const { summarizer } = await createSummarizerCore(container, loader);
		const { summaryVersion, summaryTree } = await summarizeNow(summarizer);
		const channels: SummaryObject | undefined = summaryTree.tree[".channels"];
		assert(channels?.type === SummaryType.Tree);
		const context = contexts.get(oldRoot);
		assert(context !== undefined);
		const store: SummaryObject | undefined = channels.tree[context.id];
		assert(store?.type === SummaryType.Tree);
		const children: SummaryObject | undefined = store.tree[".channels"];
		assert(children?.type === SummaryType.Tree);
		const named: SummaryObject | undefined = children.tree["application-selected-root"];
		assert(named?.type === SummaryType.Tree);
		assert(named.tree[".attributes"]?.type === SummaryType.Blob);
		assert.equal(named.tree[".component"], undefined);
		assert.equal(named.tree[".channels"], undefined);
		const remote = await provider.loadContainer(runtimeFactory, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});
		const remoteRoot = (await remote.getEntryPoint()) as ISharedMap;
		assert.equal(remoteRoot.get("value"), 42);
		assert.equal(toFluidHandleInternal(remoteRoot.handle).absolutePath, rootPath);
		const handle = remoteRoot.get<IFluidHandle<ISharedMap>>("nested");
		assert(handle !== undefined);
		assert.equal((await handle.get()).get("value"), 43);
	});

	it("preserves legacy broadcast signals without interpreting application payloads as routing", async () => {
		const container = await provider.createContainer(new LegacyCreatingFactory());
		const legacy = (await container.getEntryPoint()) as ISharedMap;
		const alpha = await client.loadContainer(provider.documentId, modernKind);
		assert(alpha instanceof TestServiceContainer);
		await Promise.all([
			waitForContainerConnection(container),
			waitForContainerConnection(alpha.container),
		]);
		const oldRuntime = runtimes.get(legacy);
		const newRuntime = leafRuntimes.get(alpha.data);
		assert(oldRuntime !== undefined && newRuntime !== undefined);
		await provider.ensureSynchronized();
		const payload = { address: "application-data", contents: 42 };
		const receivedNew = new Promise<unknown>((resolve) => {
			newRuntime.on("signal", (message, local) => {
				if (!local && message.type === "__fluid_native_channel_signal")
					resolve(message.content);
			});
		});
		oldRuntime.submitSignal("__fluid_native_channel_signal", payload);
		assert.deepEqual(await receivedNew, payload);
		const receivedOld = new Promise<unknown>((resolve) => {
			oldRuntime.on("signal", (message, local) => {
				if (!local && message.type === "reply") resolve(message.content);
			});
		});
		newRuntime.submitSignal("reply", payload);
		assert.deepEqual(await receivedOld, payload);
	});

	it("adopts an attached legacy container with an application-selected root alias", async () => {
		const containerFactory = new LegacyCreatingFactory("application-root");
		const container = await provider.createContainer(containerFactory);
		const legacy = (await container.getEntryPoint()) as ISharedMap;
		const alpha = fluidContainerFromLegacy(container, legacy, kinds);
		assert.equal(alpha.data, legacy);
		const child = await alpha.createDataStore(kind);
		child.set("value", 42);
		alpha.data.set("child", child.handle);
		await provider.ensureSynchronized();
		const remote = await provider.loadContainer(containerFactory);
		await provider.ensureSynchronized();
		const remoteMap = (await remote.getEntryPoint()) as ISharedMap;
		const handle = remoteMap.get<IFluidHandle<ISharedMap>>("child");
		assert(handle !== undefined);
		assert.equal((await handle.get()).get("value"), 42);
		alpha.close();
		assert(container.closed);
	});

	it("opens a legacy document, collaborates, and consumes newly created named channels", async () => {
		const legacyContainer = await provider.createContainer(new LegacyCreatingFactory());
		const legacy = (await legacyContainer.getEntryPoint()) as ISharedMap;
		legacy.set("value", 1);
		await provider.ensureSynchronized();
		const alpha = await client.loadContainer(provider.documentId, kind);
		await provider.ensureSynchronized();
		assert.equal(alpha.data.get("value"), 1);
		assert.equal(
			toFluidHandleInternal(alpha.data.handle).absolutePath,
			toFluidHandleInternal(legacy.handle).absolutePath,
		);
		alpha.data.set("value", 2);
		await provider.ensureSynchronized();
		assert.equal(legacy.get("value"), 2);

		const runtime = runtimes.get(legacy);
		assert(runtime !== undefined);
		const named = SharedMap.create(runtime, "later-legacy-channel");
		named.set("value", 42);
		legacy.set("later", named.handle);
		await provider.ensureSynchronized();
		const handle = alpha.data.get<IFluidHandle<ISharedMap>>("later");
		assert(handle !== undefined);
		const remote = await handle.get();
		assert.equal(remote.get("value"), 42);
		remote.set("value", 43);
		await provider.ensureSynchronized();
		assert.equal(named.get("value"), 43);
	});

	it("creates legacy-shaped stores through the alpha creator and preserves package lookup", async () => {
		const container = await provider.createContainer(new LegacyCreatingFactory());
		const legacy = (await container.getEntryPoint()) as ISharedMap;
		const alpha = await client.loadContainer(provider.documentId, kind);
		const created = await alpha.createDataStore(kind);
		created.set("value", 42);
		alpha.data.set("created", created.handle);
		const context = contexts.get(alpha.data);
		assert(context !== undefined);
		const child = await context.containerRuntime.createDataStore([factory.type, factory.type]);
		const childMap = (await child.entryPoint.get()) as ISharedMap;
		alpha.data.set("nested-factory", childMap.handle);
		await provider.ensureSynchronized();
		const handle = legacy.get<IFluidHandle<ISharedMap>>("created");
		assert(handle !== undefined);
		assert.equal((await handle.get()).get("value"), 42);
		assert.deepEqual(contexts.get(childMap)?.packagePath, [factory.type, factory.type]);
	});

	it("loads an alpha-created document through legacy APIs", async () => {
		const alpha = await client.createContainer(kind);
		assert(alpha instanceof TestServiceContainer);
		alpha.data.set("value", 42);
		await provider.attachDetachedContainer(alpha.container);
		const legacyContainer = await provider.loadContainer(legacyFactory);
		const legacy = (await legacyContainer.getEntryPoint()) as ISharedMap;
		assert.equal(legacy.get("value"), 42);
		legacy.set("value", 43);
		await provider.ensureSynchronized();
		assert.equal(alpha.data.get("value"), 43);
	});

	for (const writer of ["legacy", "alpha", "generalized"] as const) {
		it(`reloads a ${writer} summary through the other API`, async () => {
			const container = await provider.createContainer(new LegacyCreatingFactory());
			const legacy = (await container.getEntryPoint()) as ISharedMap;
			legacy.set("value", 42);
			await provider.ensureSynchronized();
			const summaryFactory =
				writer === "legacy"
					? legacyFactory
					: await alphaFactory(writer === "generalized" ? async () => modernKind : kinds);
			const loader = provider.createLoader([[provider.defaultCodeDetails, summaryFactory]]);
			const { summarizer } = await createSummarizerCore(container, loader);
			const { summaryVersion } = await summarizeNow(summarizer);
			const readerFactory =
				writer === "legacy" ? await alphaFactory(async () => modernKind) : legacyFactory;
			const reader = await provider.loadContainer(readerFactory, undefined, {
				[LoaderHeader.version]: summaryVersion,
			});
			const map = (await reader.getEntryPoint()) as ISharedMap;
			assert.equal(map.get("value"), 42);
			assert.equal(
				toFluidHandleInternal(map.handle).absolutePath,
				toFluidHandleInternal(legacy.handle).absolutePath,
			);
		});
	}
});
