/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { type ITestObjectProvider } from "@fluidframework/test-utils";
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
	typeboxValidator,
	ForestType,
	type ISharedTreeView2,
} from "@fluid-experimental/tree2";
import { type IFluidHandle } from "@fluidframework/core-interfaces";

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

const schema = builder.intoSchema(someType);

function getNewTreeView(tree: ISharedTree): ISharedTreeView2<typeof schema.rootFieldSchema> {
	return tree.schematize({
		initialTree: {
			quantity: 0,
		},
		allowedSchemaModifications: AllowedUpdateType.None,
		schema,
	});
}

function getSchemaCompatibleView(
	tree: ISharedTree,
): ISharedTreeView2<typeof schema.rootFieldSchema> {
	return tree.schematize({
		initialTree: {
			quantity: 0,
		},
		allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
		schema,
	});
}

describeNoCompat("SharedTree Repeat bug", (getTestObjectProvider) => {
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
	});

	let provider: ITestObjectProvider;

	beforeEach(async () => {
		provider = getTestObjectProvider();
	});

	it("Double schematize.root", async () => {
		// Setup containers
		const container1 = await provider.createContainer(runtimeFactory);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const tree1 = testObj1.createTree(sharedTreeFactory.type);
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		getNewTreeView(tree1).root;
		assert.throws(
			() => getNewTreeView(tree1).root,
			(error: Error) => {
				return error.message === "0x782";
			},
			"Expected assert 0x782",
		);
	});

	it("Double schematize.root with provider.ensureSynchronized", async () => {
		// Setup containers
		const container1 = await provider.createContainer(runtimeFactory);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const tree1 = testObj1.createTree(sharedTreeFactory.type);
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		getNewTreeView(tree1).root;
		await provider.ensureSynchronized();
		assert.throws(
			() => getNewTreeView(tree1).root,
			(error: Error) => {
				return error.message === "0x782";
			},
			"Expected assert 0x782",
		);
	});

	it("Double schematize.root with provider.ensureSynchronized", async () => {
		// Setup containers
		const container1 = await provider.createContainer(runtimeFactory);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const tree1 = testObj1.createTree(sharedTreeFactory.type);
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		getSchemaCompatibleView(tree1).root;
		await provider.ensureSynchronized();
		assert.throws(
			() => getSchemaCompatibleView(tree1).root,
			(error: Error) => {
				return error.message === "0x782";
			},
			"Expected assert 0x782",
		);
	});
});
