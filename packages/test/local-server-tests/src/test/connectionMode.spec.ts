/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/internal";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import { type ILoaderProps } from "@fluidframework/container-loader/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import { type ISharedMap, SharedMap } from "@fluidframework/map/internal";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	createAndAttachContainerUsingProps,
	ITestFluidObject,
	LoaderContainerTracker,
	LocalCodeLoader,
	TestFluidObjectFactory,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

describe("Logging Last Connection Mode ", () => {
	const documentId = "connectionModeTest";
	const mapId = "mapKey";
	const codeDetails: IFluidCodeDetails = {
		package: "connectionModeTestPackage",
		config: {},
	};

	let deltaConnectionServer: ILocalDeltaConnectionServer;
	let documentServiceFactory: LocalDocumentServiceFactory;
	let loaderContainerTracker: LoaderContainerTracker;
	let container: IContainer;
	let dataObject: ITestFluidObject;
	let sharedMap: ISharedMap;

	/**
	 * Waits for the "connected" event from the given container.
	 */
	async function waitForContainerReconnection(c: IContainer): Promise<void> {
		assert.notStrictEqual(c.connectionState, ConnectionState.Connected);
		return waitForContainerConnection(c);
	}

	const logger = new MockLogger();

	const getConnectedEvents = () =>
		logger.events.filter(
			(event) =>
				event.eventName === "fluid:telemetry:Container:ConnectionStateChange_Connected",
		);

	const getDisconnectedEvents = () =>
		logger.events.filter(
			(event) =>
				event.eventName === "fluid:telemetry:Container:ConnectionStateChange_Disconnected",
		);

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
			logger,
		};

		const container1 = await createAndAttachContainerUsingProps(
			{ ...createDetachedContainerProps, codeDetails },
			urlResolver.createCreateNewRequest(documentId),
		);
		loaderContainerTracker.addContainer(container1);
		return container1;
	}

	beforeEach(async () => {
		deltaConnectionServer = LocalDeltaConnectionServer.create();
		documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
		loaderContainerTracker = new LoaderContainerTracker();

		// Create the first container, component and DDSes.
		container = await createContainer();
		dataObject = (await container.getEntryPoint()) as ITestFluidObject;
		sharedMap = await dataObject.getSharedObject<ISharedMap>(mapId);

		// Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
		// re-sent. Do it here so that the extra events don't mess with rest of the test.
		sharedMap.set("setup", "done");

		await loaderContainerTracker.ensureSynchronized();
	});

	afterEach(() => {
		loaderContainerTracker.reset();
	});

	it(`Logs the correct connection mode at disconnect`, async () => {
		// Disconnect the client.
		assert(container.clientId);
		documentServiceFactory.disconnectClient(container.clientId, "Disconnected for testing");

		// Wait for the Container to get reconnected.
		await waitForContainerReconnection(container);

		sharedMap.set("testing", "value");
		await loaderContainerTracker.ensureSynchronized();

		// disconnect the Container again
		documentServiceFactory.disconnectClient(container.clientId, "Disconnected for testing");

		const connectedEvents = getConnectedEvents();
		const disconnectedEvents = getDisconnectedEvents();
		assert(connectedEvents !== undefined, "no connected events were logged");
		assert(disconnectedEvents !== undefined, "no disconnected events were logged");

		// checking telemetry has the right connection mode
		assert.strictEqual(
			connectedEvents[0].connectionMode,
			disconnectedEvents[0].connectionMode,
			"mismatch in connection mode during first disconnect",
		);
		assert.strictEqual(
			connectedEvents[1].connectionMode,
			disconnectedEvents[1].connectionMode,
			"mismatch in connection mode during second disconnect",
		);
	});
});
