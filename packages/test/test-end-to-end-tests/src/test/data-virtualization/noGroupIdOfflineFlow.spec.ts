/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import type { IContainerExperimental } from "@fluidframework/container-loader/internal";
import { type IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import { type IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter/internal";
import {
	type ITestObjectProvider,
	createTestConfigProvider,
} from "@fluidframework/test-utils/internal";

describeCompat("Offline Attach Ops", "NoCompat", (getTestObjectProvider, apis) => {
	const { DataObjectFactory, DataObject } = apis.dataRuntime;
	const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;

	// A Test Data Object that exposes some basic functionality.
	class TestDataObject extends DataObject {
		public get _root() {
			return this.root;
		}

		public get containerRuntime() {
			return this.context.containerRuntime as IContainerRuntime;
		}

		protected async initializingFirstTime(): Promise<void> {
			const sharedCounter = SharedCounter.create(this.runtime);
			this.root.set("counter", sharedCounter.handle);
		}

		protected async hasInitialized(): Promise<void> {
			const counterHandle = this.root.get<IFluidHandle<SharedCounter>>("counter");
			assert(counterHandle !== undefined, "counter handle must be defined");
			// This is what was hanging, as this is a RemoteFluidObjectHandle when applyStashedOp is called
			await counterHandle.get();
		}
	}

	// Allow us to control summaries
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
	};

	const testDataObjectType = "TestDataObject";
	const dataObjectFactory = new DataObjectFactory(
		testDataObjectType,
		TestDataObject,
		[SharedCounter.getFactory()],
		{},
	);

	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory,
		registryEntries: [dataObjectFactory.registryEntry],
		runtimeOptions,
	});

	let provider: ITestObjectProvider;
	const configProvider = createTestConfigProvider({
		"Fluid.Container.enableOfflineLoad": true,
	});
	beforeEach("setup", async function () {
		provider = getTestObjectProvider();
	});

	it("Can create loadingGroupId", async () => {
		const container: IContainerExperimental = await provider.createContainer(runtimeFactory, {
			configProvider,
		});
		const mainObject = (await container.getEntryPoint()) as TestDataObject;

		// Disconnect and create child object attached stashed ops
		container.disconnect();

		const childObject = await dataObjectFactory.createInstance(mainObject.containerRuntime);
		mainObject._root.set("testObject2", childObject.handle);

		const serializedState = await container.closeAndGetPendingLocalState?.();
		assert(serializedState !== undefined, "serializedState should not be undefined");

		// This should not hang
		await provider.loadContainer(
			runtimeFactory,
			{ configProvider },
			undefined,
			serializedState,
		);
	});
});
