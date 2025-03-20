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
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import {
	createContainerRuntimeFactoryWithDefaultDataStore,
	getContainerEntryPointBackCompat,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";
import {
	SchemaFactory,
	SharedTree,
	TreeViewConfiguration,
} from "@fluidframework/tree/internal";

const schemaFactory = new SchemaFactory("test");
class TestSchema extends schemaFactory.object("TestSchema", {
	foo: [schemaFactory.string, schemaFactory.number],
}) {}

const treeViewConfig = new TreeViewConfiguration({ schema: TestSchema });

class TestTreeDataObject extends TreeDataObject<typeof TestSchema> {
	public readonly config = treeViewConfig;

	public override async initializingFirstTime(): Promise<void> {
		assert(this.tree.compatibility.canInitialize);
		this.tree.initialize({ foo: "Hello world" });
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

	let provider: ITestObjectProvider;
	let container: IContainer;
	beforeEach(async () => {
		provider = getTestObjectProvider();
		container = await provider.createContainer(runtimeFactory);
	});

	it("First time initialization", async () => {
		const dataObject = await getContainerEntryPointBackCompat<TestTreeDataObject>(container);
		assert.deepEqual(dataObject.tree.root.foo, "Hello world");
	});

	it("Load existing", async () => {
		// Load second container and check data.
		const container2 = await provider.loadContainer(runtimeFactory);

		const container2DataObject =
			await getContainerEntryPointBackCompat<TestTreeDataObject>(container2);
		assert.deepEqual(container2DataObject.tree.root.foo, "Hello world");
	});
});
