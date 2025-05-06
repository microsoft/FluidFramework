/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	BuildNode,
	Change,
	SharedTree,
	StablePlace,
	TraitLabel,
} from "@fluid-experimental/tree";
import { ITestDataObject, describeCompat } from "@fluid-private/test-version-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils/internal";

describeCompat("Can attach Legacy Shared Tree", "NoCompat", (getTestObjectProvider, apis) => {
	const { DataObject, DataObjectFactory } = apis.dataRuntime;
	const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;

	class TestDataObject extends DataObject {
		public get _context() {
			return this.context;
		}
		public get _runtime() {
			return this.runtime;
		}
		public get _root() {
			return this.root;
		}
	}

	const dataObjectFactory = new DataObjectFactory({
		type: "test",
		ctor: TestDataObject,
		sharedObjects: [SharedTree.getFactory()],
		optionalProviders: undefined,
	});
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory,
		registryEntries: [["test", Promise.resolve(dataObjectFactory)]],
	});

	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});

	it("attached container, detached data store, tree attached to data store", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const rootObject = (await container.getEntryPoint()) as ITestDataObject;
		const containerRuntime = rootObject._context.containerRuntime;

		const dataStore = await containerRuntime.createDataStore("test");
		const testDataObject = (await dataStore.entryPoint.get()) as TestDataObject;

		const tree = testDataObject._runtime.createChannel(
			"tree",
			SharedTree.getFactory().type,
		) as SharedTree;
		const inventoryNode: BuildNode = {
			definition: "abc",
			traits: {
				quantity: {
					definition: "quantity",
					payload: 0,
				},
			},
		};
		tree.applyEdit(
			Change.insertTree(
				inventoryNode,
				StablePlace.atStartOf({
					parent: tree.currentView.root,
					label: "inventory" as TraitLabel,
				}),
			),
		);

		testDataObject._root.set("tree", tree.handle);
		rootObject._root.set("tree", testDataObject.handle);
		await provider.ensureSynchronized();
	});

	it("Attached container, attached data store, detached tree", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const testObj = (await container.getEntryPoint()) as ITestDataObject;
		const someNodeId = "someNodeId" as TraitLabel;
		const tree = testObj._runtime.createChannel(
			"abc",
			SharedTree.getFactory().type,
		) as SharedTree;
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
		assert.doesNotThrow(() => testObj._root.set("any", tree.handle), "Can't attach tree");
		await provider.ensureSynchronized();
	});
});
