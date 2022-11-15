/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { IRequest } from "@fluidframework/core-interfaces";
import {
    LocalDocumentServiceFactory,
    LocalResolver,
} from "@fluidframework/local-driver";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createAndAttachContainer,
    ITestFluidObject,
    LoaderContainerTracker,
    LocalCodeLoader,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";

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
    let container: Container;
    let dataObject: ITestFluidObject;
    let sharedMap: SharedMap;

    /**
     * Waits for the "connected" event from the given container.
     */
    async function waitForContainerReconnection(c: Container): Promise<void> {
        assert.equal(c.connected, false);
        return new Promise((resolve) => c.once("connected", () => resolve()));
    }

    const logger = new MockLogger();

    const getConnectedEvents = () => logger.events.filter((event) =>
            event.eventName === "fluid:telemetry:Container:ConnectionStateChange_Connected");

    const getDisconnectedEvents = () => logger.events.filter((event) =>
            event.eventName === "fluid:telemetry:Container:ConnectionStateChange_Disconnected");

    async function createContainer(): Promise<IContainer> {
        const factory: TestFluidObjectFactory = new TestFluidObjectFactory(
            [
                [mapId, SharedMap.getFactory()],
            ],
            "default",
        );

        const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
            runtime.IFluidHandleContext.resolveHandle(request);
        const runtimeFactory =
            new ContainerRuntimeFactoryWithDefaultDataStore(
                factory,
                [
                    [factory.type, Promise.resolve(factory)],
                ],
                undefined,
                [innerRequestHandler],
            );

        const urlResolver = new LocalResolver();
        const codeLoader = new LocalCodeLoader([[codeDetails, runtimeFactory]]);

        const loader = new Loader({
            urlResolver,
            documentServiceFactory,
            codeLoader,
            logger,
        });
        loaderContainerTracker.add(loader);

        return createAndAttachContainer(
            codeDetails, loader, urlResolver.createCreateNewRequest(documentId));
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
        loaderContainerTracker = new LoaderContainerTracker();

        // Create the first container, component and DDSes.
        container = await createContainer() as Container;
        dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
        sharedMap = await dataObject.getSharedObject<SharedMap>(mapId);

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
        assert.strictEqual(connectedEvents[0].connectionMode, disconnectedEvents[0].connectionMode,
             "mismatch in connection mode during first disconnect");
        assert.strictEqual(connectedEvents[1].connectionMode, disconnectedEvents[1].connectionMode,
            "mismatch in connection mode during second disconnect");
    });
});
