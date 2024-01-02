/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	ITestObjectProvider,
	createContainerRuntimeFactoryWithDefaultDataStore,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils";
import { describeCompat, ITestDataObject } from "@fluid-private/test-version-utils";

/**
 * These tests retrieve a data store after its creation but at different stages of visibility.
 * For example, a data store is retrieved via handle.get() during their initialization. It validates that
 * retrieving a data store that was created locally works fine even if the outer data store has not finished
 * initializing.
 */
describeCompat(
	"data store retrieval during creation / initialization tests",
	"FullCompat",
	(getTestObjectProvider, apis) => {
		const {
			dataRuntime: { DataObject, DataObjectFactory },
			containerRuntime: { ContainerRuntimeFactoryWithDefaultDataStore },
		} = apis;
		class InnerDataObject extends DataObject implements ITestDataObject {
			public get _root() {
				return this.root;
			}

			public get _context() {
				return this.context;
			}

			public get _runtime() {
				return this.runtime;
			}
		}
		const innerDataObjectFactory = new DataObjectFactory(
			"InnerDataObject",
			InnerDataObject,
			[],
			[],
		);

		class OuterDataObject extends DataObject implements ITestDataObject {
			public get _root() {
				return this.root;
			}

			public get _context() {
				return this.context;
			}

			public get _runtime() {
				return this.runtime;
			}

			private readonly innerDataStoreKey = "innerDataStore";

			protected async initializingFirstTime(): Promise<void> {
				const innerDataStore = await this._context.containerRuntime.createDataStore(
					innerDataObjectFactory.type,
				);
				const innerDataObject = (await innerDataStore.entryPoint?.get()) as ITestDataObject;
				this.root.set(this.innerDataStoreKey, innerDataObject.handle);
			}

			protected async hasInitialized(): Promise<void> {
				const innerDataStoreHandle = this.root.get<IFluidHandle<InnerDataObject>>(
					this.innerDataStoreKey,
				);
				assert(innerDataStoreHandle !== undefined, "inner data store handle is missing");
				// Here is where we retrieve the inner object during outer object's initialization
				await innerDataStoreHandle.get();
			}
		}
		const outerDataObjectFactory = new DataObjectFactory(
			"OuterDataObject",
			OuterDataObject,
			[],
			[],
		);

		let provider: ITestObjectProvider;

		beforeEach(() => {
			provider = getTestObjectProvider();
		});

		it("Requesting data store before outer data store completes initialization", async () => {
			const containerRuntimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
				ContainerRuntimeFactoryWithDefaultDataStore,
				{
					defaultFactory: outerDataObjectFactory,
					registryEntries: [
						[outerDataObjectFactory.type, Promise.resolve(outerDataObjectFactory)],
						[innerDataObjectFactory.type, Promise.resolve(innerDataObjectFactory)],
					],
				},
			);
			const request = provider.driver.createCreateNewRequest(provider.documentId);
			const loader = provider.createLoader([
				[provider.defaultCodeDetails, containerRuntimeFactory],
			]);

			const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
			// Get the outer dataStore from the detached container. This will create and load the inner data store
			// during initialization.
			const outerDataStore =
				await getContainerEntryPointBackCompat<ITestDataObject>(container);
			assert(outerDataStore !== undefined, "Could not load outer data store");
			await assert.doesNotReject(container.attach(request), "Container did not attach");
		});

		it("Requesting data store before outer data store (non-root) completes initialization", async () => {
			const containerRuntimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
				ContainerRuntimeFactoryWithDefaultDataStore,
				{
					defaultFactory: innerDataObjectFactory,
					registryEntries: [
						[outerDataObjectFactory.type, Promise.resolve(outerDataObjectFactory)],
						[innerDataObjectFactory.type, Promise.resolve(innerDataObjectFactory)],
					],
				},
			);
			const request = provider.driver.createCreateNewRequest(provider.documentId);
			const loader = provider.createLoader([
				[provider.defaultCodeDetails, containerRuntimeFactory],
			]);

			const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

			// Get the default dataStore from the detached container.
			const defaultDataStore =
				await getContainerEntryPointBackCompat<ITestDataObject>(container);

			// Create another data store and make it visible by adding its handle in the root data store's DDS.
			// This will create and load the inner data store during initialization.
			const dataStore2 = await outerDataObjectFactory.createInstance(
				defaultDataStore._context.containerRuntime,
			);
			defaultDataStore._root.set("dataStore2", dataStore2.handle);
			await assert.doesNotReject(
				dataStore2.handle.get(),
				"Could not retrieve outer data store",
			);
			await assert.doesNotReject(container.attach(request), "Container did not attach");
		});
	},
);
