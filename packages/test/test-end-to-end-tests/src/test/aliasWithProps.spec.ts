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
	InitialState?: TestDataObjectProps;
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
	public async initializingFirstTime(props: TestDataObjectProps): Promise<void> {
		this.root.set(propsKey, props.a);
	}
}

interface TestDataObjectProps {
	a: string;
}
type TestDataObjectFactory = DataObjectFactory<TestDataObject, TestDataObjectTypes>;

const defaultDataStoreId = "default";
class RuntimeFactoryWithProps extends BaseContainerRuntimeFactory {
	constructor(private readonly defaultFactory: TestDataObjectFactory) {
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
		const [, dataStore] = await this.defaultFactory.createInstance2(runtime, props);
		await dataStore.trySetAlias(defaultDataStoreId);
	}
}

describeCompat("HotSwap", "2.0.0-rc.1.0.0", (getTestObjectProvider) => {
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

	const createAliasedInstance = async (
		factory: TestDataObjectFactory,
		runtime: IContainerRuntime,
		props: TestDataObjectProps,
		alias: string,
	) => {
		const [object, datastore] = await factory.createInstance2(runtime, props);
		const result = await datastore.trySetAlias(alias);
		if (result !== "Success") {
			const handle = await runtime.getAliasedDataStoreEntryPoint(alias);
			assert(handle !== undefined, "Should have retrieved aliased handle");
			return (await handle.get()) as TestDataObject;
		}
		return object;
	};

	it("Aliasing should still work", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const dataObject = (await container.getEntryPoint()) as TestDataObject;
		const runtime = dataObject._context.containerRuntime as IContainerRuntime;
		const container2 = await provider.loadContainer(runtimeFactory);
		const dataObject2 = (await container2.getEntryPoint()) as TestDataObject;
		const runtime2 = dataObject2._context.containerRuntime as IContainerRuntime;

		const props1 = { a: "1 is different from 2" };
		const newObjectPromise1 = createAliasedInstance(dataObjectFactory, runtime, props1, "new");
		const props2 = { a: "Totally not same string" };
		const newObjectPromise2 = createAliasedInstance(dataObjectFactory, runtime2, props2, "new");
		await provider.ensureSynchronized();
		await Promise.all([newObjectPromise1, newObjectPromise2]);
		const newObject1 = await newObjectPromise1;
		const newObject2 = await newObjectPromise2;
		assert(newObject1.getValue() === newObject2.getValue(), "Aliasing should have worked");
	});
});
