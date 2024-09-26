/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	type BuildNode,
	Change,
	SharedTree as LegacySharedTree,
	StablePlace,
	type TraitLabel,
} from "@fluid-experimental/tree";
import { describeCompat } from "@fluid-private/test-version-utils";
import { DataObject } from "@fluidframework/aqueduct/internal";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import type { IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import type { ISharedDirectory } from "@fluidframework/map/internal";
import {
	createSummarizerFromFactory,
	summarizeNow,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";
import { SchemaFactory } from "@fluidframework/tree";
import { SharedTree, TreeViewConfiguration, type ITree } from "@fluidframework/tree/internal";

import { MigrationDataObject, MigrationDataObjectFactory } from "./migration.js";

// V1 of the code -----------------------------------------
const legacyNodeId: TraitLabel = "inventory" as TraitLabel;
class TestDataObject extends DataObject {
	private _tree?: LegacySharedTree;
	public get tree() {
		assert(this._tree !== undefined, "Tree should be set by now");
		return this._tree;
	}

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
	}

	public async hasInitialized(): Promise<void> {
		const handle = this.root.get<IFluidHandle<LegacySharedTree>>("tree");
		const tree = await handle?.get();
		assert(tree !== undefined, "Tree channel should be defined");
		this._tree = tree;
	}
}

// V2 of the code -----------------------------------------
const builder = new SchemaFactory("test");
// For now this is the schema of the view.root
class InventorySchema extends builder.object("abcInventory", {
	quantity: builder.number,
}) {}
const treeConfig = new TreeViewConfiguration({ schema: InventorySchema });

class TestDataObjectB extends MigrationDataObject {
	protected migrate(): void {
		assert(this.tree !== undefined, "Tree should be defined during migration");

		// Migration code that the customer writes
		const legacyTree = this.tree as LegacySharedTree;
		const rootNode = legacyTree.currentView.getViewNode(legacyTree.currentView.root);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const nodeId = rootNode.traits.get(legacyNodeId)![0];
		const legacyNode = legacyTree.currentView.getViewNode(nodeId);
		const quantity = legacyNode.payload.quantity as number;

		const newTree = SharedTree.getFactory().create(this.runtime, "tree");
		const view = newTree.viewWith(treeConfig);
		view.initialize({ quantity });
		view.dispose();
		this.runtime.removeChannel("tree");
		this.runtime.addChannel(newTree);
		this.root.set("tree", newTree.handle);
		this.tree = newTree;
	}
	public tree?: ITree | LegacySharedTree;

	public get _root() {
		return this.root;
	}
	public get _context() {
		return this.context;
	}

	public async initializeForMigration(): Promise<void> {
		// Note that we are using the getChannel API here to ensure that the channel is loaded
		// If we were to use handles, it would go through a request all the way to the runtime, which
		// essentially will not find the channel as it is not loaded yet.
		// There's a better explanation in pureDataObjectFactory.ts/createDataObject under the code
		// that decides when to run finishInitialization from the DataObject instance.
		this.tree = (await this.runtime.getChannel("tree")) as ITree | LegacySharedTree;
		this.internalRoot = (await this.runtime.getChannel(
			this.rootDirectoryId,
		)) as ISharedDirectory;
	}

	// The object starts with a LegacySharedTree
	protected async initializingFirstTime(props?: unknown): Promise<void> {
		const newTree = SharedTree.create(this.runtime, "tree");
		const view = newTree.viewWith(treeConfig);
		view.initialize({ quantity: 0 });
		view.dispose();
		this.root.set("tree", newTree.handle);
		this.tree = newTree;
	}

	protected async hasInitialized(): Promise<void> {
		const handle = this.root.get<IFluidHandle<ITree | LegacySharedTree>>("tree");
		const tree = await handle?.get();
		assert(tree !== undefined, "Tree channel should be defined");
		this.tree = tree;
	}
}

// Test Start ==========================================
describeCompat("migrationPrototype", "NoCompat", (getTestObjectProvider, apis) => {
	const { DataObjectFactory } = apis.dataRuntime;
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

	const dataObjectFactory2 = new MigrationDataObjectFactory<TestDataObjectB>(
		"TestDataObject",
		TestDataObjectB,
		[legacyTreeFactory, newTreeFactory],
		{},
	);

	// The 2nd runtime factory, V2 of the code
	const runtimeFactory2 = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory2,
		registryEntries: [dataObjectFactory2.registryEntry],
		runtimeOptions,
	});

	// Test setup -----------------------------------------
	let provider: ITestObjectProvider;
	const originalValue = 3;

	beforeEach("setup", async () => {
		provider = getTestObjectProvider();
		// Creates the document as v1 of the code
		const container = await provider.createContainer(runtimeFactory1);
		const testObj = (await container.getEntryPoint()) as TestDataObject;
		const legacyTree = testObj.tree;

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

	// Test ==========================================
	it("migrates", async () => {
		// Load the document as v2 of the code
		const container1 = await provider.loadContainer(runtimeFactory2);
		const testObj = (await container1.getEntryPoint()) as TestDataObjectB;
		// Send an op to ensure that the document is already in write mode and doesn't sent another join op.
		testObj._root.set("switch to write", "op");

		await provider.ensureSynchronized();
		const currentSequenceNumber = container1.deltaManager.lastSequenceNumber;
		// submit a migrate op, in the future this would be a little more complicated. For now this is a v1 version.
		testObj.runtime.submitMigrateMessage("v1");
		await provider.ensureSynchronized();
		const migrationSequenceNumber = container1.deltaManager.lastSequenceNumber;
		assert.equal(
			currentSequenceNumber + 1,
			migrationSequenceNumber,
			"Migration swap should not generate extra ops",
		);
		const newTree = testObj.tree as ITree;
		const view = newTree.viewWith(treeConfig);
		assert(view.root.quantity === originalValue, "Should have migrated");

		const container2 = await provider.loadContainer(runtimeFactory2);
		const testObj2 = (await container2.getEntryPoint()) as TestDataObjectB;
		const newTree2 = testObj2.tree as ITree;
		const view2 = newTree2.viewWith(treeConfig);
		assert(view2.root.quantity === originalValue, "Should be able to load from the op stream");

		// Should be able to summarize and load from the summary
		const { summarizer } = await createSummarizerFromFactory(
			provider,
			container1,
			dataObjectFactory2,
		);
		const { summaryVersion } = await summarizeNow(summarizer);

		const container3 = await provider.loadContainer(runtimeFactory2, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});
		const testObj3 = (await container3.getEntryPoint()) as TestDataObjectB;
		const newTree3 = testObj3.tree as ITree & IChannel;
		assert.deepEqual(
			newTree3.attributes,
			SharedTree.getFactory().attributes,
			"Tree should match, and should have loaded from the summary",
		);
		assert.equal(testObj3.runtime.version, "v1", "Should have the version set to v1");
	});
});
