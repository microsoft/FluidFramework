/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import {
	describeFullCompat,
	ITestDataObject,
	TestDataObjectType,
} from "@fluid-internal/test-version-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";

/**
 * These tests retrieve a data store via handle.get() during their initialization. They validate that
 * retrieving a data store that was created locally works fine even if the outer data store has not
 * finished initializing.
 */
describeFullCompat(
	"data store retrieval during initialization tests",
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
				await innerDataObject.handle.get();
			}

			protected async hasInitialized(): Promise<void> {
				const innerDataStoreHandle = this.root.get<IFluidHandle<InnerDataObject>>(
					this.innerDataStoreKey,
				);
				assert(innerDataStoreHandle !== undefined, "inner data store handle is missing");
			}
		}
		const outerDataObjectFactory = new DataObjectFactory(
			"OuterDataObject",
			OuterDataObject,
			[],
			[],
		);

		let provider: ITestObjectProvider;
		const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
			runtime.IFluidHandleContext.resolveHandle(request);

		beforeEach(() => {
			provider = getTestObjectProvider();
		});

		it("Requesting not visible data stores in detached container", async () => {
			const request = provider.driver.createCreateNewRequest(provider.documentId);
			const loader = provider.makeTestLoader();
			const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
			// Get the default (root) dataStore from the detached container.
			const mainDataStore = await requestFluidObject<ITestDataObject>(container, "/");

			// Create another data store and make it visible by adding its handle in the root data store's DDS.
			const dataStore2 = await mainDataStore._context.containerRuntime.createDataStore(
				TestDataObjectType,
			);
			const dataObject2 = (await dataStore2.entryPoint?.get()) as ITestDataObject;
			assert(dataObject2 !== undefined, "could not create dataStore2");
			mainDataStore._root.set("dataStore2", dataObject2.handle);

			// Request the new data store via the request API on the container.
			const dataStore2Response = await container.request({
				url: dataObject2.handle.absolutePath,
			});
			assert(
				dataStore2Response.mimeType === "fluid/object" && dataStore2Response.status === 200,
				"Unable to load bound data store in detached container",
			);
			await container.attach(request);
		});

		it("Requesting data store before outer data store completes initialization", async () => {
			const containerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
				outerDataObjectFactory,
				[
					[outerDataObjectFactory.type, Promise.resolve(outerDataObjectFactory)],
					[innerDataObjectFactory.type, Promise.resolve(innerDataObjectFactory)],
				],
				undefined,
				[innerRequestHandler],
			);
			const request = provider.driver.createCreateNewRequest(provider.documentId);
			const loader = provider.createLoader([
				[provider.defaultCodeDetails, containerRuntimeFactory],
			]);

			const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
			// Get the outer dataStore from the detached container.
			const outerDataStore = await requestFluidObject<ITestDataObject>(container, "/");
			assert(outerDataStore !== undefined, "Could not load outer data store");

			await container.attach(request);
		});

		it("Requesting data store before outer data store (non-root) completes initialization", async () => {
			const containerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
				innerDataObjectFactory,
				[
					[outerDataObjectFactory.type, Promise.resolve(outerDataObjectFactory)],
					[innerDataObjectFactory.type, Promise.resolve(innerDataObjectFactory)],
				],
				undefined,
				[innerRequestHandler],
			);
			const request = provider.driver.createCreateNewRequest(provider.documentId);
			const loader = provider.createLoader([
				[provider.defaultCodeDetails, containerRuntimeFactory],
			]);

			const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

			// Get the default dataStore from the detached container.
			const defaultDataStore = await requestFluidObject<ITestDataObject>(container, "/");

			// Create another data store and make it visible by adding its handle in the root data store's DDS.
			const dataStore2 = await outerDataObjectFactory.createInstance(
				defaultDataStore._context.containerRuntime,
			);
			defaultDataStore._root.set("dataStore2", dataStore2.handle);

			await container.attach(request);
		});
	},
);
