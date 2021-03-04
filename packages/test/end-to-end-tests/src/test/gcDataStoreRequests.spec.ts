/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { assert } from "@fluidframework/common-utils";
import { IContainer, ILoader } from "@fluidframework/container-definitions";
import { IFluidCodeDetails, IRequest } from "@fluidframework/core-interfaces";
import { LocalResolver } from "@fluidframework/local-driver";
import {
    IClientConfiguration,
    ISummaryConfiguration,
} from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createAndAttachContainer,
    createLocalLoader,
    OpProcessingController,
} from "@fluidframework/test-utils";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }

    public get _runtime() {
        return this.runtime;
    }

    public get _context() {
        return this.context;
    }
}

describe("GC Data Store Requests", () => {
    const documentId = "garbageCollection";
    const documentLoadUrl = `fluid-test://localhost/${documentId}`;
    const codeDetails: IFluidCodeDetails = {
        package: "garbageCollectionTestPackage",
        config: {},
    };
    const factory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);
    const runtimeOptions = {
        generateSummaries: true,
        enableWorker: false,
        initialSummarizerDelayMs: 10,
    };
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        factory,
        [
            [factory.type, Promise.resolve(factory)],
        ],
        undefined,
        undefined,
        runtimeOptions,
    );

    const IdleDetectionTime = 100;

    const summaryConfig: ISummaryConfiguration = {
        idleTime: IdleDetectionTime,

        maxTime: IdleDetectionTime * 12,

        // Snapshot if 1000 ops received since last snapshot.
        maxOps: 1000,

        // Wait 10 minutes for summary ack
        maxAckWaitTime: 600000,
    };
    const serviceConfig: Partial<IClientConfiguration> = {
        summary: summaryConfig,
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let urlResolver: LocalResolver;
    let opProcessingController: OpProcessingController;
    let container1: IContainer;

    async function createContainer(): Promise<IContainer> {
        const loader: ILoader = createLocalLoader([[codeDetails, runtimeFactory]], deltaConnectionServer, urlResolver);
        return createAndAttachContainer(codeDetails, loader, urlResolver.createCreateNewRequest(documentId));
    }

    async function loadContainer(): Promise<IContainer> {
        const loader: ILoader = createLocalLoader([[codeDetails, runtimeFactory]], deltaConnectionServer, urlResolver);
        return loader.resolve({ url: documentLoadUrl });
    }

    async function waitForSummary(container: IContainer): Promise<string | undefined> {
        let handle: string | undefined;
        // wait for summary ack/nack
        await new Promise((resolve, reject) => container.on("op", (op) => {
            if (op.type === "summaryAck") {
                handle = op.contents.handle;
                resolve(true);
            } else if (op.type === "summaryNack") {
                reject(new Error("summaryNack"));
            }
        }));
        return handle;
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create(undefined, serviceConfig);
        urlResolver = new LocalResolver();
        opProcessingController = new OpProcessingController(deltaConnectionServer);

        // Create a Container for the first client.
        container1 = await createContainer();
        opProcessingController.addDeltaManagers(container1.deltaManager);
    });

    it("should fail requests with errorOnUnreferencedResources for unreferenced data stores", async () => {
        const dataStore1 = await requestFluidObject<TestDataObject>(container1, "default");

        // Create a second data store (dataStore2) and add its handle to mark it as referenced.
        const dataStore2 = await factory.createInstance(dataStore1._context.containerRuntime);
        dataStore1._root.set("dataStore2", dataStore2.handle);

        // Wait for ops to be processed so that summarizer creates dataStore2.
        await opProcessingController.process();

        // Now delete the handle so that dataStore2 is marked as unreferenced.
        dataStore1._root.delete("dataStore2");

        // Wait for the summarizer to generate a summary where dataStore2 is unreferenced.
        await waitForSummary(container1);

        // Load a new container which should initialize with the summary taken above. The initial summary for
        // dataStore2 will have it marked as unreferenced.
        const container2 = await loadContainer();

        // Request dataStore2 without errorOnUnreferencedResources header and verify that we can load it.
        const request: IRequest = { url: dataStore2.id };
        let response = await container2.request(request);
        assert(
            response.status === 200 && response.mimeType === "fluid/object",
            "dataStore2 should have successfully loaded",
        );

        // Add errorOnUnreferencedResources = true to the header and verify that we are unable to load dataStore2.
        request.headers = { errorOnUnreferencedResources: true };
        response = await container2.request(request);
        assert(response.status === 404, "dataStore2 should have failed to load");
    });

    it("should succeed requests with errorOnUnreferencedResources for data stores that are re-referenced", async () => {
        const dataStore1 = await requestFluidObject<TestDataObject>(container1, "default");

        // Create a second data store (dataStore2) and add its handle to mark it as referenced.
        const dataStore2 = await factory.createInstance(dataStore1._context.containerRuntime);
        dataStore1._root.set("dataStore2", dataStore2.handle);

        // Wait for ops to be processed so that summarizer creates dataStore2.
        await opProcessingController.process();

        // Now delete the handle so that dataStore2 is marked as unreferenced.
        dataStore1._root.delete("dataStore2");

        // Wait for the summarizer to generate a summary where dataStore2 is unreferenced.
        await waitForSummary(container1);

        // Load a new container which should initialize with the summary taken above. The initial summary for
        // dataStore2 will have it marked as unreferenced.
        const container2 = await loadContainer();

        // Request dataStore2 with errorOnUnreferencedResources = true to the header and verify that we are unable to
        // load dataStore2.
        const request: IRequest = {
            url: dataStore2.id,
            headers: { errorOnUnreferencedResources: true },
        };
        let response = await container2.request(request);
        assert(response.status === 404, "dataStore2 should have failed to load");

        // Add the handle of dataStore2 to mark it as referenced again.
        dataStore1._root.set("dataStore2", dataStore2.handle);

        // Wait for the summarizer to generate a summary where dataStore2 is unreferenced.
        await waitForSummary(container1);

        // Load a new container which should initialize with the summary taken above. The initial summary for
        // dataStore2 will have it marked as referenced now.
        const container3 = await loadContainer();
        response = await container3.request(request);
        assert(response.status === 200, "dataStore2 should successfully load now");
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
