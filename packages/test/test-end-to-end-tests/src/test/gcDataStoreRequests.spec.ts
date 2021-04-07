/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { ISharedDirectory } from "@fluidframework/map";
import { ISequencedDocumentMessage, ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IAckedSummary, IContainerRuntimeOptions, SummaryCollection } from "@fluidframework/container-runtime";
import { flattenRuntimeOptions } from "./flattenRuntimeOptions";

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

// REVIEW: enable compat testing?
describeNoCompat("GC Data Store Requests", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const factory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const IdleDetectionTime = 100;
    const summaryConfigOverrides: Partial<ISummaryConfiguration> = {
        idleTime: IdleDetectionTime,
        maxTime: IdleDetectionTime * 12,
    };
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            generateSummaries: true,
            initialSummarizerDelayMs: 10,
            summaryConfigOverrides,
        },
        gcOptions: {
            gcAllowed: true,
        },
    };
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        factory,
        [
            [factory.type, Promise.resolve(factory)],
        ],
        undefined,
        undefined,
        flattenRuntimeOptions(runtimeOptions),
    );

    let mainContainer: IContainer;
    let summaryCollection: SummaryCollection;

    /**
     * Waits for a summary that contains the op with given sequence number.
     * @returns the version of this summary. This version can be used to load a Container with the summary associated
     * with it.
     */
     async function waitForSummary(sequenceNumber: number): Promise<string> {
        const ackedSummary: IAckedSummary = await summaryCollection.waitSummaryAck(sequenceNumber);
        return ackedSummary.summaryAckNack.contents.handle;
    }

    /**
     * Wait for an op with the given key in the given shared directory.
     * @returns the sequence number of this op.
     */
    async function waitForDirectoryOp(directory: ISharedDirectory, key: string): Promise<number> {
        let sequenceNumber: number | undefined;
        await new Promise((resolve) => {
            const listener = (op: ISequencedDocumentMessage) => {
                if (op.contents.key === key) {
                    sequenceNumber = op.sequenceNumber;
                    resolve(true);
                    directory.off("op", listener);
                }
            };
            directory.on("op", listener);
        });
        assert(sequenceNumber !== undefined);
        return sequenceNumber;
    }

    const createContainer = async (): Promise<IContainer> => provider.createContainer(runtimeFactory);
    const loadContainer = async (summaryVersion: string): Promise<IContainer> => {
        const requestHeader = {
            [LoaderHeader.version]: summaryVersion,
        };
        return provider.loadContainer(runtimeFactory, undefined /* options */, requestHeader);
    };

    beforeEach(async () => {
        provider = getTestObjectProvider();

        // Create a Container for the first client.
        mainContainer = await createContainer();

        // Create and setup a summary collection that will be used to track and wait for summaries.
        summaryCollection = new SummaryCollection(
            mainContainer.deltaManager.initialSequenceNumber,
            new TelemetryNullLogger(),
        );
        mainContainer.deltaManager.inbound.on("op",
            (op) => summaryCollection.handleOp(op));
    });

    it("should fail requests with externalRequest flag for unreferenced data stores", async () => {
        const directoryKey = "dataStore2";
        const dataStore1 = await requestFluidObject<TestDataObject>(mainContainer, "default");

        // Create a second data store (dataStore2) and add its handle to mark it as referenced.
        const dataStore2 = await factory.createInstance(dataStore1._context.containerRuntime);
        dataStore1._root.set(directoryKey, dataStore2.handle);

        // Wait for the set to be processed. Then wait for a summary that includes the sequence number of the above op.
        let sequenceNumber = await waitForDirectoryOp(dataStore1._root, directoryKey);
        await waitForSummary(sequenceNumber);

        // Now delete the handle so that dataStore2 is marked as unreferenced.
        dataStore1._root.delete(directoryKey);

        // Wait for the delete to be processed. Then wait for a summary that includes the sequence number of the above
        // op. Also, get this summary's version so that we can load a new container with it.
        sequenceNumber = await waitForDirectoryOp(dataStore1._root, directoryKey);
        const summaryVersion = await waitForSummary(sequenceNumber);

        // Load a new container with the version of the summary above. The initial summary for dataStore2 will
        // have it marked as unreferenced.
        const container2 = await loadContainer(summaryVersion);

        // Request dataStore2 without externalRequest header and verify that we can load it.
        const request: IRequest = { url: dataStore2.id };
        let response = await container2.request(request);
        assert(
            response.status === 200 && response.mimeType === "fluid/object",
            "dataStore2 should have successfully loaded",
        );

        // Add externalRequest = true to the header and verify that we are unable to load dataStore2.
        request.headers = { externalRequest: true };
        response = await container2.request(request);
        assert(response.status === 404, "dataStore2 should have failed to load");
    });

    it("should succeed requests with externalRequest flag for data stores that are re-referenced", async () => {
        const directoryKey = "dataStore2";
        const dataStore1 = await requestFluidObject<TestDataObject>(mainContainer, "default");

        // Create a second data store (dataStore2) and add its handle to mark it as referenced.
        const dataStore2 = await factory.createInstance(dataStore1._context.containerRuntime);
        dataStore1._root.set(directoryKey, dataStore2.handle);

        // Wait for the set to be processed. Then wait for a summary that includes the sequence number of the above op.
        let sequenceNumber = await waitForDirectoryOp(dataStore1._root, directoryKey);
        await waitForSummary(sequenceNumber);

        // Now delete the handle so that dataStore2 is marked as unreferenced.
        dataStore1._root.delete(directoryKey);

        // Wait for the delete to be processed. Then wait for a summary that includes the sequence number of the above
        // op. Also, get this summary's version so that we can load a new container with it.
        sequenceNumber = await waitForDirectoryOp(dataStore1._root, directoryKey);
        let summaryVersion = await waitForSummary(sequenceNumber);

        // Load a new container with the version of the summary above. The initial summary for dataStore2 will
        // have it marked as unreferenced.
        const container2 = await loadContainer(summaryVersion);

        // Request dataStore2 with externalRequest = true to the header and verify that we are unable to
        // load dataStore2.
        const request: IRequest = {
            url: dataStore2.id,
            headers: { externalRequest: true },
        };
        let response = await container2.request(request);
        assert(response.status === 404, "dataStore2 should have failed to load");

        // Add the handle of dataStore2 to mark it as referenced again.
        dataStore1._root.set(directoryKey, dataStore2.handle);

        // Wait for the set to be processed. Then wait for a summary that includes the sequence number of the above
        // op. Also, get this summary's version so that we can load a new container with it.
        sequenceNumber = await waitForDirectoryOp(dataStore1._root, directoryKey);
        summaryVersion = await waitForSummary(sequenceNumber);

        // Load a new container with the version of the summary above. The initial summary for dataStore2 will
        // have it marked as unreferenced.
        const container3 = await loadContainer(summaryVersion);
        response = await container3.request(request);
        assert(response.status === 200, "dataStore2 should successfully load now");
    });
});
