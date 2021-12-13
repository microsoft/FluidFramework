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
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { channelsTreeName, IGarbageCollectionSummaryDetails } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat, getContainerRuntimeApi } from "@fluidframework/test-version-utils";

import { pkgVersion } from "../../packageVersion";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";
import { loadSummarizer, TestDataObject, submitAndAckSummary } from "./mockSummarizerClient";

/**
 * These tests validate the compatibility of the GC data in the summary tree across the past 2 container runtime
 * versions. A version of container runtime generates the summary and then we validate that another version can
 * read and process it successfully.
 */
describeFullCompat("GC summary compatibility tests", (getTestObjectProvider) => {
    const currentVersionNumber = 0;
    const oldVersionNumbers = [-1, -2];

    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: { disableSummaries: true },
        gcOptions: { gcAllowed: true },
    };

    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        dataObjectFactory,
        [
            [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
        ],
        undefined,
        undefined,
        runtimeOptions,
    );
    const logger = new TelemetryNullLogger();

    // Stores the latest summary uploaded to the server.
    let latestUploadedSummary: ISummaryTree | undefined;
    // Stores the latest summary context uploaded to the server.
    let latestSummaryContext: ISummaryContext | undefined;
    // Stores the latest acked summary for the document.
    let latestAckedSummary: IAckedSummary | undefined;

    let mainContainer: IContainer;
    let dataStoreA: TestDataObject;

    const createContainer = async (factory: IRuntimeFactory): Promise<IContainer> => {
        return provider.createContainer(factory);
    };

    const getNewSummarizer = async (factory: IRuntimeFactory, summaryVersion?: string) => {
        return loadSummarizer(provider, factory, mainContainer.deltaManager.lastSequenceNumber, summaryVersion);
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
        // Get container runtime APIs for the two versions.
        const containerRuntimeApi1 = getContainerRuntimeApi(pkgVersion, version1);
        const containerRuntimeApi2 = getContainerRuntimeApi(pkgVersion, version2);

        // Create container runtime factories for the two versions.
        const runtimeFactoryVersion1 = new ContainerRuntimeFactoryWithDefaultDataStore(
            dataObjectFactory,
            [
                [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
            ],
            undefined,
            undefined,
            runtimeOptions,
        );
        const runtimeFactoryVersion2 = new containerRuntimeApi2.ContainerRuntimeFactoryWithDefaultDataStore(
            dataObjectFactory,
            [
                [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
            ],
            undefined,
            undefined,
            runtimeOptions,
        );

        /**
         * Submits a summary and returns the unreferenced timestamp for all the nodes in the container. If a node is
         * referenced, the ureferenced timestamp is undefined.
         * @returns a map of nodeId to its unreferenced timestamp.
         */
        async function getUnreferencedTimestamps(
            summarizerClient: { containerRuntime: ContainerRuntime, summaryCollection: SummaryCollection },
        ) {
            const summary = await submitAndAckSummary(provider, summarizerClient, logger, true /* fullTree */);
            latestAckedSummary = summary.ackedSummary;
            assert(
                latestSummaryContext
                    && latestSummaryContext.referenceSequenceNumber >= summary.summarySequenceNumber,
                `Did not get expected summary. Expected: ${summary.summarySequenceNumber}. ` +
                `Actual: ${latestSummaryContext?.referenceSequenceNumber}.`,
            );
            assert(latestUploadedSummary !== undefined, "Did not get a summary");
            const channelsTree = (latestUploadedSummary.tree[channelsTreeName] as ISummaryTree)?.tree;

            const nodeTimestamps: Map<string, number | undefined> = new Map();
            for (const [ id, summaryObject ] of Object.entries(channelsTree)) {
                assert(
                    summaryObject.type === SummaryType.Tree,
                    `Channel summary ${id} is not a tree`,
                );
                const gcBlob = summaryObject.tree.gc;
                assert(gcBlob?.type === SummaryType.Blob, `Data store ${id} does not have GC blob`);
                const gcSummaryDetails = JSON.parse(gcBlob.content as string) as IGarbageCollectionSummaryDetails;
                nodeTimestamps.set(id, gcSummaryDetails.unrefTimestamp);
            }
            return nodeTimestamps;
        }

        /**
         * This test validates that the unreferenced timestamp in the summary generated by a container runtime can
         * be read by older / newer versions of the container runtime.
         */
        it(`runtime version ${containerRuntimeApi2.version} successfully validates unreferenced timestamp from ` +
            `summary genenrated by runtime version ${containerRuntimeApi1.version} ` , async () => {
            // Load a new summarizer client using the runtime factory version 1. This client will generate a
            // summary which will be used to load a new client using the runtime factory version 2.
            const summarizerClient1 = await getNewSummarizer(runtimeFactoryVersion1);

            // Create a new data store and mark it as referenced by storing its handle in a referenced DDS.
            const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);

            // Validate that the new data store does not have unreferenced timestamp.
            const timestamps1 = await getUnreferencedTimestamps(summarizerClient1);
            const dsBTimestamp1 = timestamps1.get(dataStoreB.id);
            assert(dsBTimestamp1 === undefined, `new data store should not have unreferenced timestamp`);

            // Mark the data store as unreferenced by deleting its handle from the DDS and validate that it now has
            // an unreferenced timestamp.
            dataStoreA._root.delete("dataStoreB");
            const timestamps2 = await getUnreferencedTimestamps(summarizerClient1);
            const dsBTimestamp2 = timestamps2.get(dataStoreB.id);
            assert(dsBTimestamp2 !== undefined, `new data store should have unreferenced timestamp`);

            // Load a new summarizer client from the summary generated by the client running version 1.
            assert(latestAckedSummary !== undefined, "Summary ack isn't available as expected");
            const summarizerClient2 =
                await getNewSummarizer(runtimeFactoryVersion2, latestAckedSummary.summaryAck.contents.handle);
            const timestamps3 = await getUnreferencedTimestamps(summarizerClient2);
            const dsBTimestamp3 = timestamps3.get(dataStoreB.id);
            assert(dsBTimestamp3 !== undefined, `new data store should still have unreferenced timestamp`);
            assert.strictEqual(dsBTimestamp3, dsBTimestamp2, "The unreferenced timestamp should not have changed");
        }).timeout(20000);
    };

    // Run the tests for combinations of new version with each older version.
    for (const oldVersion of oldVersionNumbers) {
        tests(currentVersionNumber, oldVersion);
        tests(oldVersion, currentVersionNumber);
    }
});
