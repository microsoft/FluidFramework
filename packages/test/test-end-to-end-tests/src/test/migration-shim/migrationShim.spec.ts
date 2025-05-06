/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	type BuildNode,
	Change,
	type IShim,
	SharedTree as LegacySharedTree,
	type MigrationShim,
	MigrationShimFactory,
	type NodeId,
	SharedTreeShimFactory,
	StablePlace,
	type TraitLabel,
} from "@fluid-experimental/tree";
import { describeCompat } from "@fluid-private/test-version-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import { type IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import { type IFluidHandle } from "@fluidframework/core-interfaces";
import { type IChannel } from "@fluidframework/datastore-definitions/internal";
import {
	type ITestObjectProvider,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils/internal";
import { type ITree, SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/internal";

const treeKey = "treeKey";

// New tree schema
const builder = new SchemaFactory("test");
class RootType extends builder.object("abc", {
	quantity: builder.number,
}) {}

const treeConfig = new TreeViewConfiguration({ schema: RootType });

const migrate = (legacyTree: LegacySharedTree, newTree: ITree): void => {
	const quantity = getQuantity(legacyTree);
	const view = newTree.viewWith(treeConfig);
	view.initialize({ quantity });
	view.dispose();
};

// Useful for modifying the legacy tree
const someNodeId = "someNodeId" as TraitLabel;
function getQuantityNodeId(tree: LegacySharedTree): NodeId {
	const rootNode = tree.currentView.getViewNode(tree.currentView.root);
	const nodeId = rootNode.traits.get(someNodeId)?.[0];
	assert(nodeId !== undefined, "should have someNodeId trait");
	const someNode = tree.currentView.getViewNode(nodeId);
	const quantityNodeId = someNode.traits.get("quantity" as TraitLabel)?.[0];
	assert(quantityNodeId !== undefined, "should have quantityNodeId trait");
	return quantityNodeId;
}

// Useful for just getting the values from the legacy tree
function getQuantity(tree: LegacySharedTree): number {
	const nodeId = getQuantityNodeId(tree);
	const quantityNode = tree.currentView.getViewNode(nodeId);
	const quantity = quantityNode.payload as number | undefined;
	assert(quantity !== undefined, "should have retrieved quantity");
	return quantity;
}

const testValue = 5;

describeCompat("MigrationShim", "NoCompat", (getTestObjectProvider, apis) => {
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

	class TestDataObject extends DataObject {
		// Allows us to get the SharedObject with whatever type we want
		public async getShim(): Promise<IShim> {
			const handle: IFluidHandle<IChannel> | undefined =
				this.root.get<IFluidHandle<IChannel>>(treeKey);
			assert(handle !== undefined, "No handle found");
			return (await handle.get()) as IShim;
		}

		public createTree(type: string): void {
			const channel = this.runtime.createChannel(treeKey, type);
			this.root.set(treeKey, channel.handle);
		}
	}

	// V2 of the registry (the migration registry) -----------------------------------------
	// V2 of the code: Registry setup to migrate the document
	const legacyTreeFactory = LegacySharedTree.getFactory();
	const newSharedTreeFactory = SharedTree.getFactory();
	const migrationShimFactory = new MigrationShimFactory(
		legacyTreeFactory,
		newSharedTreeFactory,
		migrate,
	);
	const sharedTreeShimFactory = new SharedTreeShimFactory(newSharedTreeFactory);

	const dataObjectFactory = new DataObjectFactory({
		type: "TestDataObject",
		ctor: TestDataObject,
		sharedObjects: [migrationShimFactory, sharedTreeShimFactory],
		optionalProviders: {},
	});

	// The 2nd runtime factory, V2 of the code
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory,
		registryEntries: [dataObjectFactory.registryEntry],
		runtimeOptions,
	});

	let provider: ITestObjectProvider;

	beforeEach("getTestObjectProvider", async () => {
		provider = getTestObjectProvider();
	});

	it("Can create and retrieve tree without migration", async () => {
		// Setup containers and get Migration Shims instead of LegacySharedTrees
		const container1 = await provider.createContainer(runtimeFactory);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		// This is a silent action to create the tree and store the its handle.
		testObj1.createTree(migrationShimFactory.type);
		await provider.ensureSynchronized();
		const shim1 = (await testObj1.getShim()) as MigrationShim;

		const container2 = await provider.loadContainer(runtimeFactory);
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		await provider.ensureSynchronized();
		// This is a silent check that we can get the tree after storing the handle
		const shim2 = (await testObj2.getShim()) as MigrationShim;

		// Get the tree from the shim
		const tree1 = shim1.currentTree as LegacySharedTree;
		const tree2 = shim2.currentTree as LegacySharedTree;

		// Test that we can modify/send ops with the LegacySharedTree
		const inventoryNode: BuildNode = {
			definition: someNodeId,
			traits: {
				quantity: {
					definition: "quantity",
					payload: testValue,
				},
			},
		};
		tree1.applyEdit(
			Change.insertTree(
				inventoryNode,
				StablePlace.atStartOf({
					parent: tree1.currentView.root,
					label: someNodeId,
				}),
			),
		);
		await provider.ensureSynchronized();
		assert(getQuantity(tree2) === getQuantity(tree1), "Failed to update legacy tree via op");

		// Summarize
		const { summarizer } = await createSummarizerFromFactory(
			provider,
			container1,
			dataObjectFactory,
		);
		await provider.ensureSynchronized();
		const { summaryVersion } = await summarizeNow(summarizer);

		// Load a new container
		const container3 = await provider.loadContainer(runtimeFactory, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});

		const testObj3 = (await container3.getEntryPoint()) as TestDataObject;
		await provider.ensureSynchronized();
		const shim3 = await testObj3.getShim();
		const tree3 = shim3.currentTree as LegacySharedTree;

		// Verify that the value loaded from the summary matches the one loaded from a different summary
		await provider.ensureSynchronized();
		assert(getQuantity(tree3) === getQuantity(tree1), `Failed to load from summary`);
		assert(getQuantity(tree3) === testValue, "Failed to update the tree at all");

		// Modify the quantity value and verify that it syncs
		const quantityNodeId = getQuantityNodeId(tree3);
		tree3.applyEdit(Change.setPayload(quantityNodeId, 4));
		await provider.ensureSynchronized();
		assert(getQuantity(tree1) === 4, `Failed to modify new shared tree`);
		assert(getQuantity(tree1) === getQuantity(tree3), `Failed to sync new shared trees`);
	});

	it("Can create and retrieve tree with migration", async () => {
		// Setup containers and get Migration Shims instead of LegacySharedTrees
		const container1 = await provider.createContainer(runtimeFactory);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		// This is a silent action to create the tree and store the its handle.
		testObj1.createTree(migrationShimFactory.type);
		await provider.ensureSynchronized();
		const shim1 = (await testObj1.getShim()) as MigrationShim;

		const container2 = await provider.loadContainer(runtimeFactory);
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		await provider.ensureSynchronized();
		// This is a silent check that we can get the tree after storing the handle
		const shim2 = await testObj2.getShim();

		// Get the tree from the shim
		const tree1 = shim1.currentTree as LegacySharedTree;
		const tree2 = shim2.currentTree as LegacySharedTree;

		// Test that we can modify/send ops with the LegacySharedTree
		const inventoryNode: BuildNode = {
			definition: someNodeId,
			traits: {
				quantity: {
					definition: "quantity",
					payload: testValue,
				},
			},
		};
		tree1.applyEdit(
			Change.insertTree(
				inventoryNode,
				StablePlace.atStartOf({
					parent: tree1.currentView.root,
					label: someNodeId,
				}),
			),
		);
		await provider.ensureSynchronized();
		assert(getQuantity(tree2) === getQuantity(tree1), "Failed to update legacy tree via op");

		shim1.submitMigrateOp();
		const promise = new Promise<void>((resolve) => shim1.on("migrated", () => resolve()));
		await provider.ensureSynchronized();
		await promise;

		const newTree1 = shim1.currentTree as ITree;
		const view1 = newTree1.viewWith(treeConfig);
		const rootNode1: RootType = view1.root;

		// Summarize
		const { summarizer } = await createSummarizerFromFactory(
			provider,
			container1,
			dataObjectFactory,
		);
		await provider.ensureSynchronized();
		const { summaryVersion } = await summarizeNow(summarizer);

		// Load a new container
		const container3 = await provider.loadContainer(runtimeFactory, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});

		const testObj3 = (await container3.getEntryPoint()) as TestDataObject;
		await provider.ensureSynchronized();
		const shim3 = await testObj3.getShim();
		const tree3 = shim3.currentTree as ITree;
		const view3 = tree3.viewWith(treeConfig);
		const rootNode3: RootType = view3.root;

		// Verify that the value loaded from the summary matches the one loaded from a different summary
		await provider.ensureSynchronized();
		assert(rootNode3.quantity === rootNode1.quantity, `Failed to load from summary`);
		assert(rootNode3.quantity === testValue, "Failed to update the tree at all");

		// Modify the root node and verify that it syncs
		rootNode3.quantity = 4;
		await provider.ensureSynchronized();
		assert(rootNode1.quantity === 4, `Failed to modify new shared tree`);
		assert(rootNode1.quantity === rootNode3.quantity, `Failed to sync new shared trees`);
	});
});
