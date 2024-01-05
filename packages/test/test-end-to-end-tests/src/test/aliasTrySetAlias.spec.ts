/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { describeCompat } from "@fluid-private/test-version-utils";
import {
	BaseContainerRuntimeFactory,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { FluidObject, IEvent } from "@fluidframework/core-interfaces";
import { type ITestObjectProvider } from "@fluidframework/test-utils";

interface TestDataObjectTypes {
	/**
	 * represents a type that will define optional providers that will be injected
	 */
	OptionalProviders?: FluidObject;
	/**
	 * the initial state type that the produced data object may take during creation
	 */
	InitialState?: { a: string };
	/**
	 * represents events that will be available in the EventForwarder
	 */
	Events?: IEvent;
}

const propsKey = "props";

// A Test Data Object that exposes some basic functionality.
class TestDataObject extends DataObject<TestDataObjectTypes> {
	public get _context() {
		return this.context;
	}

	public getValue(): string | undefined {
		return this.root.get(propsKey);
	}

	// The object starts with a LegacySharedTree
	public async initializingFirstTime(props: { a: string }): Promise<void> {
		this.root.set(propsKey, props.a);
	}
}

const defaultDataStoreId = "default";
class RuntimeFactoryWithProps extends BaseContainerRuntimeFactory {
	constructor(
		private readonly defaultFactory: DataObjectFactory<TestDataObject, TestDataObjectTypes>,
	) {
		const props = {
			registryEntries: [defaultFactory.registryEntry],
			provideEntryPoint: async (runtime: IContainerRuntime) => {
				const entrypoint = await runtime.getAliasedDataStoreEntryPoint(defaultDataStoreId);
				assert(entrypoint !== undefined, "default dataStore must exist");
				return entrypoint.get();
			},
		};
		super(props);
	}

	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const props = { a: "b" };
		await this.defaultFactory.createRootInstance(defaultDataStoreId, runtime, props);
	}
}

describeCompat("HotSwap", "NoCompat", (getTestObjectProvider) => {
	// Registry -----------------------------------------
	const dataObjectFactory = new DataObjectFactory("TestDataObject", TestDataObject, [], {});
	const runtimeFactory = new RuntimeFactoryWithProps(dataObjectFactory);

	let provider: ITestObjectProvider;

	beforeEach(async () => {
		provider = getTestObjectProvider();
	});

	it("Can create root data object without passing props to context", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const dataObject = (await container.getEntryPoint()) as TestDataObject;
		assert(dataObject.getValue() === "b", "The value should be b");
		const context = dataObject._context;
		assert(
			context.createProps === undefined,
			"createProps should not have been set on the context",
		);
	});

	it("Aliasing should still work", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const dataObject = (await container.getEntryPoint()) as TestDataObject;
		const runtime = dataObject._context.containerRuntime as IContainerRuntime;
		const container2 = await provider.loadContainer(runtimeFactory);
		const dataObject2 = (await container2.getEntryPoint()) as TestDataObject;
		const runtime2 = dataObject2._context.containerRuntime as IContainerRuntime;

		const props = { a: "a test" };
		const newObjectPromise1 = dataObjectFactory.createRootInstance("new", runtime, props);
		const props2 = { a: "b test" };
		const newObjectPromise2 = dataObjectFactory.createRootInstance("new", runtime2, props2);
		await provider.ensureSynchronized();
		await Promise.all([newObjectPromise1, newObjectPromise2]);
		const handle = await runtime.getAliasedDataStoreEntryPoint("new");
		const handle2 = await runtime2.getAliasedDataStoreEntryPoint("new");
		assert(handle !== undefined, "handle should not be undefined");
		assert(handle2 !== undefined, "handle2 should not be undefined");
		const newObject1 = (await handle.get()) as TestDataObject;
		const newObject2 = (await handle2.get()) as TestDataObject;
		assert(newObject1 !== undefined, "newObject1 should not be undefined");
		assert(newObject2 !== undefined, "newObject2 should not be undefined");
		assert(newObject1.getValue() === newObject2.getValue(), "Aliasing should have worked");
	});
});
