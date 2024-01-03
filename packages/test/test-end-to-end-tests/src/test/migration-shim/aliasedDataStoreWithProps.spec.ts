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

	// Makes it so we can get the tree stored as "tree"
	public async hasInitialized(): Promise<void> {
		const value = this.root.get(propsKey);
		assert(value === "b", "The value should be b");
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
	const dataObjectFactory1 = new DataObjectFactory("TestDataObject", TestDataObject, [], {});
	const runtimeFactory = new RuntimeFactoryWithProps(dataObjectFactory1);

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
});
