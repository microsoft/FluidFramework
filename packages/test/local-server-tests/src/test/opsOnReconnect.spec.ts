/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/internal";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import {
	loadExistingContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import {
	ContainerMessageType,
	IContainerRuntimeOptions,
	type IContainerRuntimeOptionsInternal,
} from "@fluidframework/container-runtime/internal";
import { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import { SharedDirectory, type ISharedMap, SharedMap } from "@fluidframework/map/internal";
import { FlushMode, IEnvelope } from "@fluidframework/runtime-definitions/internal";
import { createDataStoreFactory } from "@fluidframework/runtime-utils/internal";
import { SharedString } from "@fluidframework/sequence/internal";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import {
	ITestFluidObject,
	LoaderContainerTracker,
	LocalCodeLoader,
	TestFluidObjectFactory,
	createAndAttachContainerUsingProps,
	toIDeltaManagerFull,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

describe("Ops on Reconnect", () => {
	const documentId = "opsOnReconnectTest";
	const documentLoadUrl = `https://localhost/${documentId}`;
	const map1Id = "map1Key";
	const map2Id = "map2Key";
	const directoryId = "directoryKey";
	const stringId = "sharedStringKey";
	const codeDetails: IFluidCodeDetails = {
		package: "opsOnReconnectTestPackage",
		config: {},
	};

	let urlResolver: LocalResolver;
	let deltaConnectionServer: ILocalDeltaConnectionServer;
	let documentServiceFactory: LocalDocumentServiceFactory;
	let loaderContainerTracker: LoaderContainerTracker;
	let container1: IContainer;
	let container1Object1: ITestFluidObject & IFluidLoadable;
	let container1Object1Map1: ISharedMap;
	let container1Object1Map2: ISharedMap;
	let container1Object1Directory: SharedDirectory;
	let container1Object1String: SharedString;
	let receivedValues: any[] = [];

	function createLoaderProps(runtimeOptions?: IContainerRuntimeOptions): ILoaderProps {
		const factory: TestFluidObjectFactory = new TestFluidObjectFactory([
			[map1Id, SharedMap.getFactory()],
			[map2Id, SharedMap.getFactory()],
			[directoryId, SharedDirectory.getFactory()],
			[stringId, SharedString.getFactory()],
		]);

		const defaultFactory = createDataStoreFactory("default", factory);
		const dataObject2Factory = createDataStoreFactory("dataObject2", factory);
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory,
			registryEntries: [
				[defaultFactory.type, Promise.resolve(defaultFactory)],
				[dataObject2Factory.type, Promise.resolve(dataObject2Factory)],
			],
			runtimeOptions,
		});

		const codeLoader = new LocalCodeLoader([[codeDetails, runtimeFactory]]);

		return {
			urlResolver,
			documentServiceFactory,
			codeLoader,
		};
	}

	async function createContainer(
		runtimeOptions?: IContainerRuntimeOptions,
	): Promise<IContainer> {
		const createDetachedContainerProps = createLoaderProps(runtimeOptions);
		const container: IContainer = await createAndAttachContainerUsingProps(
			{ ...createDetachedContainerProps, codeDetails },
			urlResolver.createCreateNewRequest(documentId),
		);
		loaderContainerTracker.addContainer(container);
		return container;
	}

	async function setupFirstContainer(
		runtimeOptions: IContainerRuntimeOptionsInternal = { flushMode: FlushMode.Immediate },
	) {
		// Create the first container, dataObject and DDSes.
		container1 = await createContainer(runtimeOptions);
		container1Object1 = (await container1.getEntryPoint()) as ITestFluidObject;

		container1Object1Map1 = await container1Object1.getSharedObject<ISharedMap>(map1Id);
		container1Object1Map2 = await container1Object1.getSharedObject<ISharedMap>(map2Id);
		container1Object1Directory =
			await container1Object1.getSharedObject<SharedDirectory>(directoryId);
		container1Object1String = await container1Object1.getSharedObject<SharedString>(stringId);
	}

	async function setupSecondContainersDataObject(): Promise<ITestFluidObject> {
		const loaderProps = createLoaderProps();
		const container2 = await loadExistingContainer({
			...loaderProps,
			request: { url: documentLoadUrl },
		});
		loaderContainerTracker.addContainer(container2);
		await waitForContainerConnection(container2);

		// Get dataStore1 on the second container.
		const container2Object1 = (await container2.getEntryPoint()) as ITestFluidObject;

		container2Object1.context.containerRuntime.on(
			"op",
			(message: ISequencedDocumentMessage) => {
				if (message.type === ContainerMessageType.FluidDataStoreOp) {
					const envelope = message.contents as IEnvelope;
					const address = envelope.contents.content.address;
					const content = envelope.contents.content.contents;
					const batch = (message.metadata as { batch?: unknown } | undefined)?.batch;
					let value1: string | number;
					let value2: string;
					// Add special handling for SharedString. SharedMap and SharedDirectory content structure is same.
					if (address === stringId) {
						value1 = content.pos1;
						value2 = content.seg;
					} else {
						value1 = content.key;
						value2 = content.value.value;
					}
					receivedValues.push([value1, value2, batch]);
				}
			},
		);

		return container2Object1;
	}

	beforeEach(async () => {
		urlResolver = new LocalResolver();
		deltaConnectionServer = LocalDeltaConnectionServer.create();
		documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
		loaderContainerTracker = new LoaderContainerTracker();

		// Wait for the attach ops to get processed.
		await loaderContainerTracker.ensureSynchronized();
	});

	afterEach(() => {
		loaderContainerTracker.reset();
	});

	describe("Ops on Container reconnect", () => {
		it("can resend ops on reconnection that were sent in disconnected state", async () => {
			// Initialize first container with specific flushMode
			await setupFirstContainer();
			// Create a second container and set up a listener to store the received map / directory values.
			await setupSecondContainersDataObject();

			// Disconnect the client.
			assert(container1.clientId);
			documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

			// The Container should be in disconnected state.
			assert.equal(container1.connectionState, ConnectionState.Disconnected);

			// Set values in DDSes in disconnected state.
			container1Object1.context.containerRuntime.orderSequentially(() => {
				container1Object1Map1.set("key1", "value1");
				container1Object1Map1.set("key2", "value2");
				container1Object1Map2.set("key3", "value3");
				container1Object1Map2.set("key4", "value4");
				container1Object1String.insertText(0, "value5");
			});

			// Wait for the Container to get reconnected.
			await waitForContainerConnection(container1);

			// Wait for the ops to get processed by both the containers.
			await loaderContainerTracker.ensureSynchronized();

			const expectedValues = [
				["key1", "value1", true],
				["key2", "value2", undefined],
				["key3", "value3", undefined],
				["key4", "value4", undefined],
				[0, "value5", false], // This is for the SharedString
			];
			assert.deepStrictEqual(
				receivedValues,
				expectedValues,
				"Did not receive the ops that were sent in disconnected state",
			);
		});

		it("can resend ops on reconnection that were sent in Nack'd state", async () => {
			// Initialize first container with specific flushMode
			await setupFirstContainer();
			// Create a second container and set up a listener to store the received map / directory values.
			await setupSecondContainersDataObject();

			// Nack the client.
			assert(container1.clientId);
			documentServiceFactory.nackClient(container1.clientId);

			// The Container should be in disconnected state because DeltaManager disconnects on getting Nack'd.
			assert.equal(container1.connectionState, ConnectionState.Disconnected);

			// Set values in DDSes in disconnected state.
			container1Object1.context.containerRuntime.orderSequentially(() => {
				container1Object1Map1.set("key1", "value1");
				container1Object1Map1.set("key2", "value2");
				container1Object1Directory.set("key3", "value3");
				container1Object1Directory.set("key4", "value4");
			});

			// Wait for the Container to get reconnected.
			await waitForContainerConnection(container1);

			// Wait for the ops to get processed by both the containers.
			await loaderContainerTracker.ensureSynchronized();

			const expectedValues = [
				["key1", "value1", true],
				["key2", "value2", undefined],
				["key3", "value3", undefined],
				["key4", "value4", false],
			];
			assert.deepStrictEqual(
				receivedValues,
				expectedValues,
				"Did not receive the ops that were sent in Nack'd state",
			);
		});
	});

	describe("Ordering of ops that are sent in disconnected state", () => {
		it("can resend ops in a dataObject in right order on reconnect", async () => {
			// Initialize first container with specific flushMode
			await setupFirstContainer();
			// Create a second container and set up a listener to store the received map / directory values.
			await setupSecondContainersDataObject();

			// Disconnect the client.
			assert(container1.clientId);
			documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

			// The Container should be in disconnected state.
			assert.equal(container1.connectionState, ConnectionState.Disconnected);

			// Set values in each DDS interleaved with each other.
			container1Object1.context.containerRuntime.orderSequentially(() => {
				container1Object1Map1.set("key1", "value1");
				container1Object1Map2.set("key2", "value2");
				container1Object1Directory.set("key3", "value3");
				container1Object1Map1.set("key4", "value4");
				container1Object1Map2.set("key5", "value5");
				container1Object1Directory.set("key6", "value6");
			});

			// Wait for the Container to get reconnected.
			await waitForContainerConnection(container1);

			// Wait for the ops to get processed by both the containers.
			await loaderContainerTracker.ensureSynchronized();

			const expectedValues = [
				["key1", "value1", true],
				["key2", "value2", undefined],
				["key3", "value3", undefined],
				["key4", "value4", undefined],
				["key5", "value5", undefined],
				["key6", "value6", false],
			];
			assert.deepStrictEqual(
				receivedValues,
				expectedValues,
				"Did not receive the ops that were sent in disconnected state",
			);
		});

		it("can resend ops in multiple dataObjects in right order on reconnect", async () => {
			// Initialize first container with specific flushMode
			await setupFirstContainer();

			// Create dataObject2 in the first container.
			const dataStore =
				await container1Object1.context.containerRuntime.createDataStore("dataObject2");
			const container1Object2 = (await dataStore.entryPoint.get()) as ITestFluidObject;

			// Get the maps in dataStore2.
			const container1Object2Map1 =
				await container1Object2.getSharedObject<ISharedMap>(map1Id);
			const container1Object2Map2 =
				await container1Object2.getSharedObject<ISharedMap>(map2Id);

			// Set the new dataStore's handle in a map so that a new container has access to it.
			container1Object1.context.containerRuntime.orderSequentially(() => {
				container1Object1Map1.set("dataStore2Key", container1Object2.handle);
			});

			// Wait for the set above to get processed.
			await loaderContainerTracker.ensureSynchronized();

			// Create a second container and set up a listener to store the received map / directory values.
			const container2Object1 = await setupSecondContainersDataObject();

			// Get dataObject2 in the second container.
			const container2Object1Map1 =
				await container2Object1.getSharedObject<ISharedMap>(map1Id);
			assert(container2Object1Map1);
			const container2Object2Handle =
				container2Object1Map1.get<IFluidHandle<ITestFluidObject & IFluidLoadable>>(
					"dataStore2Key",
				);
			assert(container2Object2Handle);
			const container2Object2 = await container2Object2Handle.get();
			assert.ok(container2Object2, "Could not get dataStore2 in the second container");

			// Disconnect the client.
			assert(container1.clientId);
			documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

			// The Container should be in disconnected state.
			assert.equal(container1.connectionState, ConnectionState.Disconnected);

			// Set values in the DDSes across the two dataStores interleaved with each other.
			container1Object1.context.containerRuntime.orderSequentially(() => {
				container1Object1Map1.set("key1", "value1");
				container1Object2Map1.set("key2", "value2");
				container1Object1Map2.set("key3", "value3");
				container1Object2Map2.set("key4", "value4");
				container1Object1Map1.set("key5", "value5");
				container1Object2Map1.set("key6", "value6");
				container1Object1Map2.set("key7", "value7");
				container1Object2Map2.set("key8", "value8");
			});

			// Wait for the Container to get reconnected.
			await waitForContainerConnection(container1);

			// Wait for the ops to get processed by both the containers.
			await loaderContainerTracker.ensureSynchronized();

			const expectedValues = [
				["key1", "value1", true],
				["key2", "value2", undefined],
				["key3", "value3", undefined],
				["key4", "value4", undefined],
				["key5", "value5", undefined],
				["key6", "value6", undefined],
				["key7", "value7", undefined],
				["key8", "value8", false],
			];
			assert.deepStrictEqual(
				receivedValues,
				expectedValues,
				"Did not receive the ops that were sent in disconnected state",
			);
		});
	});

	describe("Ordering of ops when disconnecting after ops are sent", () => {
		it("can resend ops in a dataObject in right order on connect", async () => {
			// Initialize first container
			await setupFirstContainer();
			// Create a second container and set up a listener to store the received map / directory values.
			await setupSecondContainersDataObject();

			// Set values in each DDS interleaved with each other.
			container1Object1Map1.set("key1", "value1");
			container1Object1Map2.set("key2", "value2");
			container1Object1Directory.set("key3", "value3");
			container1Object1Map1.set("key4", "value4");
			container1Object1Map2.set("key5", "value5");
			container1Object1Directory.set("key6", "value6");

			// Disconnect the client.
			assert(container1.clientId);
			documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

			// The Container should be in disconnected state.
			assert.equal(container1.connectionState, ConnectionState.Disconnected);

			// Wait for the Container to get reconnected.
			await waitForContainerConnection(container1);

			// Wait for the ops to get processed by both the containers.
			await loaderContainerTracker.ensureSynchronized();

			const expectedValues = [
				["key1", "value1", undefined],
				["key2", "value2", undefined],
				["key3", "value3", undefined],
				["key4", "value4", undefined],
				["key5", "value5", undefined],
				["key6", "value6", undefined],
			];
			assert.deepStrictEqual(
				receivedValues,
				expectedValues,
				"Did not receive the ops that were sent in disconnected state",
			);
		});

		it("can resend ops in multiple dataObjects in right order on connect", async () => {
			// Initialize first container with specific flushMode
			await setupFirstContainer();

			// Create dataObject2 in the first container.
			const dataStore =
				await container1Object1.context.containerRuntime.createDataStore("dataObject2");
			const container1Object2 = (await dataStore.entryPoint.get()) as ITestFluidObject;

			// Get the maps in dataStore2.
			const container1Object2Map1 =
				await container1Object2.getSharedObject<ISharedMap>(map1Id);
			const container1Object2Map2 =
				await container1Object2.getSharedObject<ISharedMap>(map2Id);

			// Set the new dataStore's handle in a map so that a new container has access to it.
			container1Object1.context.containerRuntime.orderSequentially(() => {
				container1Object1Map1.set("dataStore2Key", container1Object2.handle);
			});

			// Wait for the set above to get processed.
			await loaderContainerTracker.ensureSynchronized();

			// Create a second container and set up a listener to store the received map / directory values.
			const container2Object1 = await setupSecondContainersDataObject();

			// Get dataObject2 in the second container.
			const container2Object1Map1 =
				await container2Object1.getSharedObject<ISharedMap>(map1Id);
			const container2Object2Handle =
				container2Object1Map1.get<IFluidHandle<ITestFluidObject & IFluidLoadable>>(
					"dataStore2Key",
				);
			assert(container2Object2Handle);
			const container2Object2 = await container2Object2Handle.get();
			assert.ok(container2Object2, "Could not get dataStore2 in the second container");

			// Set values in the DDSes across the two dataStores interleaved with each other.
			container1Object1.context.containerRuntime.orderSequentially(() => {
				container1Object1Map1.set("key1", "value1");
				container1Object2Map1.set("key2", "value2");
				container1Object1Map2.set("key3", "value3");
				container1Object2Map2.set("key4", "value4");
				container1Object1Map1.set("key5", "value5");
				container1Object2Map1.set("key6", "value6");
				container1Object1Map2.set("key7", "value7");
				container1Object2Map2.set("key8", "value8");
			});

			// Disconnect the client.
			assert(container1.clientId);
			documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

			// The Container should be in disconnected state.
			assert.equal(container1.connectionState, ConnectionState.Disconnected);

			// Wait for the Container to get reconnected.
			await waitForContainerConnection(container1);

			// Wait for the ops to get processed by both the containers.
			await loaderContainerTracker.ensureSynchronized();

			const expectedValues = [
				["key1", "value1", true],
				["key2", "value2", undefined],
				["key3", "value3", undefined],
				["key4", "value4", undefined],
				["key5", "value5", undefined],
				["key6", "value6", undefined],
				["key7", "value7", undefined],
				["key8", "value8", false],
			];
			assert.deepStrictEqual(
				receivedValues,
				expectedValues,
				"Did not receive the ops that were sent in disconnected state",
			);
		});
	});

	describe("Op batching on Container reconnect", () => {
		it("can resend batch ops in a dataObject in right order on connect", async () => {
			// Initialize first container with specific flushMode
			await setupFirstContainer();
			// Create a second container and set up a listener to store the received map / directory values.
			await setupSecondContainersDataObject();

			// Disconnect the client.
			assert(container1.clientId);
			documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

			// The Container should be in disconnected state.
			assert.equal(container1.connectionState, ConnectionState.Disconnected);

			// Set values in the DDSes in orderSequentially so that they are batched together.
			container1Object1.context.containerRuntime.orderSequentially(() => {
				container1Object1Map1.set("key1", "value1");
				container1Object1Map2.set("key2", "value2");
				container1Object1Directory.set("key3", "value3");
			});

			container1Object1.context.containerRuntime.orderSequentially(() => {
				container1Object1Map1.set("key4", "value4");
				container1Object1Map2.set("key5", "value5");
				container1Object1Directory.set("key6", "value6");
			});

			// Wait for the Container to get reconnected.
			await waitForContainerConnection(container1);

			// Wait for the ops to get processed by both the containers.
			await loaderContainerTracker.ensureSynchronized();

			const expectedValues: [string, string, boolean | undefined][] = [
				["key1", "value1", true],
				["key2", "value2", undefined],
				["key3", "value3", false],
				["key4", "value4", true],
				["key5", "value5", undefined],
				["key6", "value6", false],
			];
			assert.deepStrictEqual(
				receivedValues,
				expectedValues,
				"Did not receive the ops that were sent in disconnected state",
			);
		});

		it("can resend consecutive manually flushed batches in right order on connect", async () => {
			// Initialize first container with specific flushMode
			await setupFirstContainer();
			// Create a second container and set up a listener to store the received map / directory values.
			await setupSecondContainersDataObject();

			// Disconnect the client.
			assert(container1.clientId);
			documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

			// The Container should be in disconnected state.
			assert.equal(container1.connectionState, ConnectionState.Disconnected);

			// Set values in the DDSes so that they are batched together.
			container1Object1.context.containerRuntime.orderSequentially(() => {
				container1Object1Map1.set("key1", "value1");
				container1Object1Map2.set("key2", "value2");
				container1Object1Directory.set("key3", "value3");
			});

			// Set values in the DDSes so that they are batched together in a second batch.
			container1Object1.context.containerRuntime.orderSequentially(() => {
				container1Object1Map1.set("key4", "value4");
				container1Object1Map2.set("key5", "value5");
				container1Object1Directory.set("key6", "value6");
			});

			// Wait for the Container to get reconnected.
			await waitForContainerConnection(container1);

			// Wait for the ops to get processed by both the containers.
			await loaderContainerTracker.ensureSynchronized();

			const expectedValues: [string, string, boolean | undefined][] = [
				["key1", "value1", true],
				["key2", "value2", undefined],
				["key3", "value3", false],
				["key4", "value4", true],
				["key5", "value5", undefined],
				["key6", "value6", false],
			];
			assert.deepStrictEqual(
				receivedValues,
				expectedValues,
				"Did not receive the ops that were sent in disconnected state",
			);
		});

		it("can resend manually flushed batch in right order on connect", async () => {
			// Initialize first container with specific flushMode
			await setupFirstContainer();
			// Create a second container and set up a listener to store the received map / directory values.
			await setupSecondContainersDataObject();

			// Disconnect the client.
			assert(container1.clientId);
			documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

			// The Container should be in disconnected state.
			assert.equal(container1.connectionState, ConnectionState.Disconnected);

			// Set values in the DDSes so that they are batched together.
			container1Object1.context.containerRuntime.orderSequentially(() => {
				container1Object1Map1.set("key1", "value1");
				container1Object1Map2.set("key2", "value2");
				container1Object1Directory.set("key3", "value3");
			});

			// Wait for the Container to get reconnected.
			await waitForContainerConnection(container1);

			// Wait for the ops to get processed by both the containers.
			await loaderContainerTracker.ensureSynchronized();

			const expectedValues: [string, string, boolean | undefined][] = [
				["key1", "value1", true],
				["key2", "value2", undefined],
				["key3", "value3", false],
			];
			assert.deepStrictEqual(
				receivedValues,
				expectedValues,
				"Did not receive the ops that were sent in disconnected state",
			);
		});

		it("can resend batch ops after reconnect if disconnect happened during the batch", async () => {
			// Initialize first container with specific flushMode
			await setupFirstContainer({ flushMode: FlushMode.TurnBased });
			// Create a second container and set up a listener to store the received map / directory values.
			await setupSecondContainersDataObject();

			// Set values in the DDSes so that they are batched together.
			container1Object1Map1.set("key1", "value1");
			container1Object1Map2.set("key2", "value2");
			container1Object1Directory.set("key3", "value3");

			// Disconnect the client.
			assert(container1.clientId);
			documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

			// At this point, the delta manager should have the messages
			// in its buffer but not in its outbound queue,
			// as ops have not been flushed yet
			assert.strictEqual(toIDeltaManagerFull(container1.deltaManager).outbound.length, 0);
			assert.deepStrictEqual(receivedValues, [], "Values have been sent unexpectedly");

			// Wait for the Container to get reconnected.
			await waitForContainerConnection(container1);

			// Wait for the ops to get processed by both the containers.
			await loaderContainerTracker.ensureSynchronized();

			const expectedValues: [string, string, boolean | undefined][] = [
				["key1", "value1", true],
				["key2", "value2", undefined],
				["key3", "value3", false],
			];
			assert.deepStrictEqual(
				receivedValues,
				expectedValues,
				"Did not receive the ops that were re-sent",
			);
		});
	});

	afterEach(async () => {
		await deltaConnectionServer.webSocketServer.close();
		receivedValues = [];
	});
});
