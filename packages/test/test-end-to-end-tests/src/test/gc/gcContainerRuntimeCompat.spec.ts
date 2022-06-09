/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore, DataObjectFactory } from "@fluidframework/aqueduct";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { IContainer, IRuntimeFactory } from "@fluidframework/container-definitions";
import {
    ContainerRuntime,
    IAckedSummary,
    IContainerRuntimeOptions,
    SummaryCollection,
} from "@fluidframework/container-runtime";
import { IRequest } from "@fluidframework/core-interfaces";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat, getContainerRuntimeApi } from "@fluidframework/test-version-utils";
import { loadSummarizer, TestDataObject, submitAndAckSummary, getGCStateFromSummary } from "../mockSummarizerClient";
import { pkgVersion } from "../../packageVersion";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";
import { mockConfigProvider } from "./mockConfigProivder";

/**
 * These tests validate the compatibility of the GC data in the summary tree across the past 2 container runtime
 * versions. A version of container runtime generates the summary and then we validate that another version can
 * read and process it successfully.
 */
// Issue #10053
describeFullCompat.skip("GC summary compatibility tests", (getTestObjectProvider) => {
    const currentVersionNumber = 0;
    const oldVersionNumbers = [-1, -2];

    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            summaryConfigOverrides: {
                state: "disabled",
            },
        },
        gcOptions: { gcAllowed: true },
    };

    const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
        runtime.IFluidHandleContext.resolveHandle(request);
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        dataObjectFactory,
        [
            [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
        ],
        undefined,
        [innerRequestHandler],
        runtimeOptions,
    );
    const logger = new TelemetryNullLogger();

    // Enable config provider setting to write GC data at the root.
    const configProvider = mockConfigProvider({});

    // Stores the latest summary uploaded to the server.
    let latestUploadedSummary: ISummaryTree | undefined;
    // Stores the latest summary context uploaded to the server.
    let latestSummaryContext: ISummaryContext | undefined;
    // Stores the latest acked summary for the document.
    let latestAckedSummary: IAckedSummary | undefined;

    let mainContainer: IContainer;
    let dataStoreA: TestDataObject;

    const createContainer = async (factory: IRuntimeFactory): Promise<IContainer> => {
        return provider.createContainer(factory, { configProvider });
    };

    const getNewSummarizer = async (factory: IRuntimeFactory, summaryVersion?: string) => {
        return loadSummarizer(
            provider,
            factory,
            mainContainer.deltaManager.lastSequenceNumber,
            summaryVersion,
            { configProvider },
        );
    };

    /**
     * Callback that will be called by the document storage service whenever a summary is uploaded by the client.
     * Update the summary context to include the summary proposal and ack handle as per the latest ack for the
     * document.
     */
    function uploadSummaryCb(summaryTree: ISummaryTree, context: ISummaryContext): ISummaryContext {
        latestUploadedSummary = summaryTree;
        latestSummaryContext = context;
        const newSummaryContext = { ...context };
        // If we received an ack for this document, update the summary context with its information. The
        // server rejects the summary if it doesn't have the proposal and ack handle of the previous
        // summary.
        if (latestAckedSummary !== undefined) {
            newSummaryContext.ackHandle = latestAckedSummary.summaryAck.contents.handle;
            newSummaryContext.proposalHandle = latestAckedSummary.summaryOp.contents.handle;
        }
        return newSummaryContext;
    }

    /**
     * Returns the container runtime factory with the given version.
     * @param version - Can be 0, -1 or -2 where 0 represents current version and -1 and -2 represent older versions.
     */
    function getContainerRuntimeFactory(version: number) {
        const containerRuntimeApi = getContainerRuntimeApi(pkgVersion, version);
        return new containerRuntimeApi.ContainerRuntimeFactoryWithDefaultDataStore(
            dataObjectFactory,
            [
                [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
            ],
            undefined,
            [innerRequestHandler],
            runtimeOptions,
        );
    }

    beforeEach(async () => {
        provider = getTestObjectProvider();
        // Wrap the document service factory in the driver so that the `uploadSummaryCb` function is called
        // every time the summarizer client uploads a summary.
        (provider as any)._documentServiceFactory = wrapDocumentServiceFactory(
            provider.documentServiceFactory,
            uploadSummaryCb,
        );

        mainContainer = await createContainer(runtimeFactory);
        dataStoreA = await requestFluidObject<TestDataObject>(mainContainer, "default");

        await provider.ensureSynchronized();
    });

    afterEach(() => {
        latestAckedSummary = undefined;
        latestSummaryContext = undefined;
        latestUploadedSummary = undefined;
        provider.reset();
    });

    // Set up the tests that will run against the different versions of the container runtime.
    const tests = (version1: number, version2: number) => {
        // Version strings to be used in tests descriptions;
        const v1Str = version1 === 0 ? `N` : `N${version1}`;
        const v2Str = version2 === 0 ? `N` : `N${version2}`;

        /**
         * Submits a summary and returns the unreferenced timestamp for all the nodes in the container. If a node is
         * referenced, the ureferenced timestamp is undefined.
         * @returns a map of nodeId to its unreferenced timestamp.
         */
        async function getUnreferencedTimestamps(
            summarizerClient: { containerRuntime: ContainerRuntime; summaryCollection: SummaryCollection; },
            blobHandleExpected?: boolean,
        ) {
            const summary = await submitAndAckSummary(provider, summarizerClient, logger);
            latestAckedSummary = summary.ackedSummary;
            assert(
                latestSummaryContext
                    && latestSummaryContext.referenceSequenceNumber >= summary.summarySequenceNumber,
                `Did not get expected summary. Expected: ${summary.summarySequenceNumber}. ` +
                `Actual: ${latestSummaryContext?.referenceSequenceNumber}.`,
            );
            assert(latestUploadedSummary !== undefined, "Did not get a summary");

            const gcState = getGCStateFromSummary(latestUploadedSummary, blobHandleExpected);
            if (blobHandleExpected === true && gcState === undefined) {
                return true;
            }

            assert(gcState !== undefined, "GC tree is not available in the summary");
            const nodeTimestamps: Map<string, number | undefined> = new Map();
            for (const [nodeId, nodeData] of Object.entries(gcState.gcNodes)) {
                nodeTimestamps.set(nodeId.slice(1), nodeData.unreferencedTimestampMs);
            }
            return nodeTimestamps;
        }

        /**
         * This test validates that the unreferenced timestamp in the summary generated by a container runtime can
         * be read by older / newer versions of the container runtime.
         */
        it(`runtime version ${v2Str} validates unreferenced timestamp from summary by version ${v1Str}`, async () => {
            // Load a new summarizer client using the runtime factory version 1. This client will generate a
            // summary which will be used to load a new client using the runtime factory version 2.
            const summarizerClient1 = await getNewSummarizer(getContainerRuntimeFactory(version1));

            // Create a new data store and mark it as referenced by storing its handle in a referenced DDS.
            const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);

            // Validate that the new data store does not have unreferenced timestamp.
            const timestamps1 = await getUnreferencedTimestamps(summarizerClient1);
            assert(timestamps1 !== true, `expected a new gc blob to be generated for first summary`);
            const dsBTimestamp1 = timestamps1.get(dataStoreB.id);
            assert(dsBTimestamp1 === undefined, `new data store should not have unreferenced timestamp`);

            // Mark the data store as unreferenced by deleting its handle from the DDS and validate that it now has
            // an unreferenced timestamp.
            dataStoreA._root.delete("dataStoreB");
            const timestamps2 = await getUnreferencedTimestamps(summarizerClient1);
            assert(timestamps2 !== true, `expected a new gc blob to be generated after deleted handle`);
            const dsBTimestamp2 = timestamps2.get(dataStoreB.id);
            assert(dsBTimestamp2 !== undefined, `new data store should have unreferenced timestamp`);

            // Load a new summarizer client from the summary generated by the client running version 1.
            assert(latestAckedSummary !== undefined, "Summary ack isn't available as expected");
            const summarizerClient2 = await getNewSummarizer(
                getContainerRuntimeFactory(version2),
                latestAckedSummary.summaryAck.contents.handle,
            );

            const timestamps3 = await getUnreferencedTimestamps(summarizerClient2, true /* blobHandleExpected */);
            if (timestamps3 !== true) {
                const dsBTimestamp3 = timestamps3.get(dataStoreB.id);
                assert(dsBTimestamp3 !== undefined, `new data store should still have unreferenced timestamp`);
                assert.strictEqual(dsBTimestamp3, dsBTimestamp2, "The unreferenced timestamp should not have changed");
            } else {
                assert(timestamps3 === true, "Expected nothing had changed for the GC blob in the summary");
            }
        }).timeout(20000);
    };

    // Run the tests for combinations of new version with each older version.
    for (const oldVersion of oldVersionNumbers) {
        tests(currentVersionNumber, oldVersion);
        tests(oldVersion, currentVersionNumber);
    }
});
