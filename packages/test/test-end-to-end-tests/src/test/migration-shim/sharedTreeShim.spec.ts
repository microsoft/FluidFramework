/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { type SharedTreeShim, SharedTreeShimFactory } from "@fluid-experimental/tree";
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
import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/internal";

const treeKey = "treeKey";

// New tree schema
const builder = new SchemaFactory("test");
class RootType extends builder.object("abc", {
	quantity: builder.number,
}) {}

const treeConfig = new TreeViewConfiguration({ schema: RootType });

const testValue = 5;

describeCompat("SharedTreeShim", "NoCompat", (getTestObjectProvider, apis) => {
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

	// V2 of the registry (the migration registry) -----------------------------------------
	// V2 of the code: Registry setup to migrate the document
	const newSharedTreeFactory = SharedTree.getFactory();
	const sharedTreeShimFactory = new SharedTreeShimFactory(newSharedTreeFactory);

	const dataObjectFactory = new DataObjectFactory({
		type: "TestDataObject",
		ctor: TestDataObject,
		sharedObjects: [sharedTreeShimFactory],
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
		await provider.ensureSynchronized();
		// This is a silent check that we can get the tree after storing the handle
		const shim2 = await testObj2.getTree();

		// Get the tree from the shim
		const tree1 = shim1.currentTree;
		const tree2 = shim2.currentTree;

		const view1 = tree1.viewWith(treeConfig);
		// Initialize our tree, this sends an op since we are a live container
		view1.initialize({ quantity: 0 });
		await provider.ensureSynchronized();
		const view2 = tree2.viewWith(treeConfig);

		// This does some typing and gives us the root node.
		const rootNode1: RootType = view1.root;
		const rootNode2: RootType = view2.root;

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
		await provider.ensureSynchronized();
		const shim3 = await testObj3.getTree();
		const tree3 = shim3.currentTree;
		const view3 = tree3.viewWith(treeConfig);
		const rootNode3: RootType = view3.root;

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
