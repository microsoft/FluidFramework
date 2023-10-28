/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type ITestObjectProvider,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import {
	type BuildNode,
	Change,
	SharedTree as LegacySharedTree,
	StablePlace,
	type TraitLabel,
} from "@fluid-experimental/tree";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { type IChannel } from "@fluidframework/datastore-definitions";
import { type IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import {
	AllowedUpdateType,
	type ISharedTree,
	SchemaBuilder,
	SharedTreeFactory,
	type Typed,
	type ISharedTreeView,
} from "@fluid-experimental/tree2";
import { LoaderHeader } from "@fluidframework/container-definitions";
import { MigrationShimFactory } from "../migrationShimFactory.js";
import { type MigrationShim } from "../migrationShim.js";
import { SharedTreeShimFactory } from "../sharedTreeShimFactory.js";
import { type SharedTreeShim } from "../sharedTreeShim.js";

const legacyNodeId: TraitLabel = "inventory" as TraitLabel;

// A Test Data Object that exposes some basic functionality.
class TestDataObject extends DataObject {
	private channel?: IChannel;
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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

const builder = new SchemaBuilder({ scope: "test" });
// For now this is the schema of the view.root
const inventorySchema = builder.object("abcInventory", {
	quantity: builder.number,
});

// This is some schema to be updated later
const inventoryFieldSchema = SchemaBuilder.required(inventorySchema);
const schema = builder.intoSchema(inventoryFieldSchema);

function getNewTreeView(tree: ISharedTree): ISharedTreeView {
	return tree.schematizeView({
		initialTree: {
			quantity: 0,
		},
		allowedSchemaModifications: AllowedUpdateType.None,
		schema,
	});
}

describeNoCompat("HotSwap", (getTestObjectProvider) => {
	// Allow us to control summaries
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
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
	});

	// V2 of the registry (the migration registry) -----------------------------------------
	// V2 of the code: Registry setup to migrate the document
	const legacySharedTreeFactory = LegacySharedTree.getFactory();
	const newSharedTreeFactory = new SharedTreeFactory();

	const migrationShimFactory = new MigrationShimFactory(
		legacySharedTreeFactory,
		newSharedTreeFactory,
		(legacyTree, newTree) => {
			// Migration code that the customer writes
			const rootNode = legacyTree.currentView.getViewNode(legacyTree.currentView.root);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const nodeId = rootNode.traits.get(legacyNodeId)![0];
			const legacyNode = legacyTree.currentView.getViewNode(nodeId);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			const quantity = legacyNode.payload.quantity as number;
			newTree.schematizeView({
				initialTree: {
					quantity,
				},
				allowedSchemaModifications: AllowedUpdateType.None,
				schema,
			});
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

	const originalValue = 3;

	beforeEach(async () => {
		provider = getTestObjectProvider();
		// Creates the document as v1 of the code with a SharedCell
		const container = await provider.createContainer(runtimeFactory1);
		const testObj = await requestFluidObject<TestDataObject>(container, "/");
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
		const testObj1 = await requestFluidObject<TestDataObject>(container1, "/");
		const shim1 = testObj1.getTree<MigrationShim>();
		// Transition the container to write mode so we send the client join op first.
		testObj1._root.set("a", "value");

		const container2 = await provider.loadContainer(runtimeFactory2);
		const testObj2 = await requestFluidObject<TestDataObject>(container2, "/");
		const shim2 = testObj2.getTree<MigrationShim>();
		assert(
			shim1.currentTree.attributes.type === legacySharedTreeFactory.type,
			"shim1.currentTree is not legacy tree",
		);
		assert(
			shim2.currentTree.attributes.type === legacySharedTreeFactory.type,
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
		assert(
			shim1.currentTree.attributes.type === newSharedTreeFactory.type,
			"should have migrated",
		);
		assert(
			shim2.currentTree.attributes.type === newSharedTreeFactory.type,
			"should have migrated",
		);

		// Get the migrated values from the new tree
		const tree1 = shim1.currentTree as ISharedTree;
		const tree2 = shim2.currentTree as ISharedTree;

		const view1 = getNewTreeView(tree1);
		const view2 = getNewTreeView(tree2);
		const treeNode1 = view1.root as unknown as Typed<typeof inventorySchema>;
		const treeNode2 = view2.root as unknown as Typed<typeof inventorySchema>;

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
		const testObj1 = await requestFluidObject<TestDataObject>(container1, "/");
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
		const testObj2 = await requestFluidObject<TestDataObject>(container2, "/");
		const shim2 = testObj2.getTree<SharedTreeShim>();

		// Validate that we loaded a shared tree immediately
		assert(
			shim2.currentTree.attributes.type === newSharedTreeFactory.type,
			"should have loaded migrated shim",
		);

		// Get the migrated values from the new tree
		const tree1 = shim1.currentTree as ISharedTree;
		const view1 = getNewTreeView(tree1);
		const treeNode1 = view1.root as unknown as Typed<typeof inventorySchema>;

		const tree2 = shim2.currentTree;
		const view2 = getNewTreeView(tree2);
		const treeNode2 = view2.root as unknown as Typed<typeof inventorySchema>;
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
