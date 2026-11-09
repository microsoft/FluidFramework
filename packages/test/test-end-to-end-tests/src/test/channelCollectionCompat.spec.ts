/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	describeCompat,
	type ContainerRuntimeApi,
	type DataRuntimeApi,
} from "@fluid-private/test-version-utils";
import { LoaderHeader, type IContainer } from "@fluidframework/container-definitions/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import type { ISharedMap } from "@fluidframework/map/internal";
import type {
	FluidDataStoreContextInternal,
	IFluidDataStoreFactory,
	IFluidDataStoreFactoryInternal,
	IFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import {
	createContainerRuntimeFactoryWithDefaultDataStore,
	createSummarizerCore,
	summarizeNow,
	timeoutPromise,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";

import { pkgVersion } from "../packageVersion.js";

interface CollectionView {
	readonly map: ISharedMap;
	readonly runtime: IFluidDataStoreRuntime;
	createChild(): Promise<ISharedMap>;
}

describeCompat(
	"Channel collection framework compatibility",
	"FullCompat",
	(getProvider, apis) => {
		// Each side must use its own loader, container runtime, data runtime, and DDS implementation.
		// Layer permutations do not exercise this migration between complete framework versions.
		if (apis.mode !== "CrossClientCompat") {
			return;
		}

		function makeFactory(
			containerApi: typeof ContainerRuntimeApi,
			dataApi: typeof DataRuntimeApi,
			summarizer = false,
		) {
			const { SharedMap } = dataApi.dds;
			const channelFactory = SharedMap.getFactory();
			const leafRuntimes = new WeakMap<ISharedMap, IFluidDataStoreRuntime>();
			const leafFactory: IFluidDataStoreFactoryInternal = {
				type: channelFactory.type,
				isLeafChannel: true,
				get IFluidDataStoreFactory() {
					return this;
				},
				async instantiateDataStore(context, existing) {
					const runtime = await dataApi.packages.datastore.LeafChannelRuntime.load(
						context,
						existing,
						channelFactory,
					);
					const map = await runtime.entryPoint.get();
					assert(SharedMap.is(map));
					leafRuntimes.set(map, runtime);
					return runtime;
				},
			};
			const childRegistry: IFluidDataStoreRegistry = {
				get IFluidDataStoreRegistry() {
					return this;
				},
				async get(type) {
					return dataApi.packages.datastore
						.legacySharedObjectTypeAliases(type)
						.includes(channelFactory.type)
						? leafFactory
						: undefined;
				},
			};
			const factory: IFluidDataStoreFactory & {
				IFluidDataStoreRegistry: IFluidDataStoreRegistry;
			} = {
				type: "compat-collection",
				IFluidDataStoreRegistry: childRegistry,
				get IFluidDataStoreFactory() {
					return this;
				},
				async instantiateDataStore(context, existing) {
					// Old clients retain their original implementation and application-selected root name.
					if (dataApi.version !== pkgVersion) {
						return new dataApi.FluidDataStoreRuntime(
							context,
							new Map([[channelFactory.type, channelFactory]]),
							existing,
							async (runtime): Promise<CollectionView> => {
								const map = (
									existing
										? await runtime.getChannel("application-root")
										: SharedMap.create(runtime, "application-root")
								) as ISharedMap;
								assert.equal(map.attributes.type, channelFactory.type);
								if (!existing) map.bindToContext();
								return {
									map,
									runtime,
									createChild: async () => SharedMap.create(runtime),
								};
							},
						);
					}
					const internal = context as FluidDataStoreContextInternal;
					assert(internal.createChannelCollection !== undefined);
					return internal.createChannelCollection(
						async (collection): Promise<CollectionView> => {
							if (!existing) {
								const root = await collection.createDataStore(leafFactory, "application-root");
								collection.bind(root.entryPoint);
							}
							const map = (await (
								await collection.getDataStoreEntryPoint("application-root")
							).get()) as ISharedMap;
							assert(SharedMap.is(map));
							const runtime = leafRuntimes.get(map);
							assert(runtime !== undefined);
							return {
								map,
								runtime,
								async createChild() {
									const child = await collection.createDataStore(leafFactory);
									const value = (await child.entryPoint.get()) as ISharedMap;
									assert(SharedMap.is(value));
									return value;
								},
							};
						},
					);
				},
			};
			return createContainerRuntimeFactoryWithDefaultDataStore(
				containerApi.ContainerRuntimeFactoryWithDefaultDataStore,
				{
					defaultFactory: factory,
					registryEntries: [[factory.type, factory]],
					// This fixture deliberately uses only established DDS capabilities, not native composites.
					oldestSupportedClient: "2.0.0",
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
				},
			);
		}

		let provider: ITestObjectProvider;
		beforeEach(() => {
			provider = getProvider({ syncSummarizer: true });
		});

		async function view(container: IContainer): Promise<CollectionView> {
			return (await container.getEntryPoint()) as CollectionView;
		}

		for (const writer of ["create", "load"] as const) {
			it(`collaborates and reloads a ${writer}-side summary through the other framework`, async () => {
				const createFactory = makeFactory(apis.containerRuntime, apis.dataRuntime);
				const loadFactory = makeFactory(
					apis.containerRuntimeForLoading,
					apis.dataRuntimeForLoading,
				);
				const first = await provider.createContainer(createFactory);
				const firstView = await view(first);
				firstView.map.set("value", 1);
				const second = await provider.loadContainer(loadFactory);
				const secondView = await view(second);
				await provider.ensureSynchronized();
				assert.equal(secondView.map.get("value"), 1);
				secondView.map.set("value", 2);
				await provider.ensureSynchronized();
				assert.equal(firstView.map.get("value"), 2);
				assert.equal(
					toFluidHandleInternal(firstView.map.handle).absolutePath,
					toFluidHandleInternal(secondView.map.handle).absolutePath,
				);

				// Both implementations create new DDS slots after joining, not just load the initial snapshot.
				for (const [source, target] of [
					[firstView, secondView],
					[secondView, firstView],
				]) {
					const child = await source.createChild();
					child.set("value", 42);
					source.map.set("child", child.handle);
					await provider.ensureSynchronized();
					const handle = target.map.get<IFluidHandle<ISharedMap>>("child");
					assert(handle !== undefined);
					const remoteChild = await handle.get();
					remoteChild.set("value", 43);
					await provider.ensureSynchronized();
					assert.equal(child.get("value"), 43);
					const payload = { address: "application-data", contents: 42 };
					const received = timeoutPromise<unknown>((resolve) => {
						target.runtime.once("signal", (message) => resolve(message.content));
					});
					source.runtime.submitSignal("compat", payload);
					assert.deepEqual(await received, payload);
				}

				const writerIsCreate = writer === "create";
				const summaryFactory = writerIsCreate
					? makeFactory(apis.containerRuntime, apis.dataRuntime, true)
					: makeFactory(apis.containerRuntimeForLoading, apis.dataRuntimeForLoading, true);
				const loader = provider.createLoader(
					[[provider.defaultCodeDetails, summaryFactory]],
					undefined,
					writerIsCreate,
				);
				const { summarizer } = await createSummarizerCore(first, loader);
				const { summaryVersion } = await summarizeNow(summarizer);
				const reader = provider.createLoader(
					[[provider.defaultCodeDetails, writerIsCreate ? loadFactory : createFactory]],
					undefined,
					!writerIsCreate,
				);
				const reloaded = await reader.resolve({
					url: await provider.driver.createContainerUrl(provider.documentId),
					headers: { [LoaderHeader.version]: summaryVersion },
				});
				const reloadedView = await view(reloaded);
				assert.equal(reloadedView.map.get("value"), 2);
				const reloadedChild = reloadedView.map.get<IFluidHandle<ISharedMap>>("child");
				assert(reloadedChild !== undefined);
				assert.equal((await reloadedChild.get()).get("value"), 43);
				reloadedView.map.set("value", 3);
				await provider.ensureSynchronized();
				assert.equal(firstView.map.get("value"), 3);
				assert.equal(secondView.map.get("value"), 3);
			});
		}
	},
);
