/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { type ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluid-private/test-version-utils";
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
	type ITreeView,
	type ProxyNode,
} from "@fluid-experimental/tree2";
import { type IFluidHandle } from "@fluidframework/core-interfaces";
import { type IContainerRuntimeOptions } from "@fluidframework/container-runtime";

const treeKey = "treeKey";

class TestDataObject extends DataObject {
	// Allows us to get the SharedObject with whatever type we want
	public async getTree(): Promise<ISharedTree> {
		const handle: IFluidHandle<IChannel> | undefined =
			this.root.get<IFluidHandle<IChannel>>(treeKey);
		assert(handle !== undefined, "No handle found");
		return (await handle.get()) as ISharedTree;
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

function getNewTreeView(tree: ISharedTree): ITreeView<typeof schema.rootFieldSchema> {
	return tree.schematize({
		initialTree: {
			quantity: 0,
		},
		allowedSchemaModifications: AllowedUpdateType.None,
		schema,
	});
}

describeNoCompat("Race condition", (getTestObjectProvider) => {
	// Allow us to control summaries
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
	};

	// registry
	const newSharedTreeFactory = new SharedTreeFactory();
	const dataObjectFactory = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[newSharedTreeFactory],
		{},
	);
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory,
		registryEntries: [dataObjectFactory.registryEntry],
		runtimeOptions,
	});

	let provider: ITestObjectProvider;

	beforeEach(async () => {
		provider = getTestObjectProvider();
	});

	itExpects(
		"assert 0x7ce",
		[
			{
				eventName: "fluid:telemetry:Container:ContainerClose",
				category: "error",
				error: "0x7ce",
			},
		],
		async () => {
			const container1 = await provider.createContainer(runtimeFactory);
			const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
			testObj1.createTree(newSharedTreeFactory.type);
			await provider.ensureSynchronized();
			const tree1 = await testObj1.getTree();

			const container2 = await provider.loadContainer(runtimeFactory);
			const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
			const tree2 = await testObj2.getTree();

			// Schematize our tree, this sends an op since we are a live container
			const view1 = getNewTreeView(tree1);
			const view2 = getNewTreeView(tree2);
			await provider.ensureSynchronized();

			// This does some typing and gives us the root node.
			const rootNode1: ProxyNode<typeof rootType> = view1.root;
			const rootNode2: ProxyNode<typeof rootType> = view2.root;

			// Test that we can modify/send ops with the new Shared Tree
			await provider.opProcessingController.pauseProcessing();
			rootNode1.quantity = 1;
			rootNode2.quantity = 2;
			provider.opProcessingController.resumeProcessing();
			await provider.ensureSynchronized();
			assert(
				rootNode2.quantity === rootNode1.quantity,
				"Failed to update the new tree via op",
			);
			assert(container1.closed === false, "Container1 should not be closed");
			// Not sure how container 2 hits assert 0x7ce
			assert(container2.closed === true, "Container2 should closes due to assert");
		},
	);
});
