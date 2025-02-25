/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import type { IContainerExperimental } from "@fluidframework/container-loader/internal";
import { type IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { Deferred } from "@fluidframework/core-utils/internal";
import {
	type ITestObjectProvider,
	createTestConfigProvider,
} from "@fluidframework/test-utils/internal";

const interceptResult = <T>(
	parent: any,
	fn: (...args: any[]) => Promise<T>,
	intercept: (result: T) => void | Promise<void>,
) => {
	const interceptFn = async (...args: any[]) => {
		const val = await fn.apply(parent, args);
		await intercept(val);
		return val as T;
	};
	parent[fn.name] = interceptFn;
	interceptFn.bind(parent);
	return fn;
};

describeCompat("Offline and Blobs", "NoCompat", (getTestObjectProvider, apis) => {
	const { DataObjectFactory, DataObject } = apis.dataRuntime;
	const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;

	// A Test Data Object that exposes some basic functionality.
	class TestDataObject extends DataObject {
		public get _root() {
			return this.root;
		}
		public get _runtime() {
			return this.runtime;
		}
		public handleGetPromise: Deferred<Promise<unknown>> = new Deferred();
		protected async hasInitialized() {
			// This is needed to first process the handle op before the blob attach op is processed
			this._root.on("valueChanged", (changed) => {
				const value = this._root.get<IFluidHandle>(changed.key);
				assert(value !== undefined, "Value should exist");
				this.handleGetPromise.resolve(value.get());
			});
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
	const configProvider = createTestConfigProvider({
		"Fluid.Container.enableOfflineLoad": true,
	});
	const testDataObjectType = "TestDataObject";
	const dataObjectFactory = new DataObjectFactory(testDataObjectType, TestDataObject, [], {});

	// The 1st runtime factory, V1 of the code
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory,
		registryEntries: [dataObjectFactory.registryEntry],
		runtimeOptions,
	});

	let provider: ITestObjectProvider;
	let deferred: Deferred<void>;
	let throwOnBlobCreate = false;

	beforeEach("setup", async function () {
		provider = getTestObjectProvider();
		deferred = new Deferred<void>();
		const documentServiceFactory = provider.documentServiceFactory;
		interceptResult(
			documentServiceFactory,
			documentServiceFactory.createDocumentService,
			(documentService) => {
				interceptResult(documentService, documentService.connectToStorage, (storage) => {
					interceptResult(storage, storage.createBlob, async (blob) => {
						await deferred.promise;
						if (throwOnBlobCreate) {
							throwOnBlobCreate = false;
							const error: any = new Error("Blob fetch failed");
							error.canRetry = true;
							console.log("Throwing error");
							throw error;
						}
					});
				});
			},
		);
	});

	it("Slow blob create request before container closes", async () => {
		const container = (await provider.createContainer(runtimeFactory, {
			configProvider,
		})) as IContainerExperimental;
		const mainObject = (await container.getEntryPoint()) as TestDataObject;

		await provider.ensureSynchronized();

		const storeBlobHandleAsync = async () => {
			const blobHandle = await mainObject._runtime.uploadBlob(stringToBuffer("test", "utf-8"));
			mainObject._root.set("blobHandle", blobHandle);
		};

		// Start blob creation
		const storeBlobHandlePromise = storeBlobHandleAsync();
		// Start closing the container and get the pending local state before blob creation through the network completes
		const serializedStatePromise = container.closeAndGetPendingLocalState?.();
		// wait for blob creation to finish first so that the handle op is created
		await storeBlobHandlePromise;
		// Let the rest of the close and get pending local state finish.
		const serializedState = await serializedStatePromise;
		assert(serializedState !== undefined, "Serialized state should exist");

		// One potential solution could be to fix the serialized state.

		// Load the remote container
		const container3 = await provider.loadContainer(runtimeFactory);
		const mainObject3 = (await container3.getEntryPoint()) as TestDataObject;

		const container2 = await provider.loadContainer(
			runtimeFactory,
			undefined,
			undefined,
			serializedState,
		);
		// Finish the blob creation after the container is loaded so that the blob attach op is sent after the handle op
		throwOnBlobCreate = true;
		deferred.resolve();
		await container2.getEntryPoint();

		// send the ops
		await provider.ensureSynchronized();

		// So the handleGetPromise executes as soon as the handle op is processed, before the blob attach op is processed
		// original test which has been solved
		// await assert.rejects(
		// 	mainObject3.handleGetPromise.promise,
		// 	(error: Error) => error.message === "Error: 0x11f",
		// 	"Blob should not be fetched",
		// );
		await mainObject3.handleGetPromise.promise;
	});
});
