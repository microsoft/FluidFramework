/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import {
	createDetachedContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import { type ISharedMap, SharedMap } from "@fluidframework/map/internal";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	createAndAttachContainerUsingProps,
	ITestFluidObject,
	LoaderContainerTracker,
	LocalCodeLoader,
	TestFluidObjectFactory,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

describe("Document Dirty", () => {
	const documentId = "documentDirtyTest";
	const mapId = "mapKey";
	const codeDetails: IFluidCodeDetails = {
		package: "documentDirtyTestPackage",
		config: {},
	};

	let deltaConnectionServer: ILocalDeltaConnectionServer;
	let documentServiceFactory: LocalDocumentServiceFactory;
	let loaderContainerTracker: LoaderContainerTracker;
	let container: IContainer;
	let dataObject: ITestFluidObject;
	let containerRuntime: IContainerRuntime;
	let sharedMap: ISharedMap;
	let wasMarkedDirtyRuntimeCount: number;
	let wasMarkedCleanRuntimeCount: number;
	let wasMarkedDirtyContainerCount: number;
	let wasMarkedCleanContainerCount: number;

	describe("Attached Container", () => {
		/**
		 * Waits for the "connected" event from the given container.
		 */
		async function waitForContainerReconnection(c: IContainer): Promise<void> {
			assert.notStrictEqual(c.connectionState, ConnectionState.Connected);
			return waitForContainerConnection(c);
		}

		/**
		 * Increments clean count when the "saved" event is fired
		 */
		function registerSavedContainerHandler(): void {
			containerRuntime.on("saved", () => {
				wasMarkedCleanRuntimeCount += 1;
				assert.equal(containerRuntime.isDirty, false, "Document is marked clean");
				assert.equal(
					wasMarkedDirtyRuntimeCount,
					wasMarkedCleanRuntimeCount,
					"No superfluous transition event, dirty and clean count should match when state is clean",
				);
			});

			if (!containerRuntime.isDirty) {
				// Give one count for the initial clean state
				wasMarkedCleanContainerCount += 1;
			}
			container.on("saved", () => {
				wasMarkedCleanContainerCount += 1;
				assert.equal(container.isDirty, false, "Document is marked clean");
				assert.equal(
					wasMarkedDirtyContainerCount,
					wasMarkedCleanContainerCount,
					"No superfluous transition event, dirty and clean count should match when state is clean",
				);
			});
		}

		/**
		 * Increments dirty count when the "dirty" event is fired
		 */
		function registerDirtyContainerHandler(): void {
			containerRuntime.on("dirty", () => {
				wasMarkedDirtyRuntimeCount += 1;
				assert.equal(containerRuntime.isDirty, true, "Document is marked dirty");
				assert.equal(
					wasMarkedDirtyRuntimeCount - wasMarkedCleanRuntimeCount,
					1,
					"No superfluous transition event, dirty should be only one more then clean when state is dirty",
				);
			});

			if (containerRuntime.isDirty) {
				// Give one count for the initial dirty state
				wasMarkedDirtyContainerCount += 1;
			}
			container.on("dirty", () => {
				wasMarkedDirtyContainerCount += 1;
				assert.equal(container.isDirty, true, "Document is marked dirty");
				assert.equal(
					wasMarkedDirtyContainerCount - wasMarkedCleanContainerCount,
					1,
					"No superfluous transition event, dirty should be only one more then clean when state is dirty",
				);
			});
		}

		async function createContainer(): Promise<IContainer> {
			const defaultFactory: TestFluidObjectFactory = new TestFluidObjectFactory(
				[[mapId, SharedMap.getFactory()]],
				"default",
			);

			const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
				defaultFactory,
				registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
			});

			const urlResolver = new LocalResolver();
			const codeLoader = new LocalCodeLoader([[codeDetails, runtimeFactory]]);

			const createDetachedContainerProps: ILoaderProps = {
				urlResolver,
				documentServiceFactory,
				codeLoader,
			};

			const containerUsingProps = await createAndAttachContainerUsingProps(
				{ ...createDetachedContainerProps, codeDetails },
				urlResolver.createCreateNewRequest(documentId),
			);
			loaderContainerTracker.addContainer(containerUsingProps);
			return containerUsingProps;
		}

		beforeEach(async () => {
			deltaConnectionServer = LocalDeltaConnectionServer.create();
			documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
			loaderContainerTracker = new LoaderContainerTracker();

			// Create the first container, component and DDSes.
			container = await createContainer();
			dataObject = (await container.getEntryPoint()) as ITestFluidObject;
			containerRuntime = dataObject.context.containerRuntime as IContainerRuntime;
			sharedMap = await dataObject.getSharedObject<ISharedMap>(mapId);

			// Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
			// re-sent. Do it here so that the extra events don't mess with rest of the test.
			sharedMap.set("setup", "done");

			await loaderContainerTracker.ensureSynchronized();

			wasMarkedDirtyRuntimeCount = 0;
			wasMarkedCleanRuntimeCount = 0;
			wasMarkedDirtyContainerCount = 0;
			// When we initially register for event, container fires that event to notify about current state.
			wasMarkedCleanContainerCount = -1;

			registerSavedContainerHandler();
			registerDirtyContainerHandler();
		});

		afterEach(() => {
			loaderContainerTracker.reset();
		});

		function checkDirtyState(
			when: string,
			expectedDirty: boolean,
			expectedCleanCount: number,
		) {
			assert.equal(
				containerRuntime.isDirty,
				expectedDirty,
				`Runtime dirty state not expected ${when}`,
			);
			assert.equal(
				wasMarkedCleanRuntimeCount,
				expectedCleanCount,
				`Runtime clean transition count not expected ${when}`,
			);
			assert.equal(
				container.isDirty,
				expectedDirty,
				`Container dirty state not expected ${when}`,
			);
			assert.equal(
				wasMarkedCleanContainerCount,
				expectedCleanCount,
				`Container clean transition count not expected ${when}`,
			);

			// no need to assert about wasMarkedDirtyRuntimeCount & wasMarkedDirtyContainerCount,
			// because we already assert that in the handler.
		}

		describe("Connected state", () => {
			it("marks state as dirty when ops are sent and clean when acks are received", async () => {
				checkDirtyState("before attach", false, 0);

				sharedMap.set("key", "value");

				checkDirtyState("after value set", true, 0);

				// Wait for the ops to get processed which should mark the document clean after processing
				await loaderContainerTracker.ensureSynchronized();

				// Document will have been marked clean on reconnection

				checkDirtyState("after processing value set", false, 1);
			});

			it("marks state as dirty when batch ops are sent and clean when acks are received", async () => {
				dataObject.context.containerRuntime.orderSequentially(() => {
					sharedMap.set("key1", "value1");
					sharedMap.set("key2", "value2");
				});

				checkDirtyState("after batch value set", true, 0);

				// Wait for the ops to get processed which should mark the document clean after processing
				await loaderContainerTracker.ensureSynchronized();

				checkDirtyState("after processing batch value set", false, 1);
			});

			it(`doesn't affect document state while reconnecting`, async () => {
				// Disconnect the client.
				assert(container.clientId);
				documentServiceFactory.disconnectClient(
					container.clientId,
					"Disconnected for testing",
				);

				checkDirtyState("after disconnect", false, 0);

				// Wait for the Container to get reconnected.
				await waitForContainerReconnection(container);

				// Document will have been marked clean on reconnection
				checkDirtyState("after reconnect", false, 0);
			});
		});

		describe("Disconnected state", () => {
			it(`sets operations when disconnected and then reconnects to process them`, async () => {
				// Disconnect the client.
				assert(container.clientId);
				documentServiceFactory.disconnectClient(
					container.clientId,
					"Disconnected for testing",
				);

				// Set values in DDSes in disconnected state.
				sharedMap.set("key", "value");

				// Document should have been marked dirty again due to pending DDS ops
				checkDirtyState("after value set while disconnected", true, 0);

				// Wait for the Container to get reconnected.
				await waitForContainerReconnection(container);

				// Document should still be dirty right after reconnection
				checkDirtyState("after reconnect and replayed ops", true, 0);

				await loaderContainerTracker.ensureSynchronized();

				// Document will have been marked clean after process
				checkDirtyState("after processing replayed ops", false, 1);
			});

			it(`sets ops while connected, but disconnects before sending ops, then reconnects to process them`, async () => {
				// Set values in DDSes in disconnected state.
				sharedMap.set("key", "value");

				checkDirtyState("after value set", true, 0);

				// Disconnect the client.
				assert(container.clientId);
				documentServiceFactory.disconnectClient(
					container.clientId,
					"Disconnected for testing",
				);

				// State not affect after disconnect
				checkDirtyState("after disconnect with value set", true, 0);

				// Wait for the Container to get reconnected.
				await waitForContainerReconnection(container);

				// Document should still be dirty right after reconnection
				checkDirtyState("after reconnect and replayed ops", true, 0);

				// Wait for the ops to get processed.
				await loaderContainerTracker.ensureSynchronized();

				// Document will have been marked clean after process
				checkDirtyState("after processing replayed ops", false, 1);
			});
		});

		describe("Disconnected state with batch operations", () => {
			it(`sets operations when disconnected and then reconnects to process them`, async () => {
				// Disconnect the client.
				assert(container.clientId);
				documentServiceFactory.disconnectClient(
					container.clientId,
					"Disconnected for testing",
				);

				// Set batch values in DDSes in disconnected state.
				dataObject.context.containerRuntime.orderSequentially(() => {
					sharedMap.set("key1", "value1");
					sharedMap.set("key2", "value2");
				});

				checkDirtyState("after batch value set", true, 0);

				// Wait for the Container to get reconnected.
				await waitForContainerReconnection(container);

				// Document should still be dirty right after reconnection
				checkDirtyState("after reconnect and replayed ops", true, 0);

				// Wait for the ops to get processed.
				await loaderContainerTracker.ensureSynchronized();

				// Document will have been marked clean after process
				checkDirtyState("after processing replayed ops", false, 1);
			});

			it(`sets ops while connected, but disconnects before sending ops, then reconnects to process them`, async () => {
				assert(container.clientId);

				// Set batch values in DDSes in connected state.
				dataObject.context.containerRuntime.orderSequentially(() => {
					sharedMap.set("key1", "value1");
					sharedMap.set("key2", "value2");
				});

				checkDirtyState("after batch value set", true, 0);

				// Disconnect the client.
				documentServiceFactory.disconnectClient(
					container.clientId,
					"Disconnected for testing",
				);

				// State not affect after disconnect
				checkDirtyState("after disconnect with value set", true, 0);

				// Wait for the Container to get reconnected.
				await waitForContainerReconnection(container);

				// Document should still be dirty right after reconnection
				checkDirtyState("after reconnect and replayed ops", true, 0);

				// Wait for the ops to get processed.
				await loaderContainerTracker.ensureSynchronized();

				// Document will have been marked clean after process
				checkDirtyState("after processing replayed ops", false, 1);
			});
		});

		describe("Force readonly", () => {
			it(`sets operations when force readonly and then turn off force readonly to process them`, async () => {
				container.forceReadonly?.(true);
				await waitForContainerConnection(container);

				// Set values in DDSes in force read only state.
				sharedMap.set("key", "value");

				await loaderContainerTracker.ensureSynchronized();

				// Document should have been marked dirty again due to pending DDS ops
				checkDirtyState("after value set while force readonly", true, 0);

				container.forceReadonly?.(false);
				assert(
					container.connectionState === ConnectionState.Connected,
					"Setting readonly to false should not cause disconnection",
				);

				// Document should still be dirty right after turning off force readonly
				checkDirtyState("after clear readonly and replayed ops", true, 0);

				await loaderContainerTracker.ensureSynchronized();

				// Document will have been marked clean after process
				checkDirtyState("after processing replayed ops", false, 1);
			});

			it(`sets ops then force readonly before sending ops, then turn off force readonly to process them`, async () => {
				// Set values in DDSes in write mode
				sharedMap.set("key", "value");

				checkDirtyState("after value set", true, 0);

				// force readonly
				container.forceReadonly?.(true);
				await waitForContainerConnection(container);

				await loaderContainerTracker.ensureSynchronized();

				// Document should have been marked dirty again due to pending DDS ops
				checkDirtyState("after value set while force readonly", true, 0);

				container.forceReadonly?.(false);
				assert(
					container.connectionState === ConnectionState.Connected,
					"Setting readonly to false should not cause disconnection",
				);

				// Document should still be dirty right after turning off force readonly
				checkDirtyState("after reconnect and replayed ops", true, 0);

				await loaderContainerTracker.ensureSynchronized();

				// Document will have been marked clean after process
				checkDirtyState("after processing replayed ops", false, 1);
			});
		});

		afterEach(async () => {
			await deltaConnectionServer.webSocketServer.close();
		});
	});

	describe("Detached Container", () => {
		async function createDetachedContainerForTest(): Promise<IContainer> {
			const defaultFactory: TestFluidObjectFactory = new TestFluidObjectFactory(
				[[mapId, SharedMap.getFactory()]],
				"default",
			);

			const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
				defaultFactory,
				registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
			});

			const urlResolver = new LocalResolver();
			const codeLoader = new LocalCodeLoader([[codeDetails, runtimeFactory]]);

			const loaderProps: ILoaderProps = {
				urlResolver,
				documentServiceFactory,
				codeLoader,
			};

			const containerUsingPops = await createDetachedContainer({
				...loaderProps,
				codeDetails,
			});
			loaderContainerTracker.addContainer(containerUsingPops);
			return containerUsingPops;
		}

		/**
		 * Increments clean count when the "saved" event is fired
		 */
		function registerSavedContainerHandler(): void {
			containerRuntime.on("saved", () => {
				wasMarkedCleanRuntimeCount += 1;
				assert.equal(containerRuntime.isDirty, false, "Document is marked clean");
				assert.equal(
					wasMarkedCleanRuntimeCount - wasMarkedDirtyRuntimeCount,
					1,
					"No superfluous transition event1, clean should be only one more then dirty when state is clean",
				);
			});

			if (!containerRuntime.isDirty) {
				// Give one count for the initial saved state
				wasMarkedCleanContainerCount += 1;
			}
			container.on("saved", () => {
				wasMarkedCleanContainerCount += 1;
				assert.equal(container.isDirty, false, "Document is marked clean");
				assert.equal(
					wasMarkedCleanContainerCount - wasMarkedDirtyContainerCount,
					1,
					"No superfluous transition event2, clean should be only one more then dirty when state is clean",
				);
			});
		}

		/**
		 * Increments dirty count when the "dirty" event is fired
		 */
		function registerDirtyContainerHandler(): void {
			containerRuntime.on("dirty", () => {
				wasMarkedDirtyRuntimeCount += 1;
				assert.equal(containerRuntime.isDirty, true, "Document is marked dirty");
				assert.equal(
					wasMarkedDirtyRuntimeCount,
					wasMarkedCleanRuntimeCount,
					"No superfluous transition event, dirty and clean count should match when state is dirty",
				);
			});

			if (containerRuntime.isDirty) {
				// Give one count for the initial dirty state
				wasMarkedDirtyContainerCount += 1;
			}
			container.on("dirty", () => {
				wasMarkedDirtyContainerCount += 1;
				assert.equal(container.isDirty, true, "Document is marked dirty");
				assert.equal(
					wasMarkedDirtyContainerCount,
					wasMarkedCleanContainerCount,
					"No superfluous transition event, dirty and clean count should match when state is dirty",
				);
			});
		}

		function checkDirtyState(
			when: string,
			expectedDirty: boolean,
			expectedCleanCount: number,
		) {
			assert.equal(
				containerRuntime.isDirty,
				expectedDirty,
				`Runtime dirty state not expected ${when}`,
			);
			assert.equal(
				wasMarkedCleanRuntimeCount,
				expectedCleanCount,
				`Runtime clean transition count not expected ${when}`,
			);
			assert.equal(
				container.isDirty,
				expectedDirty,
				`Container dirty state not expected ${when}`,
			);
			assert.equal(
				wasMarkedCleanContainerCount,
				expectedCleanCount,
				`Container clean transition count not expected ${when}`,
			);

			// no need to assert about wasMarkedDirtyRuntimeCount & wasMarkedDirtyContainerCount,
			// because we already assert that in the handler.
		}

		beforeEach(async () => {
			deltaConnectionServer = LocalDeltaConnectionServer.create();
			documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
			loaderContainerTracker = new LoaderContainerTracker();

			// Create the first container, component and DDSes.
			container = await createDetachedContainerForTest();
			dataObject = (await container.getEntryPoint()) as ITestFluidObject;
			containerRuntime = dataObject.context.containerRuntime as IContainerRuntime;
			sharedMap = await dataObject.getSharedObject<ISharedMap>(mapId);

			// Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
			// re-sent. Do it here so that the extra events don't mess with rest of the test.
			sharedMap.set("setup", "done");

			// await loaderContainerTracker.ensureSynchronized();

			wasMarkedDirtyRuntimeCount = 0;
			wasMarkedCleanRuntimeCount = 0;
			// When we initially register for event, container fires that event to notify about current state.
			wasMarkedDirtyContainerCount = -1;
			wasMarkedCleanContainerCount = 0;

			registerSavedContainerHandler();
			registerDirtyContainerHandler();
			return;
		});

		afterEach(() => {
			loaderContainerTracker.reset();
		});

		it("clears the dirty flag after container is attached", async () => {
			checkDirtyState("before attach", true, 0);

			const urlResolver = new LocalResolver();
			const request = urlResolver.createCreateNewRequest(documentId);
			await container.attach(request);

			// Wait for the ops to get processed which should mark the document clean after processing
			await loaderContainerTracker.ensureSynchronized();

			checkDirtyState("after attach", false, 1);
		});

		it("toggles the dirty flag on shared object update", async () => {
			const urlResolver = new LocalResolver();
			const request = urlResolver.createCreateNewRequest(documentId);
			await container.attach(request);

			// Wait for the ops to get processed which should mark the document clean after processing
			await loaderContainerTracker.ensureSynchronized();

			checkDirtyState("after attach", false, 1);

			sharedMap.set("key", "value");

			checkDirtyState("after value set", true, 1);

			// Wait for the ops to get processed which should mark the document clean after processing
			await loaderContainerTracker.ensureSynchronized();

			// Document will have been marked clean on reconnection
			checkDirtyState("after processing value set", false, 2);
		});
	});
});
