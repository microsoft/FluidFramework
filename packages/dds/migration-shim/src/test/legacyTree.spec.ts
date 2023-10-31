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
import { type IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import {
	type BuildNode,
	Change,
	SharedTree as LegacySharedTree,
	StablePlace,
	type TraitLabel,
} from "@fluid-experimental/tree";

import { type IContainerRuntimeOptions } from "@fluidframework/container-runtime";

const treeKey = "treeKey";

class TestDataObject extends DataObject {
	public get _runtime(): IFluidDataStoreRuntime {
		return this.runtime;
	}

	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public get _root() {
		return this.root;
	}
}

describeNoCompat("MigrationShim", (getTestObjectProvider) => {
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
	const legacyTreeFactory = LegacySharedTree.getFactory();
	const dataObjectFactory = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[legacyTreeFactory],
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

	it("Tree blows up", async () => {
		const container1 = await provider.createContainer(runtimeFactory);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const someNodeId = "someNodeId" as TraitLabel;
		const tree = testObj1._runtime.createChannel(
			treeKey,
			legacyTreeFactory.type,
		) as LegacySharedTree;
		const inventoryNode: BuildNode = {
			definition: someNodeId,
			traits: {
				quantity: {
					definition: "quantity",
					payload: 5,
				},
			},
		};
		tree.applyEdit(
			Change.insertTree(
				inventoryNode,
				StablePlace.atStartOf({
					parent: tree.currentView.root,
					label: someNodeId,
				}),
			),
		);
		// attaching with local changes assert 0x62e
		assert.throws(() => testObj1._root.set(treeKey, tree.handle), /0x62e/);
	});
});
