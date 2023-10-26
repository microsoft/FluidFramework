/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	createSummarizerFromFactory,
	summarizeNow,
	type ITestObjectProvider,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { type IChannel } from "@fluidframework/datastore-definitions";
import {
	AllowedUpdateType,
	type ISharedTree,
	SchemaBuilder,
	SharedTreeFactory,
	type ISharedTreeView,
	type ProxyNode,
} from "@fluid-experimental/tree2";
import { type IFluidHandle } from "@fluidframework/core-interfaces";
import { type IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { LoaderHeader } from "@fluidframework/container-definitions";
import { SharedTreeShimFactory } from "../sharedTreeShimFactory.js";
import { type SharedTreeShim } from "../sharedTreeShim.js";

const treeKey = "treeKey";

class TestDataObject extends DataObject {
	// Allows us to get the SharedObject with whatever type we want
	public async getTree(): Promise<SharedTreeShim> {
		const handle: IFluidHandle<IChannel> | undefined =
			this.root.get<IFluidHandle<IChannel>>(treeKey);
		assert(handle !== undefined, "No handle found");
		return (await handle.get()) as SharedTreeShim;
	}

	public createTree(type: string): void {
		const channel = this.runtime.createChannel(treeKey, type);
		this.root.set(treeKey, channel.handle);
	}
}

// New tree schema
const builder = new SchemaBuilder({ scope: "test" });
const rootType = builder.object("abc", {
	quantity: builder.number,
});
const schema = builder.intoSchema(rootType);

function getNewTreeView(tree: ISharedTree): ISharedTreeView {
	return tree.schematizeView({
		initialTree: {
			quantity: 0,
		},
		allowedSchemaModifications: AllowedUpdateType.None,
		schema,
	});
}

const testValue = 5;

describeNoCompat("SharedTreeShim", (getTestObjectProvider) => {
	// Allow us to control summaries
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
	};

	// V2 of the registry (the migration registry) -----------------------------------------
	// V2 of the code: Registry setup to migrate the document
	const newSharedTreeFactory = new SharedTreeFactory();
	const sharedTreeShimFactory = new SharedTreeShimFactory(newSharedTreeFactory);

	const dataObjectFactory = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[sharedTreeShimFactory],
		{},
	);

	// The 2nd runtime factory, V2 of the code
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory,
		registryEntries: [dataObjectFactory.registryEntry],
		runtimeOptions,
	});

	let provider: ITestObjectProvider;

	beforeEach(async () => {
		provider = getTestObjectProvider();
	});

	it("Can create and retrieve tree", async () => {
		// Setup containers and get Migration Shims instead of LegacySharedTrees
		const container1 = await provider.createContainer(runtimeFactory);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		// This is a silent action to create the tree and store the its handle.
		testObj1.createTree(sharedTreeShimFactory.type);
		await provider.ensureSynchronized();
		// Test that the local handle retrieval works
		const shim1 = await testObj1.getTree();

		const container2 = await provider.loadContainer(runtimeFactory);
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		// This is a silent check that we can get the tree after storing the handle
		const shim2 = await testObj2.getTree();

		// Get the tree from the shim
		const tree1 = shim1.currentTree;
		const tree2 = shim2.currentTree;

		// Schematize our tree, this sends an op since we are a live container
		const view1 = getNewTreeView(tree1);
		const view2 = getNewTreeView(tree2);
		await provider.ensureSynchronized();

		// This does some typing and gives us the root node.
		const rootNode1: ProxyNode<typeof rootType> = view1.root2(schema);
		const rootNode2: ProxyNode<typeof rootType> = view2.root2(schema);

		// Test that we can modify/send ops with the new Shared Tree
		rootNode1.quantity = testValue;
		await provider.ensureSynchronized();
		assert(rootNode2.quantity === rootNode1.quantity, "Failed to update the new tree via op");

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

		// Get the root node loaded from the new summary
		const testObj3 = (await container3.getEntryPoint()) as TestDataObject;
		const shim3 = await testObj3.getTree();
		const tree3 = shim3.currentTree;
		const view3 = getNewTreeView(tree3);
		const rootNode3: ProxyNode<typeof rootType> = view3.root2(schema);

		// Verify that it matches the previous node
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
