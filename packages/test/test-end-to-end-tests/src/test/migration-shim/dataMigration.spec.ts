/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	type BuildNode,
	Change,
	type MigrationShim,
	MigrationShimFactory,
	SharedTree as LegacySharedTree,
	type SharedTreeShim,
	SharedTreeShimFactory,
	StablePlace,
	type TraitLabel,
} from "@fluid-experimental/tree";
import {
	type ITree,
	SharedTree,
	disposeSymbol,
	type TreeView,
	TreeConfiguration,
	SchemaFactory,
} from "@fluidframework/tree";
import { describeCompat } from "@fluid-private/test-version-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { LoaderHeader } from "@fluidframework/container-definitions";
import { type IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { type IFluidHandle } from "@fluidframework/core-interfaces";
import { type IChannel } from "@fluidframework/datastore-definitions";
import {
	type ITestObjectProvider,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils";

const legacyNodeId: TraitLabel = "inventory" as TraitLabel;

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
		const handle: IFluidHandle<IChannel> | undefined =
			this.root.get<IFluidHandle<IChannel>>("tree");
		const tree = await handle?.get();
		assert(tree !== undefined, "Tree channel should be defined");
		this.channel = tree;
	}

	// Allows us to get the SharedObject with whatever type we want
	public getTree<T>(): T {
		assert(this.channel !== undefined, "Channel should be defined");
		return this.channel as T;
	}
}

const builder = new SchemaFactory("test");
// For now this is the schema of the view.root
class InventorySchema extends builder.object("abcInventory", {
	quantity: builder.number,
}) {}

function getNewTreeView(tree: ITree): TreeView<InventorySchema> {
	return tree.schematize(
		new TreeConfiguration(InventorySchema, () => ({
			quantity: 0,
		})),
	);
}

describeCompat("HotSwap", "NoCompat", (getTestObjectProvider) => {
	// Allow us to control summaries
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
		enableRuntimeIdCompressor: true,
	};

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
	const legacyTreeFactory = LegacySharedTree.getFactory();
	const newTreeFactory = SharedTree.getFactory();

	const migrationShimFactory = new MigrationShimFactory(
		legacyTreeFactory,
		newTreeFactory,
		(legacyTree, newTree) => {
			// Migration code that the customer writes
			const rootNode = legacyTree.currentView.getViewNode(legacyTree.currentView.root);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const nodeId = rootNode.traits.get(legacyNodeId)![0];
			const legacyNode = legacyTree.currentView.getViewNode(nodeId);
			const quantity = legacyNode.payload.quantity as number;
			newTree
				.schematize(
					new TreeConfiguration(InventorySchema, () => ({
						quantity,
					})),
				)
				[disposeSymbol]();
		},
	);

	const sharedTreeShimFactory = new SharedTreeShimFactory(newTreeFactory);

	const dataObjectFactory2 = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[migrationShimFactory, sharedTreeShimFactory], // Use the migrationShimFactory instead of the LegacyTreeFactory
		{},
	);

	// The 2nd runtime factory, V2 of the code
	const runtimeFactory2 = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory2,
		registryEntries: [dataObjectFactory2.registryEntry],
		runtimeOptions,
	});

	let provider: ITestObjectProvider;

	const originalValue = 3;

	beforeEach(async () => {
		provider = getTestObjectProvider();
		// Creates the document as v1 of the code with a SharedCell
		const container = await provider.createContainer(runtimeFactory1);
		const testObj = (await container.getEntryPoint()) as TestDataObject;
		const legacyTree = testObj.getTree<LegacySharedTree>();

		// Initialize the legacy tree with some data
		const rootNode = legacyTree.currentView.getViewNode(legacyTree.currentView.root);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const nodeId = rootNode.traits.get(legacyNodeId)![0];
		const change: Change = Change.setPayload(nodeId, { quantity: originalValue });
		legacyTree.applyEdit(change);
		// make sure changes are saved.
		await provider.ensureSynchronized();
		container.close();
	});

	it("Can Hot Swap", async () => {
		// Setup containers and get Migration Shims instead of LegacySharedTrees
		const container1 = await provider.loadContainer(runtimeFactory2);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const shim1 = testObj1.getTree<MigrationShim>();
		// Transition the container to write mode so we send the client join op first.
		testObj1._root.set("a", "value");

		const container2 = await provider.loadContainer(runtimeFactory2);
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		const shim2 = testObj2.getTree<MigrationShim>();
		assert(
			shim1.currentTree.attributes.type === legacyTreeFactory.type,
			"shim1.currentTree is not legacy tree",
		);
		assert(
			shim2.currentTree.attributes.type === legacyTreeFactory.type,
			"shim2.currentTree is not legacy tree",
		);

		await provider.ensureSynchronized();

		// Get premigration sequence number
		const preMigrationSeqNumber1 = container1.deltaManager.lastKnownSeqNumber;
		const preMigrationSeqNumber2 = container2.deltaManager.lastKnownSeqNumber;

		// Hot swap
		shim1.submitMigrateOp();

		// TODO: shim1.on("migrated", () => { ... });
		// TODO: shim2.on("migrated", () => { ... });
		await provider.ensureSynchronized();

		// Verify that no ops were generated during migration.
		const postMigrationSeqNumber1 = container1.deltaManager.lastKnownSeqNumber;
		const postMigrationSeqNumber2 = container2.deltaManager.lastKnownSeqNumber;

		assert(
			preMigrationSeqNumber1 + 1 === postMigrationSeqNumber1,
			"container1 should have migrated with only one op",
		);
		assert(
			preMigrationSeqNumber2 + 1 === postMigrationSeqNumber2,
			"container2 should have migrated with only one op",
		);

		// Verify that the trees have been swapped by checking the attributes type
		assert(shim1.currentTree.attributes.type === newTreeFactory.type, "should have migrated");
		assert(shim2.currentTree.attributes.type === newTreeFactory.type, "should have migrated");

		// Get the migrated values from the new tree
		const tree1 = shim1.currentTree as ITree;
		const tree2 = shim2.currentTree as ITree;

		const view1 = getNewTreeView(tree1);
		const view2 = getNewTreeView(tree2);
		const treeNode1 = view1.root;
		const treeNode2 = view2.root;

		// Validate migrated values of the old tree match the new tree
		const migratedValue1 = treeNode1.quantity;
		const migratedValue2 = treeNode2.quantity;
		assert(
			migratedValue2 === originalValue && migratedValue2 === migratedValue1,
			`Failed to migrate values original ${originalValue} migrated 1: ${migratedValue1}, 2: ${migratedValue2}`,
		);

		// Test that we can modify/send ops with the new Shared Tree
		treeNode1.quantity = 5;
		await provider.ensureSynchronized();
		assert(treeNode2.quantity === treeNode1.quantity, "Failed to update the new tree via op");
	});

	it("Can Hot Swap, summarize, and load from that summary", async () => {
		// Setup containers and get Migration Shims instead of LegacySharedTrees
		const container1 = await provider.loadContainer(runtimeFactory2);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const shim1 = testObj1.getTree<MigrationShim>();

		// Hot swap
		shim1.submitMigrateOp();

		const migrationCompletion = new Promise<void>((resolve) => {
			shim1.on("migrated", () => resolve());
		});
		await migrationCompletion;
		await provider.ensureSynchronized();

		// Summarize
		const { summarizer } = await createSummarizerFromFactory(
			provider,
			container1,
			dataObjectFactory2,
		);
		await provider.ensureSynchronized();
		const { summaryVersion } = await summarizeNow(summarizer);

		// Load a new container
		const container2 = await provider.loadContainer(runtimeFactory2, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		const shim2 = testObj2.getTree<SharedTreeShim>();

		// Validate that we loaded a shared tree immediately
		assert(
			shim2.currentTree.attributes.type === newTreeFactory.type,
			"should have loaded migrated shim",
		);

		// Get the migrated values from the new tree
		const tree1 = shim1.currentTree as ITree;
		const view1 = getNewTreeView(tree1);
		const treeNode1 = view1.root;

		const tree2 = shim2.currentTree;
		const view2 = getNewTreeView(tree2);
		const treeNode2 = view2.root;
		const migratedValue2 = treeNode2.quantity;
		assert(
			migratedValue2 === originalValue,
			`Failed to load from migrated snapshot values original ${originalValue} migrated snapshot value: ${migratedValue2}`,
		);

		// Test that we can modify/send ops with the new Shared Tree
		treeNode2.quantity = 5;
		await provider.ensureSynchronized();
		assert(
			treeNode2.quantity === treeNode1.quantity,
			"Failed to write from MigrationShim to SharedTreeShim",
		);

		// Test that we can modify/send ops with the new Shared Tree
		treeNode1.quantity = 6;
		await provider.ensureSynchronized();
		assert(
			treeNode2.quantity === treeNode1.quantity,
			"Failed to write from SharedTreeShim to MigrationShim",
		);
	});
});
