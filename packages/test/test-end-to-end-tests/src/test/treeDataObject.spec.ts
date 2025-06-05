/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	PureDataObjectFactory,
	TreeDataObject,
} from "@fluidframework/aqueduct/internal";
import type { IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import {
	createContainerRuntimeFactoryWithDefaultDataStore,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils/internal";
import {
	SchemaFactory,
	SharedTree,
	TreeViewConfiguration,
	type ITree,
	type TreeView,
} from "@fluidframework/tree/internal";

const schemaFactory = new SchemaFactory("test");
class TestSchema extends schemaFactory.object("TestSchema", {
	foo: [schemaFactory.string, schemaFactory.number],
}) {}

const treeViewConfig = new TreeViewConfiguration({ schema: TestSchema });

class TestTreeDataObject extends TreeDataObject<TreeView<typeof TestSchema>> {
	public override generateView(tree: ITree): TreeView<typeof TestSchema> {
		return tree.viewWith(treeViewConfig);
	}

	public override async initializingFirstTime(): Promise<void> {
		assert(this.treeView.compatibility.canInitialize);
		this.treeView.initialize({ foo: "Hello world" });
	}

	public static readonly type = "TestTreeDataObject";

	public static getFactory(): PureDataObjectFactory<TestTreeDataObject> {
		return TestTreeDataObject.factory;
	}

	private static readonly factory = new PureDataObjectFactory(
		TestTreeDataObject.type,
		TestTreeDataObject,
		[SharedTree.getFactory()],
		{},
	);
}

// Note: ideally these tests would live directly in the `aqueduct` package,
// but much of the test infrastructure used below is not reachable from that package.
describeCompat("TreeDataObject", "NoCompat", (getTestObjectProvider) => {
	// Runtime ID compression is required to use SharedTree.
	const runtimeOptions: IContainerRuntimeOptions = {
		enableRuntimeIdCompressor: "on",
	};

	const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
		ContainerRuntimeFactoryWithDefaultDataStore,
		{
			defaultFactory: TestTreeDataObject.getFactory(),
			registryEntries: [[TestTreeDataObject.type, TestTreeDataObject.getFactory()]],
			runtimeOptions,
		},
	);

	it("First time initialization", async () => {
		const provider = getTestObjectProvider();
		const container = await provider.createContainer(runtimeFactory);

		const dataObject = await getContainerEntryPointBackCompat<TestTreeDataObject>(container);
		assert.deepEqual(dataObject.treeView.root.foo, "Hello world");
	});

	it("Load existing", async () => {
		const provider = getTestObjectProvider();
		await provider.createContainer(runtimeFactory);

		// Load second container and check data.
		const container2 = await provider.loadContainer(runtimeFactory);

		const container2DataObject =
			await getContainerEntryPointBackCompat<TestTreeDataObject>(container2);
		assert.deepEqual(container2DataObject.treeView.root.foo, "Hello world");
	});
});
