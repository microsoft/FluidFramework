/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import {
	ConnectionState,
	LoaderHeader,
	type IContainer,
} from "@fluidframework/container-definitions/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions";
import type { ISharedMap } from "@fluidframework/map/internal";
import type {
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import {
	createSummarizerCore,
	getRequiredPendingLocalState,
	summarizeNow,
	waitForContainerConnection,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";
import type { ITree } from "@fluidframework/tree/alpha";

describeCompat("Native leaf channels", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap } = apis.dds;
	const { LeafChannelRuntime } = apis.dataRuntime.packages.datastore;
	const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;
	const contexts = new WeakMap<ISharedMap, IFluidDataStoreContext>();
	const channelFactory = SharedMap.getFactory();
	const factory: IFluidDataStoreFactory = {
		type: channelFactory.type,
		get IFluidDataStoreFactory() {
			return this;
		},
		async instantiateDataStore(context, existing) {
			const runtime = await LeafChannelRuntime.load(context, existing, channelFactory);
			const map = await runtime.entryPoint.get();
			assert(SharedMap.is(map));
			contexts.set(map, context);
			return runtime;
		},
	};
	const makeRuntimeFactory = (
		summarizer: boolean,
	): InstanceType<typeof ContainerRuntimeFactoryWithDefaultDataStore> =>
		new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: factory,
			registryEntries: [[factory.type, factory]],
			oldestSupportedClient: "3.12.0",
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
	const runtimeFactory = makeRuntimeFactory(false);

	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	async function getMap(container: IContainer): Promise<ISharedMap> {
		const value = (await container.getEntryPoint()) as ISharedMap;
		assert(SharedMap.is(value));
		return value;
	}

	it("attaches new references added to a rehydrated detached leaf", async () => {
		const detached = await provider.createDetachedContainer(runtimeFactory);
		const snapshot = detached.serialize();
		detached.close();
		const loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory]]);
		const rehydrated = await loader.rehydrateDetachedContainerFromSnapshot(snapshot);
		const root = await getMap(rehydrated);
		const context = contexts.get(root);
		assert(context !== undefined);
		const childStore = await context.containerRuntime.createDataStore(factory.type);
		const child = (await childStore.entryPoint.get()) as ISharedMap;
		child.set("value", 42);
		root.set("child", child.handle);
		await provider.attachDetachedContainer(rehydrated);
		assert(child.handle.isAttached, "The referenced child must be included in attachment");
		await provider.ensureSynchronized();

		const remote = await provider.loadContainer(runtimeFactory);
		const remoteRoot = await getMap(remote);
		const childHandle = remoteRoot.get<IFluidHandle<ISharedMap>>("child");
		assert(childHandle !== undefined);
		const remoteChild = await childHandle.get();
		assert.equal(remoteChild.get("value"), 42);
		remoteChild.set("value", 43);
		await provider.ensureSynchronized();
		assert.equal(child.get("value"), 43);
	});

	it("collaborates with the root shared object's own identity", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const root = await getMap(container);
		const context = contexts.get(root);
		assert(context !== undefined);
		assert.equal(toFluidHandleInternal(root.handle).absolutePath, `/${context.id}`);
		root.set("value", 1);
		const container2 = await provider.loadContainer(runtimeFactory);
		const root2 = await getMap(container2);
		await provider.ensureSynchronized();
		assert.equal(root2.get("value"), 1);
		root2.set("value", 2);
		await provider.ensureSynchronized();
		assert.equal(root.get("value"), 2);
	});

	it("attaches an additional leaf through its handle", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const root = await getMap(container);
		const context = contexts.get(root);
		assert(context !== undefined);
		const childStore = await context.containerRuntime.createDataStore(factory.type);
		const child = (await childStore.entryPoint.get()) as ISharedMap;
		assert(SharedMap.is(child));
		child.set("value", 42);
		assert.equal(child.handle.isAttached, false);
		root.set("child", child.handle);
		await provider.ensureSynchronized();
		assert.equal(child.handle.isAttached, true);

		const container2 = await provider.loadContainer(runtimeFactory);
		await provider.ensureSynchronized();
		const root2 = await getMap(container2);
		const handle = root2.get<IFluidHandle<ISharedMap>>("child");
		assert(handle !== undefined);
		const child2 = await handle.get();
		assert.equal(child2.get("value"), 42);
		child2.set("value", 43);
		await provider.ensureSynchronized();
		assert.equal(child.get("value"), 43);
	});

	it("summarizes and reloads without a synthetic child channel", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const root = await getMap(container);
		root.set("value", 42);
		await provider.ensureSynchronized();
		const loader = provider.createLoader([
			[provider.defaultCodeDetails, makeRuntimeFactory(true)],
		]);
		const { summarizer } = await createSummarizerCore(container, loader);
		await provider.ensureSynchronized();
		const { summaryTree, summaryVersion } = await summarizeNow(summarizer);
		const channels: SummaryObject | undefined = summaryTree.tree[".channels"];
		assert(channels?.type === SummaryType.Tree);
		const node: SummaryObject | undefined = channels.tree[root.id];
		assert(node?.type === SummaryType.Tree);
		const content: SummaryObject | undefined = node.tree[".channels"];
		assert(content?.type === SummaryType.Tree);
		assert(content.tree[".attributes"]?.type === SummaryType.Blob);
		assert(content.tree.header?.type === SummaryType.Blob);
		assert.equal(content.tree.root, undefined);
		assert.equal(content.tree[root.id], undefined);

		const reloaded = await provider.loadContainer(runtimeFactory, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});
		const root2 = await getMap(reloaded);
		assert.equal(root2.get("value"), 42);
		root2.set("value", 43);
		await provider.ensureSynchronized();
		assert.equal(root.get("value"), 43);
	});

	it("resubmits changes made while disconnected", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const root = await getMap(container);
		const container2 = await provider.loadContainer(runtimeFactory);
		const root2 = await getMap(container2);
		await Promise.all([
			waitForContainerConnection(container),
			waitForContainerConnection(container2),
		]);
		await provider.ensureSynchronized();
		assert.equal(container.connectionState, ConnectionState.Connected);
		container.disconnect();
		assert.equal(container.connectionState, ConnectionState.Disconnected);
		root.set("offline", true);
		container.connect();
		await waitForContainerConnection(container);
		assert.equal(container.connectionState, ConnectionState.Connected);
		await provider.ensureSynchronized();
		assert.equal(root2.get("offline"), true);
	});

	it("rehydrates stashed operations", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const root = await getMap(container);
		await waitForContainerConnection(container);
		await provider.ensureSynchronized();
		await provider.opProcessingController.pauseProcessing(container);
		root.set("stashed", 42);
		const pending = await getRequiredPendingLocalState(container);
		container.close();
		provider.opProcessingController.resumeProcessing();
		const reloaded = await provider.loadContainer(
			runtimeFactory,
			undefined,
			undefined,
			pending,
		);
		assert.equal((await getMap(reloaded)).get("stashed"), 42);
		await provider.ensureSynchronized();
		const remote = await provider.loadContainer(runtimeFactory);
		await provider.ensureSynchronized();
		assert.equal((await getMap(remote)).get("stashed"), 42);
	});

	it("rolls back discarded staging-mode operations", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const root = await getMap(container);
		const context = contexts.get(root);
		assert(context !== undefined);
		root.set("value", 1);
		await provider.ensureSynchronized();
		const stage = context.containerRuntime.enterStagingMode();
		root.set("value", 2);
		stage.discardChanges();
		assert.equal(root.get("value"), 1);
		root.set("value", 3);
		await provider.ensureSynchronized();
		const remote = await provider.loadContainer(runtimeFactory);
		await provider.ensureSynchronized();
		assert.equal((await getMap(remote)).get("value"), 3);
	});

	it("hosts SharedTree with the container's ID compressor", async () => {
		const { SharedTree } = apis.dds;
		const { SchemaFactory, TreeViewConfiguration } = apis.dataRuntime.packages.tree;
		const treeFactory = SharedTree.getFactory();
		const storeFactory: IFluidDataStoreFactory = {
			type: treeFactory.type,
			get IFluidDataStoreFactory() {
				return this;
			},
			async instantiateDataStore(context, existing) {
				return LeafChannelRuntime.load(context, existing, treeFactory);
			},
		};
		const treeRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: storeFactory,
			registryEntries: [[storeFactory.type, storeFactory]],
			oldestSupportedClient: "3.12.0",
			runtimeOptions: {
				enableRuntimeIdCompressor: "on",
				summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
			},
		});
		const config = new TreeViewConfiguration({ schema: SchemaFactory.number });
		const container = await provider.createContainer(treeRuntimeFactory);
		const tree = (await container.getEntryPoint()) as ITree;
		const view = tree.viewWith(config);
		view.initialize(1);
		const remote = await provider.loadContainer(treeRuntimeFactory);
		const tree2 = (await remote.getEntryPoint()) as ITree;
		const view2 = tree2.viewWith(config);
		await provider.ensureSynchronized();
		assert.equal(view2.root, 1);
		view2.root = 2;
		await provider.ensureSynchronized();
		assert.equal(view.root, 2);
	});
});
