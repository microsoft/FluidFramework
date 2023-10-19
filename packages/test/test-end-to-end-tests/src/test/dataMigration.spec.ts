/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { MigrationShim, MigrationShimFactory } from "@fluid-experimental/migration-shim";
import {
	BuildNode,
	Change,
	SharedTree as LegacySharedTree,
	StablePlace,
	TraitLabel,
} from "@fluid-experimental/tree";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IChannel } from "@fluidframework/datastore-definitions";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import {
	AllowedUpdateType,
	ISharedTree,
	SchemaBuilder,
	SharedTreeFactory,
	Typed,
} from "@fluid-experimental/tree2";

const legacyNodeId: TraitLabel = "inventory" as TraitLabel;

// A Test Data Object that exposes some basic functionality.
class TestDataObject extends DataObject {
	private channel?: IChannel;

	// The object starts with a LegacySharedTree
	public async initializingFirstTime(props?: any): Promise<void> {
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
	public getTree<T>() {
		assert(this.channel !== undefined, "Channel should be defined");
		return this.channel as T;
	}
}

const builder = new SchemaBuilder({ scope: "test" });
// For now this is the schema of the view.root
const inventorySchema = builder.struct("abcInventory", {
	quantity: builder.number,
});

// This is some schema to be updated later
const inventoryFieldSchema = SchemaBuilder.required(inventorySchema);
const schema = builder.intoSchema(inventoryFieldSchema);

function getNewTreeView(tree: ISharedTree) {
	return tree.schematize({
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
			const quantity = legacyNode.payload.quantity as number;
			newTree.schematize({
				initialTree: {
					quantity,
				},
				allowedSchemaModifications: AllowedUpdateType.None,
				schema,
			});
		},
	);

	const dataObjectFactory2 = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[migrationShimFactory], // Use the migrationShimFactory instead of the LegacySharedTreeFactory
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

		// Hot swap
		shim1.submitMigrateOp();

		// TODO: shim1.on("migrated", () => { ... });
		// TODO: shim2.on("migrated", () => { ... });
		await provider.ensureSynchronized();

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

		// TODO: test that we can modify/send ops with the new Shared Tree
	});
});
