/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	type BuildNode,
	Change,
	SharedTree as LegacySharedTree,
	type MigrationShim,
	MigrationShimFactory,
	type SharedTreeShim,
	SharedTreeShimFactory,
	StablePlace,
	type TraitLabel,
} from "@fluid-experimental/tree";
import { describeCompat } from "@fluid-private/test-version-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import { type IContainerExperimental } from "@fluidframework/container-loader/internal";
import { type IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import { type ConfigTypes, type IConfigProviderBase } from "@fluidframework/core-interfaces";
import { type IChannel } from "@fluidframework/datastore-definitions/internal";
import {
	type ITestObjectProvider,
	toIDeltaManagerFull,
	createSummarizerFromFactory,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";
import { ITree, SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/internal";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

const legacyNodeId: TraitLabel = "inventory" as TraitLabel;

function updateQuantity(tree: LegacySharedTree, quantity: number): void {
	const rootNode = tree.currentView.getViewNode(tree.currentView.root);
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const nodeId = rootNode.traits.get(legacyNodeId)![0];
	const change: Change = Change.setPayload(nodeId, { quantity });
	tree.applyEdit(change);
}

function getQuantity(tree: LegacySharedTree): number {
	const rootNode = tree.currentView.getViewNode(tree.currentView.root);
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const nodeId = rootNode.traits.get(legacyNodeId)![0];
	const legacyNode = tree.currentView.getViewNode(nodeId);
	return legacyNode.payload.quantity as number;
}

const builder = new SchemaFactory("test");
// For now this is the schema of the view.root
class QuantityType extends builder.object("quantityObj", {
	quantity: builder.number,
}) {}
const treeConfig = new TreeViewConfiguration({ schema: QuantityType });

describeCompat("Stamped v2 ops", "NoCompat", (getTestObjectProvider, apis) => {
	const { DataObject, DataObjectFactory } = apis.dataRuntime;
	const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;

	// Allow us to control summaries
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
		enableRuntimeIdCompressor: "on",
	};

	// A Test Data Object that exposes some basic functionality.
	class TestDataObject extends DataObject {
		private channel?: IChannel;

		public get _root() {
			return this.root;
		}

		// The object starts with a LegacySharedTree
		public async initializingFirstTime(props?: unknown): Promise<void> {
			const legacyTree = this.runtime.createChannel(
				"tree",
				LegacySharedTree.getFactory().type,
			) as LegacySharedTree;

			const inventoryNode: BuildNode = {
				definition: legacyNodeId,
				traits: {
					quantity: {
						definition: "quantity",
						payload: 0,
					},
				},
			};
			legacyTree.applyEdit(
				Change.insertTree(
					inventoryNode,
					StablePlace.atStartOf({
						parent: legacyTree.currentView.root,
						label: "inventory" as TraitLabel,
					}),
				),
			);

			this.root.set("tree", legacyTree.handle);
			this.channel = legacyTree;
		}

		// Makes it so we can get the tree stored as "tree"
		public async hasInitialized(): Promise<void> {
			// We are using runtime.getChannel here instead of fetching the handle
			// TODO: handle tests
			const tree = await this.runtime.getChannel("tree");
			this.channel = tree;
		}

		// Allows us to get the SharedObject with whatever type we want
		public getTree<T>(): T {
			assert(this.channel !== undefined, "Channel should be defined");
			return this.channel as T;
		}
	}

	// V1 of the registry -----------------------------------------
	// V1 of the code: Registry setup to create the old document
	const oldChannelFactory = LegacySharedTree.getFactory();
	const dataObjectFactory1 = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[oldChannelFactory],
		{},
	);

	// The 1st runtime factory, V1 of the code
	const runtimeFactory1 = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory1,
		registryEntries: [dataObjectFactory1.registryEntry],
		runtimeOptions,
	});

	// V2 of the registry (the migration registry) -----------------------------------------
	// V2 of the code: Registry setup to migrate the document
	const legacySharedTreeFactory = LegacySharedTree.getFactory();
	const newSharedTreeFactory = SharedTree.getFactory();

	const migrationShimFactory = new MigrationShimFactory(
		legacySharedTreeFactory,
		newSharedTreeFactory,
		(legacyTree, newTree) => {
			// Migration code that the customer writes
			// Revert local edits - otherwise we will be eventually inconsistent
			const edits = legacyTree.edits;
			const localEdits = [...edits.getLocalEdits()].reverse();
			for (const edit of localEdits) {
				legacyTree.revert(edit.id);
			}
			// migrate data
			const quantity = getQuantity(legacyTree);
			const view = newTree.viewWith(treeConfig);
			view.initialize({ quantity });
			view.dispose();
		},
	);

	const sharedTreeShimFactory = new SharedTreeShimFactory(newSharedTreeFactory);

	const dataObjectFactory2 = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[migrationShimFactory, sharedTreeShimFactory], // Use the migrationShimFactory instead of the LegacySharedTreeFactory
		{},
	);

	// The 2nd runtime factory, V2 of the code
	const runtimeFactory2 = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory2,
		registryEntries: [dataObjectFactory2.registryEntry],
		runtimeOptions,
	});

	let provider: ITestObjectProvider;

	const loaderProps = {
		configProvider: configProvider({
			"Fluid.Container.enableOfflineLoad": true,
		}),
	};

	beforeEach("setup", async () => {
		provider = getTestObjectProvider();
		// Creates the document as v1 of the code with a SharedCell
		const container = await provider.createContainer(runtimeFactory1);
		const testObj = (await container.getEntryPoint()) as TestDataObject;
		const legacyTree = testObj.getTree<LegacySharedTree>();

		updateQuantity(legacyTree, 0);
		// make sure changes are saved.
		await provider.ensureSynchronized();
		container.close();
	});

	it("Shims can reconnect and resubmit", async () => {
		// Setup containers and get Migration Shims instead of LegacySharedTrees
		const container1 = await provider.loadContainer(runtimeFactory2);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const shim1 = testObj1.getTree<MigrationShim>();
		const legacyTree1 = shim1.currentTree as LegacySharedTree;
		updateQuantity(legacyTree1, 123);

		const container2 = await provider.loadContainer(runtimeFactory2);
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		const shim2 = testObj2.getTree<MigrationShim>();
		await provider.ensureSynchronized();

		container1.disconnect();
		updateQuantity(legacyTree1, 1);
		updateQuantity(legacyTree1, 2);
		updateQuantity(legacyTree1, 3);
		updateQuantity(legacyTree1, 4);

		const promise2 = new Promise<void>((resolve) => shim2.on("migrated", () => resolve()));
		shim2.submitMigrateOp();
		await promise2;

		container1.connect();
		await provider.ensureSynchronized();
		assert(getQuantity(legacyTree1) === 123, "expected quantity updates to have been dropped");

		const newTree1 = shim1.currentTree as ITree;
		const view1 = newTree1.viewWith(treeConfig);
		const node1 = view1.root;

		const newTree2 = shim2.currentTree as ITree;
		const view2 = newTree2.viewWith(treeConfig);
		const node2 = view2.root;

		container1.disconnect();
		node1.quantity = 20;
		container1.connect();

		// Send a v2 op and check to see that they are processed.
		await provider.ensureSynchronized();
		assert.equal(node2.quantity, 20, "expected quantity values to be updated");
		assert(!container1.closed, "Container1 should not be closed");

		const { summarizer } = await createSummarizerFromFactory(
			provider,
			container1,
			dataObjectFactory2,
		);
		await provider.ensureSynchronized();
		const { summaryVersion } = await summarizeNow(summarizer);
		const container3 = await provider.loadContainer(runtimeFactory2, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});
		const testObj3 = (await container3.getEntryPoint()) as TestDataObject;
		const shim3 = testObj3.getTree<SharedTreeShim>();
		const newTree3 = shim3.currentTree;
		const view3 = newTree3.viewWith(treeConfig);
		const node3 = view3.root;
		node3.quantity = 431;
		await provider.ensureSynchronized();

		container2.disconnect();
		node3.quantity = 432;
		container2.connect();

		await provider.ensureSynchronized();
		assert.equal(node1.quantity, 432, "expected quantity values to be updated");
	});

	it("MigrationShim can apply stashed v1 ops to v1 state", async () => {
		// Setup containers and get Migration Shims instead of LegacySharedTrees
		const container1: IContainerExperimental = await provider.loadContainer(
			runtimeFactory2,
			loaderProps,
		);
		const url = await container1.getAbsoluteUrl("");
		assert(url !== undefined, "Container url should be defined");
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const shim1 = testObj1.getTree<MigrationShim>();
		const legacyTree1 = shim1.currentTree as LegacySharedTree;
		updateQuantity(legacyTree1, 123);
		await provider.ensureSynchronized();

		// generate stashed ops
		await provider.opProcessingController.pauseProcessing(container1);
		updateQuantity(legacyTree1, 1);
		updateQuantity(legacyTree1, 2);
		updateQuantity(legacyTree1, 3);
		updateQuantity(legacyTree1, 4);
		updateQuantity(legacyTree1, 5);
		const pendingState = await container1.closeAndGetPendingLocalState?.();
		assert(pendingState !== undefined, "Pending state should be defined");

		const loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory2]]);
		const container2 = await loader.resolve({ url }, pendingState);
		await provider.ensureSynchronized();
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		const shim2 = testObj2.getTree<MigrationShim>();
		const legacyTree2 = shim2.currentTree as LegacySharedTree;
		assert(getQuantity(legacyTree2) === 5, "expected quantity updates to have been applied");
		assert(container2.closed !== true, "Container should not be closed");
	});

	it("MigrationShim can apply stashed v2 ops to v2 state", async () => {
		// Setup containers and get Migration Shims instead of LegacySharedTrees
		const container1: IContainerExperimental = await provider.loadContainer(
			runtimeFactory2,
			loaderProps,
		);
		const url = await container1.getAbsoluteUrl("");
		assert(url !== undefined, "Container url should be defined");
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const shim1 = testObj1.getTree<MigrationShim>();
		const legacyTree1 = shim1.currentTree as LegacySharedTree;
		updateQuantity(legacyTree1, 123);
		shim1.submitMigrateOp();
		await provider.ensureSynchronized();
		const newTree1 = shim1.currentTree as ITree;
		const node1 = newTree1.viewWith(treeConfig).root;

		// generate stashed ops
		await provider.opProcessingController.pauseProcessing(container1);
		await toIDeltaManagerFull(container1.deltaManager).outbound.pause();
		node1.quantity = 1;
		node1.quantity = 2;
		node1.quantity = 3;
		node1.quantity = 4;
		node1.quantity = 5;
		const pendingState = await container1.closeAndGetPendingLocalState?.();
		assert(pendingState !== undefined, "Pending state should be defined");

		const loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory2]]);
		const container2 = await loader.resolve({ url }, pendingState);
		await provider.ensureSynchronized();
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		const shim2 = testObj2.getTree<MigrationShim>();
		const newTree2 = shim2.currentTree as ITree;
		const node2 = newTree2.viewWith(treeConfig).root;
		assert(node2.quantity === 5, "expected quantity updates to have been applied");
	});

	it("SharedTreeShim can apply stashed v2 ops to v2 state", async () => {
		// Setup containers and get Migration Shims instead of LegacySharedTrees
		const container1 = await provider.loadContainer(runtimeFactory2);
		const url = await container1.getAbsoluteUrl("");
		assert(url !== undefined, "Container url should be defined");

		await waitForContainerConnection(container1);

		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const shim1 = testObj1.getTree<MigrationShim>();
		const legacyTree1 = shim1.currentTree as LegacySharedTree;
		updateQuantity(legacyTree1, 123);
		shim1.submitMigrateOp();
		await provider.ensureSynchronized();
		const newTree1 = shim1.currentTree as ITree;
		const view1 = newTree1.viewWith(treeConfig);
		const node1 = view1.root;

		// summarize migration
		const { summarizer } = await createSummarizerFromFactory(
			provider,
			container1,
			dataObjectFactory2,
		);
		await provider.ensureSynchronized();
		const { summaryVersion } = await summarizeNow(summarizer);
		const container2: IContainerExperimental = await provider.loadContainer(
			runtimeFactory2,
			loaderProps,
			{
				[LoaderHeader.version]: summaryVersion,
			},
		);
		await waitForContainerConnection(container2);

		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		const shim2 = testObj2.getTree<SharedTreeShim>();
		const newTree2 = shim2.currentTree;
		const view2 = newTree2.viewWith(treeConfig);
		const node2 = view2.root;

		// generate stashed ops
		await provider.opProcessingController.pauseProcessing(container2);
		await toIDeltaManagerFull(container2.deltaManager).outbound.pause();
		node2.quantity = 1;
		node2.quantity = 2;
		node2.quantity = 3;
		node2.quantity = 4;
		node2.quantity = 5;
		const pendingState = await container2.closeAndGetPendingLocalState?.();
		assert(pendingState !== undefined, "Pending state should be defined");

		const loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory2]]);
		const container3 = await loader.resolve({ url }, pendingState);
		await provider.ensureSynchronized();
		const testObj3 = (await container3.getEntryPoint()) as TestDataObject;
		const shim3 = testObj3.getTree<SharedTreeShim>();
		const newTree3 = shim3.currentTree;
		const node3 = newTree3.viewWith(treeConfig).root;
		assert(node3.quantity === 5, "expected quantity updates to have been applied");
		assert(node1.quantity === 5, "expected quantity updates to have been synced");
	});

	it("Shims drop stashed v1 ops to v2 state", async () => {
		// Setup containers and get Migration Shims instead of LegacySharedTrees
		const container1: IContainerExperimental = await provider.loadContainer(
			runtimeFactory2,
			loaderProps,
		);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const shim1 = testObj1.getTree<MigrationShim>();
		const legacyTree1 = shim1.currentTree as LegacySharedTree;
		updateQuantity(legacyTree1, 123);
		await provider.ensureSynchronized();

		const container2 = await provider.loadContainer(runtimeFactory2);
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		const shim2 = testObj2.getTree<MigrationShim>();
		const promise2 = new Promise<void>((resolve) => shim2.on("migrated", () => resolve()));

		// generate stashed ops with a migration occurring
		await provider.opProcessingController.pauseProcessing(container1);
		await toIDeltaManagerFull(container1.deltaManager).outbound.pause();

		shim1.submitMigrateOp();
		updateQuantity(legacyTree1, 1);
		updateQuantity(legacyTree1, 2);
		updateQuantity(legacyTree1, 3);
		updateQuantity(legacyTree1, 4);
		updateQuantity(legacyTree1, 5);
		const pendingState = await container1.closeAndGetPendingLocalState?.();
		assert(pendingState !== undefined, "Pending state should be defined");
		shim2.submitMigrateOp();
		await promise2;

		// Summarize and load a new container
		const { summarizer } = await createSummarizerFromFactory(
			provider,
			container1,
			dataObjectFactory2,
		);
		await provider.ensureSynchronized();
		const { summaryVersion } = await summarizeNow(summarizer);
		const container4 = await provider.loadContainer(runtimeFactory2, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});
		const testObj4 = (await container4.getEntryPoint()) as TestDataObject;
		const shim4 = testObj4.getTree<SharedTreeShim>();
		const newTree4 = shim4.currentTree;
		const view4 = newTree4.viewWith(treeConfig);
		const node4 = view4.root;

		// Load a new container and apply stashed ops
		const loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory2]]);
		const url = await container1.getAbsoluteUrl("");
		assert(url !== undefined, "Container url should be defined");
		const container3 = await loader.resolve({ url }, pendingState);
		await provider.ensureSynchronized();
		const testObj3 = (await container3.getEntryPoint()) as TestDataObject;
		const shim3 = testObj3.getTree<MigrationShim>();
		const tree3 = shim3.currentTree as ITree;
		const view3 = tree3.viewWith(treeConfig);
		const node3 = view3.root;
		assert(node3.quantity === 123, "expected quantity updates to have been dropped");
		assert(
			node4.quantity === 123,
			"expected quantity updates to have been dropped after summary on new shim",
		);
		assert(container3.closed !== true, "Container should not be closed");
	});

	it("MigrationShim apply stashed v1 migrate ops in v1 state", async () => {
		// Setup containers and get Migration Shims instead of LegacySharedTrees
		const container1: IContainerExperimental = await provider.loadContainer(
			runtimeFactory2,
			loaderProps,
		);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const shim1 = testObj1.getTree<MigrationShim>();
		const legacyTree1 = shim1.currentTree as LegacySharedTree;
		updateQuantity(legacyTree1, 123);
		await provider.ensureSynchronized();

		const container2 = await provider.loadContainer(runtimeFactory2);
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		const shim2 = testObj2.getTree<MigrationShim>();
		const legacyTree2 = shim2.currentTree as LegacySharedTree;

		// generate stashed ops with a migration occurring
		await provider.opProcessingController.pauseProcessing(container1);
		await toIDeltaManagerFull(container1.deltaManager).outbound.pause();

		shim1.submitMigrateOp();
		const pendingState = await container1.closeAndGetPendingLocalState?.();
		assert(pendingState !== undefined, "Pending state should be defined");
		updateQuantity(legacyTree2, 1);
		updateQuantity(legacyTree2, 2);
		updateQuantity(legacyTree2, 3);
		updateQuantity(legacyTree2, 4);
		updateQuantity(legacyTree2, 5);
		await provider.ensureSynchronized();

		// Load a new container and apply stashed ops
		const loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory2]]);
		const url = await container1.getAbsoluteUrl("");
		assert(url !== undefined, "Container url should be defined");
		const container3 = await loader.resolve({ url }, pendingState);
		await provider.ensureSynchronized();
		const testObj3 = (await container3.getEntryPoint()) as TestDataObject;
		const shim3 = testObj3.getTree<MigrationShim>();
		assert(
			shim3.currentTree.attributes.type === newSharedTreeFactory.type,
			"Should not have migrated to new tree",
		);
		const tree3 = shim3.currentTree as ITree;
		const node3 = tree3.viewWith(treeConfig).root;
		assert(node3.quantity === 5, "expected migration to have been applied");
	});
});
