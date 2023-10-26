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
	type Typed,
	type ISharedTreeView,
	typeboxValidator,
	ForestType,
} from "@fluid-experimental/tree2";
import { type IFluidHandle } from "@fluidframework/core-interfaces";
import { type IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { LoaderHeader } from "@fluidframework/container-definitions";

const treeKey = "treeKey";

class TestDataObject extends DataObject {
	public async getTree(): Promise<ISharedTree> {
		const handle: IFluidHandle<IChannel> | undefined =
			this.root.get<IFluidHandle<IChannel>>(treeKey);
		assert(handle !== undefined, "No handle found");
		return (await handle.get()) as ISharedTree;
	}

	public createTree(type: string): ISharedTree {
		const channel = this.runtime.createChannel(treeKey, type);
		this.root.set(treeKey, channel.handle);
		return channel as ISharedTree;
	}
}

const builder = new SchemaBuilder({ scope: "test" });
const someType = builder.object("abc", {
	quantity: builder.number,
});

const schema = builder.intoSchema(SchemaBuilder.required(someType));

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

describeNoCompat("SharedTree", (getTestObjectProvider) => {
	// Allow us to control summaries
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
	};

	// Registry
	const sharedTreeFactory = new SharedTreeFactory({
		jsonValidator: typeboxValidator,
		forest: ForestType.Reference,
	});

	const dataObjectFactory = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[sharedTreeFactory],
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
		// Setup containers
		const container1 = await provider.createContainer(runtimeFactory);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const tree1 = testObj1.createTree(sharedTreeFactory.type);

		await provider.ensureSynchronized();
		const container2 = await provider.loadContainer(runtimeFactory);
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		const tree2 = await testObj2.getTree();

		// Get the views and root object to modify
		const view1 = getNewTreeView(tree1);
		const view2 = getNewTreeView(tree2);
		const treeNode1 = view1.root2(schema);
		const treeNode2 = view2.root2(schema);

		await provider.ensureSynchronized();

		// Modify the tree
		treeNode1.quantity = testValue;

		await provider.ensureSynchronized();

		// These should be the same, which they are.
		assert(treeNode2.quantity === treeNode1.quantity, "Failed to update the new tree via op");
		assert(treeNode2.quantity === testValue, "Failed to update the new tree via op");

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
		const tree3 = await testObj3.getTree();
		const view3 = getNewTreeView(tree3);
		const treeNode3 = view3.root as unknown as Typed<typeof someType>;
		await provider.ensureSynchronized();

		// These should be the same, which they aren't
		assert(treeNode3.quantity !== treeNode1.quantity, `This assert should fail`);
		// Turns out treeNode3.quantity is 0, not 5
		assert(treeNode3.quantity !== testValue, "Failed to update the tree at all");

		// Try to modify the tree to see if the trees sync
		treeNode3.quantity = 4;
		await provider.ensureSynchronized();
		// These should be the same, which they aren't
		assert(treeNode3.quantity !== treeNode1.quantity, `Fix this assert`);
		// Turns out treeNode1.quantity is still 5, not 4
		assert(treeNode1.quantity !== 4, "Failed to update the tree at all");
	});
});
