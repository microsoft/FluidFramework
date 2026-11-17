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
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions";
import type {
	DataStoreKind,
	DataStoreRegistry,
	FluidContainerAttached,
	FluidContainerWithService,
} from "@fluidframework/driver-definitions/internal";
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

/**
 * Verifies that legacy factories and containers can use the ServiceClient APIs without migrating persisted documents.
 * Exercises both bridges with real runtimes: factory identity and child registries, initialization-time child creation,
 * application-selected roots, named channels, handles, and collaboration across the two APIs.
 * Checks that mismatched factories are rejected and that summaries retain the legacy structure and load through either API.
 * This tests interoperability between APIs at the same version, not compatibility between client versions.
 */
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
					// The entry point is a named channel, not a separate hosting object.
					// Its name must survive creation and loading through either API.
					const map = existing
						? await inner.getChannel("application-selected-root")
						: SharedMap.create(inner, "application-selected-root");
					assert(SharedMap.is(map));
					if (!existing) {
						map.bindToContext();
					}
					// Keep test-only access to the internals without changing the map's entry-point shape.
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

	const makeLegacyFactory = (
		summarizer: boolean,
	): InstanceType<typeof BaseContainerRuntimeFactory> =>
		new BaseContainerRuntimeFactory({
			oldestSupportedClient: defaultTestOldestSupportedClient,
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: {
						// Summary tests trigger summaries explicitly; other tests need no summarizer.
						state: summarizer ? "disableHeuristics" : "disabled",
						initialSummarizerDelayMs: 0,
						maxAckWaitTime: 20000,
						maxOpsSinceLastSummary: 7000,
					},
				},
			},
			registryEntries: [[factory.type, factory]],
			provideEntryPoint: async (runtime) => {
				const root = await runtime.getAliasedDataStoreEntryPoint("root");
				assert(root !== undefined);
				return root.get();
			},
		});
	const legacyFactory = makeLegacyFactory(false);
	class LegacyCreatingFactory extends BaseContainerRuntimeFactory {
		public constructor(private readonly rootAlias = "root") {
			super({
				oldestSupportedClient: defaultTestOldestSupportedClient,
				runtimeOptions: { summaryOptions: { summaryConfigOverrides: { state: "disabled" } } },
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
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	async function alphaFactory(
		registryKinds: DataStoreRegistry,
		root?: DataStoreKind,
		oldestSupportedClient: OldestSupportedClientVersion = defaultTestOldestSupportedClient,
		summarizer = false,
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
								state: summarizer ? "disableHeuristics" : "disabled",
								initialSummarizerDelayMs: 0,
								maxAckWaitTime: 20000,
								maxOpsSinceLastSummary: 7000,
							},
						},
					},
				});
				if (!parameters.existing) {
					// Match ServiceClient's root convention without changing existing documents.
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
			super(publicRegistry, undefined, container, data, id);
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
			// Use the test provider for service-specific loading while exercising the shared client logic.
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

	it("preserves factory identity and its child registry", async () => {
		assert.equal(dataStoreKindFromFactory(factory), kind);
		const entry = await convertRegistry(kinds).get(factory.type);
		assert.equal(entry?.IFluidDataStoreFactory, factory);
		assert.equal(entry?.IFluidDataStoreRegistry, registry);
	});

	it("preserves a legacy .aliases child and rejects metadata that would overwrite it", async () => {
		const container = await provider.createContainer(new LegacyCreatingFactory());
		const legacy = (await container.getEntryPoint()) as ISharedMap;
		const runtime = runtimes.get(legacy);
		assert(runtime !== undefined);
		const reserved = SharedMap.create(runtime, ".aliases");
		reserved.set("value", 42);
		legacy.set("reserved", reserved.handle);
		await provider.ensureSynchronized();

		const runtimeFactory = await alphaFactory(async () => modernKind, undefined, "3.12.0");
		const modern = await provider.loadContainer(runtimeFactory);
		await provider.ensureSynchronized();
		const root = (await modern.getEntryPoint()) as ISharedMap;
		const collection = collections.get(root);
		assert(collection !== undefined);
		const child = await collection.createDataStore(leafFactory);
		await assert.rejects(child.trySetAlias("named"), /existing .aliases child/);
		root.set("child", child.entryPoint);
		await provider.ensureSynchronized();
		const loader = provider.createLoader([
			[
				provider.defaultCodeDetails,
				await alphaFactory(async () => modernKind, undefined, "3.12.0", true),
			],
		]);
		const { summarizer } = await createSummarizerCore(modern, loader);
		await provider.ensureSynchronized();
		const { summaryVersion } = await summarizeNow(summarizer);
		const reloaded = await provider.loadContainer(legacyFactory, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});
		const reloadedRoot = (await reloaded.getEntryPoint()) as ISharedMap;
		const handle = reloadedRoot.get<IFluidHandle<ISharedMap>>("reserved");
		assert(handle !== undefined);
		assert.equal((await handle.get()).get("value"), 42);
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
		const loader = provider.createLoader([
			[
				provider.defaultCodeDetails,
				await alphaFactory(async () => modernKind, undefined, "3.12.0", true),
			],
		]);
		const { summarizer } = await createSummarizerCore(container, loader);
		await provider.ensureSynchronized();
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
		// Bypass ServiceClient's "root" lookup: adoption receives the root resolved by legacy code.
		const containerFactory = new LegacyCreatingFactory("application-root");
		const container = await provider.createContainer(containerFactory);
		const legacy = (await container.getEntryPoint()) as ISharedMap;
		const alpha = fluidContainerFromLegacy(container, legacy, kinds, provider.documentId);
		assert.equal(alpha.id, provider.documentId);
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
		// Equal contents alone would not detect a copied root at a different handle path.
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
		// The second path segment resolves through the first factory's child registry.
		// Reusing the same type at both levels makes loss of that registry observable.
		const child = await context.containerRuntime.createDataStore([factory.type, factory.type]);
		const childMap = (await child.entryPoint.get()) as ISharedMap;
		alpha.data.set("child-factory", childMap.handle);
		await provider.ensureSynchronized();
		const handle = legacy.get<IFluidHandle<ISharedMap>>("created");
		assert(handle !== undefined);
		assert.equal((await handle.get()).get("value"), 42);
		assert.deepEqual(contexts.get(childMap)?.packagePath, [factory.type, factory.type]);
		const childHandle = legacy.get<IFluidHandle<ISharedMap>>("child-factory");
		assert(childHandle !== undefined);
		assert(SharedMap.is(await childHandle.get()));
	});

	it("creates registered children during legacy factory initialization", async () => {
		const childFactory = {
			type: "initializing-child",
			get IFluidDataStoreFactory() {
				return this;
			},
			async instantiateDataStore(context, existing) {
				return factory.instantiateDataStore(context, existing);
			},
			createDataStore(context: IFluidDataStoreContext) {
				// Synchronous child creation returns the map directly; remote loading uses instantiateDataStore.
				const runtime = new FluidDataStoreRuntime(
					context,
					new Map([[mapFactory.type, mapFactory]]),
					false,
					async () => map,
				);
				const map = SharedMap.create(runtime, "application-selected-root");
				map.bindToContext();
				return { runtime, map };
			},
		} satisfies IFluidDataStoreFactory;
		const childRegistry: IFluidDataStoreRegistry = {
			get IFluidDataStoreRegistry() {
				return this;
			},
			getSync(type) {
				return type === childFactory.type ? childFactory : undefined;
			},
			async get(type) {
				return this.getSync?.(type);
			},
		};
		const parentFactory: IFluidDataStoreFactory & {
			IFluidDataStoreRegistry: IFluidDataStoreRegistry;
		} = {
			type: "initializing-parent",
			IFluidDataStoreRegistry: childRegistry,
			get IFluidDataStoreFactory() {
				return this;
			},
			async instantiateDataStore(context, existing) {
				const runtime = await factory.instantiateDataStore(context, existing);
				if (!existing) {
					// The child registry must be available before parent instantiation completes.
					assert(context.createChildDataStore !== undefined);
					const child = context.createChildDataStore(childFactory);
					child.map.set("value", 42);
					const initializedRoot = (await runtime.entryPoint.get()) as ISharedMap;
					initializedRoot.set("child", child.map.handle);
				}
				return runtime;
			},
		};
		const parentKind = dataStoreKindFromFactory<ISharedMap>(parentFactory);
		const parentKinds: DataStoreRegistry = async () => parentKind;
		const runtimeFactory = await alphaFactory(parentKinds, parentKind);
		const container = await provider.createContainer(runtimeFactory);
		const root = (await container.getEntryPoint()) as ISharedMap;
		const alpha = fluidContainerFromLegacy(container, root, parentKinds, provider.documentId);
		const additional = await alpha.createDataStore(parentKind);
		assert.equal(additional.handle.isAttached, false);
		// Publishing the parent handle must attach its initialized child as well.
		root.set("additional", additional.handle);
		await provider.ensureSynchronized();

		const remote = await provider.loadContainer(runtimeFactory);
		await provider.ensureSynchronized();
		const remoteRoot = (await remote.getEntryPoint()) as ISharedMap;
		const additionalHandle = remoteRoot.get<IFluidHandle<ISharedMap>>("additional");
		assert(additionalHandle !== undefined);
		const remoteAdditional = await additionalHandle.get();
		const childHandle = remoteAdditional.get<IFluidHandle<ISharedMap>>("child");
		assert(childHandle !== undefined);
		const remoteChild = await childHandle.get();
		assert.equal(remoteChild.get("value"), 42);
		remoteChild.set("value", 43);
		await provider.ensureSynchronized();
		const localChildHandle = additional.get<IFluidHandle<ISharedMap>>("child");
		assert(localChildHandle !== undefined);
		assert.equal((await localChildHandle.get()).get("value"), 43);
	});

	it("rejects an adopted registry with a different factory for the same type", async () => {
		const container = await provider.createContainer(new LegacyCreatingFactory());
		const root = (await container.getEntryPoint()) as ISharedMap;
		const conflictingFactory: IFluidDataStoreFactory = {
			type: factory.type,
			get IFluidDataStoreFactory() {
				return this;
			},
			async instantiateDataStore() {
				assert.fail("A conflicting factory must not be instantiated");
			},
		};
		const conflictingKind = dataStoreKindFromFactory<ISharedMap>(conflictingFactory);
		const alpha = fluidContainerFromLegacy(
			container,
			root,
			async () => conflictingKind,
			provider.documentId,
		);
		await assert.rejects(
			alpha.createDataStore(conflictingKind),
			/The data-store kind does not match the factory registered in the container runtime/,
		);
	});

	it("loads an alpha-created document through legacy APIs", async () => {
		const alpha = await client.createContainer(kind);
		assert(alpha instanceof TestServiceContainer);
		alpha.data.set("value", 42);
		await provider.attachDetachedContainer(alpha.container);
		const legacyContainer = await provider.loadContainer(legacyFactory);
		await provider.ensureSynchronized();
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
					? makeLegacyFactory(true)
					: await alphaFactory(
							writer === "generalized" ? async () => modernKind : kinds,
							undefined,
							defaultTestOldestSupportedClient,
							true,
						);
			const loader = provider.createLoader([[provider.defaultCodeDetails, summaryFactory]]);
			const { summarizer } = await createSummarizerCore(container, loader);
			await provider.ensureSynchronized();
			const { summaryVersion, summaryTree } = await summarizeNow(summarizer);
			const channels: SummaryObject | undefined = summaryTree.tree[".channels"];
			assert(channels?.type === SummaryType.Tree);
			const context = contexts.get(legacy);
			assert(context !== undefined);
			const store: SummaryObject | undefined = channels.tree[context.id];
			assert(store?.type === SummaryType.Tree);
			const children: SummaryObject | undefined = store.tree[".channels"];
			assert(children?.type === SummaryType.Tree);
			const named: SummaryObject | undefined = children.tree["application-selected-root"];
			assert(named?.type === SummaryType.Tree);
			// This must remain a channel summary, not an extra data-store layer around the channel.
			assert(named.tree[".attributes"]?.type === SummaryType.Blob);
			assert.equal(named.tree[".component"], undefined);
			assert.equal(named.tree[".channels"], undefined);

			const readerFactory =
				writer === "legacy" ? await alphaFactory(async () => modernKind) : legacyFactory;
			const reader = await provider.loadContainer(readerFactory, undefined, {
				// Read the exact summary just inspected, rather than a default or earlier version.
				[LoaderHeader.version]: summaryVersion,
			});
			await provider.ensureSynchronized();
			const map = (await reader.getEntryPoint()) as ISharedMap;
			assert.equal(map.get("value"), 42);
			assert.equal(
				toFluidHandleInternal(map.handle).absolutePath,
				toFluidHandleInternal(legacy.handle).absolutePath,
			);
		});
	}
});
