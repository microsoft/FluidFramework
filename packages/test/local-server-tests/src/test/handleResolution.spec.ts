/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/internal";
import type {
	IContainer,
	IFluidCodeDetails,
} from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	Loader,
	loadExistingContainer,
	type ICreateDetachedContainerProps,
} from "@fluidframework/container-loader/internal";
import type { IContainerRuntimeWithResolveHandle_Deprecated } from "@fluidframework/container-runtime-definitions/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	LocalResolver,
	LocalDocumentServiceFactory,
} from "@fluidframework/local-driver/internal";
import { SharedMap } from "@fluidframework/map/internal";
import { type IContainerRuntimeBase } from "@fluidframework/runtime-definitions/internal";
import { responseToException } from "@fluidframework/runtime-utils/internal";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import {
	LoaderContainerTracker,
	LocalCodeLoader,
	TestFluidObjectFactory,
	createAndAttachContainerUsingProps,
	getContainerEntryPointBackCompat,
	getDataStoreEntryPointBackCompat,
	waitForContainerConnection,
	type ITestFluidObject,
} from "@fluidframework/test-utils/internal";

import { createLoader } from "../utils";

const mapId = "map";

async function resolveHandleWithoutWait(
	containerRuntime: IContainerRuntimeBase,
	id: string,
): Promise<ITestFluidObject> {
	try {
		const request = {
			url: id,
			headers: { wait: false },
		};
		const response = await (
			containerRuntime as IContainerRuntimeWithResolveHandle_Deprecated
		).resolveHandle(request);
		if (response.status !== 200) {
			throw responseToException(response, request);
		}
		return response.value as ITestFluidObject;
	} catch (e) {
		return Promise.reject(e);
	}
}

/**
 * Creates a non-root data object and validates that it is not visible from the root of the container.
 */
async function createNonRootDataObject(
	containerRuntime: IContainerRuntimeBase,
): Promise<ITestFluidObject> {
	const dataStore = await containerRuntime.createDataStore("default");
	const dataObject = await getDataStoreEntryPointBackCompat<ITestFluidObject>(dataStore);
	// Non-root data stores are not visible (unreachable) from the root unless their handles are stored in a
	// visible DDS.
	await assert.rejects(
		resolveHandleWithoutWait(containerRuntime, dataObject.context.id),
		"Non root data object must not be visible from root after creation",
	);
	return dataObject;
}

async function getAndValidateDataObject(
	fromDataObject: ITestFluidObject,
	key: string,
): Promise<ITestFluidObject> {
	const dataObjectHandle = fromDataObject.root.get<IFluidHandle<ITestFluidObject>>(key);
	assert(dataObjectHandle !== undefined, `Data object handle for key ${key} not found`);
	const dataObject = await dataObjectHandle.get();
	const runtime = dataObject.context.containerRuntime;
	await assert.doesNotReject(
		resolveHandleWithoutWait(runtime, dataObject.context.id),
		`Data object for key ${key} must be visible`,
	);
	return dataObject;
}

/**
 * Validates that non-root data stores that have other non-root data stores as dependencies are not visible
 * until the parent data store is visible. Also, they are visible in remote clients and can send ops.
 */
// remove .only!!!
describe.only("multi-level object visibility tests", () => {
	const documentId = "objectVisibilityTest";
	const documentLoadUrl = `https://localhost/${documentId}`;
	let container1: IContainer;
	let containerRuntime1: IContainerRuntimeBase;
	let dataObject1: ITestFluidObject;
	let documentServiceFactory: LocalDocumentServiceFactory;
	let deltaConnectionServer: ILocalDeltaConnectionServer;
	const urlResolver = new LocalResolver();

	const defaultFactory: TestFluidObjectFactory = new TestFluidObjectFactory(
		[[mapId, SharedMap.getFactory()]],
		"default",
	);
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory,
		registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
	});

	const loaderContainerTracker = new LoaderContainerTracker();

	function getDetachedContainerProps(): ICreateDetachedContainerProps {
		const codeDetails: IFluidCodeDetails = {
			package: "test",
			config: {},
		};
		const codeLoader = new LocalCodeLoader([[codeDetails, runtimeFactory]]);

		deltaConnectionServer = LocalDeltaConnectionServer.create();

		documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);

		return {
			urlResolver,
			documentServiceFactory,
			codeLoader,
			codeDetails,
		};
	}

	it("validates that non-root data store and its dependencies become visible correctly when a detached container attaches", async () => {
		loaderContainerTracker.reset();

		const props = getDetachedContainerProps();
		container1 = await createDetachedContainer(props);

		dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
		containerRuntime1 = dataObject1.context.containerRuntime;

		const dataObject2 = await createNonRootDataObject(containerRuntime1);
		const dataObject3 = await createNonRootDataObject(containerRuntime1);

		// Add the handle of dataObject3 to dataObject2's DDS. Since dataObject2 and its DDS are not visible yet,
		// dataObject2 should also be not visible (reachable).
		dataObject2.root.set("dataObject3", dataObject3.handle);
		await assert.rejects(
			resolveHandleWithoutWait(containerRuntime1, dataObject3.context.id),
			"Data object 3 must not be visible from root yet",
		);

		// Add the handle of dataObject2 to root.
		dataObject1.root.set("dataObject2", dataObject2.handle);
		// Ensure that handles can be accessed while detached without waiting for the handle to be resolved.
		await assert.doesNotReject(
			dataObject2.handle.get(),
			"Data object 2 must be visible from root after its handle is added",
		);
		await assert.doesNotReject(
			dataObject3.handle.get(),
			"Data object 3 must be visible from root after its parent's handle is added",
		);

		// Attach the container.
		await container1.attach(urlResolver.createCreateNewRequest(documentId));
		await waitForContainerConnection(container1);
		loaderContainerTracker.addContainer(container1);
		await loaderContainerTracker.ensureSynchronized();

		// Validate that the data objects are visible from root after attach.
		await assert.doesNotReject(
			resolveHandleWithoutWait(containerRuntime1, dataObject2.context.id),
			"Data object 2 must be visible from root after attach",
		);
		await assert.doesNotReject(
			resolveHandleWithoutWait(containerRuntime1, dataObject3.context.id),
			"Data object 3 must be visible from root after its parent's handle is added",
		);

		// Load a second container and validate that both the non-root data stores are visible in it.
		const loader2 = createLoader({
			deltaConnectionServer,
			runtimeFactory,
		});
		const container2 = await loadExistingContainer({
			...loader2.loaderProps,
			request: { url: documentLoadUrl },
		});
		loaderContainerTracker.addContainer(container2);
		await loaderContainerTracker.ensureSynchronized();

		const dataObject1C2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		const containerRuntime2 = dataObject1C2.context.containerRuntime;
		const dataObject2C2 = await getAndValidateDataObject(dataObject1C2, "dataObject2");
		const dataObject3C2 = await getAndValidateDataObject(dataObject2C2, "dataObject3");

		// Validate that the data objects are visible from the root of the second container.
		await assert.doesNotReject(
			resolveHandleWithoutWait(containerRuntime2, dataObject2.context.id),
			"Data object 2 must be visible from root after attach",
		);
		await assert.doesNotReject(
			resolveHandleWithoutWait(containerRuntime2, dataObject3.context.id),
			"Data object 3 must be visible from root after its parent's handle is added",
		);

		await loaderContainerTracker.ensureSynchronized();

		// Send ops for the data stores in both local and remote container and validate that the ops are
		// successfully processed.
		dataObject2.root.set("key1", "value1");
		dataObject2C2.root.set("key2", "value2");
		dataObject3.root.set("key1", "value1");
		dataObject3C2.root.set("key2", "value2");
		await loaderContainerTracker.ensureSynchronized();
		assert.strictEqual(dataObject2.root.get("key2"), "value2");
		assert.strictEqual(dataObject2C2.root.get("key1"), "value1");
		assert.strictEqual(dataObject3.root.get("key2"), "value2");
		assert.strictEqual(dataObject3C2.root.get("key1"), "value1");
	});

	it("validates that non-root data store and its dependencies become visible correctly when initial container is attached", async () => {
		loaderContainerTracker.reset();

		const props = getDetachedContainerProps();
		container1 = await createAndAttachContainerUsingProps(
			props,
			urlResolver.createCreateNewRequest(documentId),
		);
		await waitForContainerConnection(container1);
		loaderContainerTracker.addContainer(container1);

		dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
		containerRuntime1 = dataObject1.context.containerRuntime;

		const dataObject2 = await createNonRootDataObject(containerRuntime1);
		const dataObject3 = await createNonRootDataObject(containerRuntime1);

		// Add the handle of dataObject3 to dataObject2's DDS.
		dataObject2.root.set("dataObject3", dataObject3.handle);

		// Add the handle of dataObject2 to root.
		dataObject1.root.set("dataObject2", dataObject2.handle);

		// Validate that the data objects are visible from the root of the attached container.
		await assert.doesNotReject(
			resolveHandleWithoutWait(containerRuntime1, dataObject2.context.id),
			"Data object 2 must be visible from root after attach",
		);
		await assert.doesNotReject(
			resolveHandleWithoutWait(containerRuntime1, dataObject3.context.id),
			"Data object 3 must be visible from root after its parent's handle is added",
		);

		// Load a second container and validate that both the non-root data stores are visible in it.
		const loader2 = createLoader({
			deltaConnectionServer,
			runtimeFactory,
		});
		const container2 = await loadExistingContainer({
			...loader2.loaderProps,
			request: { url: documentLoadUrl },
		});
		loaderContainerTracker.addContainer(container2);
		await loaderContainerTracker.ensureSynchronized();

		const dataObject1C2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		const containerRuntime2 = dataObject1C2.context.containerRuntime;
		const dataObject2C2 = await getAndValidateDataObject(dataObject1C2, "dataObject2");
		const dataObject3C2 = await getAndValidateDataObject(dataObject2C2, "dataObject3");

		// Validate that the data objects are visible from the root of the second container.
		await assert.doesNotReject(
			resolveHandleWithoutWait(containerRuntime2, dataObject2.context.id),
			"Data object 2 must be visible from root after attach",
		);
		await assert.doesNotReject(
			resolveHandleWithoutWait(containerRuntime2, dataObject3.context.id),
			"Data object 3 must be visible from root after its parent's handle is added",
		);
		await loaderContainerTracker.ensureSynchronized();

		// Send ops for the data stores in both local and remote container and validate that the ops are
		// successfully processed.
		dataObject2.root.set("key1", "value1");
		dataObject2C2.root.set("key2", "value2");
		dataObject3.root.set("key1", "value1");
		dataObject3C2.root.set("key2", "value2");
		await loaderContainerTracker.ensureSynchronized();
		assert.strictEqual(dataObject2.root.get("key2"), "value2");
		assert.strictEqual(dataObject2C2.root.get("key1"), "value1");
		assert.strictEqual(dataObject3.root.get("key2"), "value2");
		assert.strictEqual(dataObject3C2.root.get("key1"), "value1");
	});

	it("validates that non-root data store and its dependencies become visible correctly after container close and rehydrate", async () => {
		loaderContainerTracker.reset();

		const props = getDetachedContainerProps();
		container1 = await createDetachedContainer(props);
		loaderContainerTracker.addContainer(container1);

		dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
		containerRuntime1 = dataObject1.context.containerRuntime;

		const dataObject2 = await createNonRootDataObject(containerRuntime1);
		const dataObject3 = await createNonRootDataObject(containerRuntime1);

		// Add the handle of dataObject3 to dataObject2's DDS.
		dataObject2.root.set("dataObject3", dataObject3.handle);

		// Add the handle of dataObject2 to root.
		dataObject1.root.set("dataObject2", dataObject2.handle);
		// Ensure that handles can be accessed while detached without waiting for the handle to be resolved.
		await assert.doesNotReject(
			dataObject2.handle.get(),
			"Data object 2 must be visible from root after its handle is added",
		);
		await assert.doesNotReject(
			dataObject3.handle.get(),
			"Data object 3 must be visible from root after its parent's handle is added",
		);

		// Rehydrate a second container from the snapshot of the first container to validate the visibility of the non-root data stores.
		const loader = new Loader({
			codeLoader: new LocalCodeLoader([[props.codeDetails, runtimeFactory]]),
			documentServiceFactory: props.documentServiceFactory,
			urlResolver: props.urlResolver,
		});
		const snapshot = container1.serialize();
		container1.close();

		const container2 = await loader.rehydrateDetachedContainerFromSnapshot(snapshot);
		await container2.attach(urlResolver.createCreateNewRequest(documentId));
		await waitForContainerConnection(container2);
		loaderContainerTracker.addContainer(container2);

		const dataObjectC2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		const containerRuntime2 = dataObjectC2.context.containerRuntime;
		const dataObject2C2 = await getAndValidateDataObject(dataObjectC2, "dataObject2");
		await getAndValidateDataObject(dataObject2C2, "dataObject3");

		// Validate that the data objects are visible from the root of the rehydrated container.
		await assert.doesNotReject(
			resolveHandleWithoutWait(containerRuntime2, dataObject2.context.id),
			"Data object 2 must be visible from root after attach",
		);
		await assert.doesNotReject(
			resolveHandleWithoutWait(containerRuntime2, dataObject3.context.id),
			"Data object 3 must be visible from root after its parent's handle is added",
		);
	});
});
