/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITestObjectProvider } from "@fluidframework/test-utils";
import { SharedTree } from "@fluid-experimental/tree";
import { ITestDataObject, describeCompat } from "@fluid-private/test-version-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";

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

const dataObjectFactory1 = new DataObjectFactory(
	"test",
	TestDataObject,
	[SharedTree.getFactory()],
	undefined,
);
const runtimeFactory1 = new ContainerRuntimeFactoryWithDefaultDataStore({
	defaultFactory: dataObjectFactory1,
	registryEntries: [["test", Promise.resolve(dataObjectFactory1)]],
});

class TestDataObject2 extends DataObject {
	public get _context() {
		return this.context;
	}
	public get _runtime() {
		return this.runtime;
	}
	public get _root() {
		return this.root;
	}

	protected async initializingFirstTime(props?: any): Promise<void> {
		const tree = this.runtime.createChannel("tree", SharedTree.getFactory().type);
		this.root.set("tree", tree.handle);
	}
}

const dataObjectFactory2 = new DataObjectFactory(
	"test",
	TestDataObject2,
	[SharedTree.getFactory()],
	undefined,
);
const runtimeFactory2 = new ContainerRuntimeFactoryWithDefaultDataStore({
	defaultFactory: dataObjectFactory2,
	registryEntries: [["test", Promise.resolve(dataObjectFactory2)]],
	runtimeOptions: { enableGroupedBatching: true },
});

describeCompat("Creating data store with tree", "2.0.0-rc.1.0.0", (getTestObjectProvider, apis) => {
	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});

	it("attached container, createDataStore", async () => {
		const container = await provider.createContainer(runtimeFactory1);
		const rootObject = (await container.getEntryPoint()) as ITestDataObject;
		const dataStore = await rootObject._context.containerRuntime.createDataStore("test");

		const testDataObject = (await dataStore.entryPoint.get()) as TestDataObject;

		testDataObject._runtime.createChannel("tree", SharedTree.getFactory().type);
		rootObject._root.set("tree", testDataObject.handle);
		await provider.ensureSynchronized();
	});

	it("attached container, createDetachedDataStore", async () => {
		const container = await provider.createContainer(runtimeFactory1);
		const rootObject = (await container.getEntryPoint()) as ITestDataObject;

		const testDataObject = await dataObjectFactory1.createInstance(
			rootObject._context.containerRuntime,
		);

		testDataObject._runtime.createChannel("tree", SharedTree.getFactory().type);
		rootObject._root.set("tree", testDataObject.handle);
		await provider.ensureSynchronized();
	});

	// Test Data Object 2
	it("2 attached container, createDataStore", async () => {
		const container = await provider.createContainer(runtimeFactory2);
		const rootObject = (await container.getEntryPoint()) as ITestDataObject;
		const dataStore = await rootObject._context.containerRuntime.createDataStore("test");

		const testDataObject = (await dataStore.entryPoint.get()) as TestDataObject2;

		rootObject._root.set("tree", testDataObject.handle);
		await provider.ensureSynchronized();
	});

	it("2 attached container, createDetachedDataStore", async () => {
		const container = await provider.createContainer(runtimeFactory2);
		const rootObject = (await container.getEntryPoint()) as ITestDataObject;

		const testDataObject = await dataObjectFactory2.createInstance(
			rootObject._context.containerRuntime,
		);

		rootObject._root.set("tree", testDataObject.handle);
		await provider.ensureSynchronized();
	});
});
