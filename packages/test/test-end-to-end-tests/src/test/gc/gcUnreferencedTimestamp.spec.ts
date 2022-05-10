/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore, DataObjectFactory } from "@fluidframework/aqueduct";
import { stringToBuffer, TelemetryNullLogger } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import {
    ContainerRuntime,
    IAckedSummary,
    IContainerRuntimeOptions,
    SummaryCollection,
} from "@fluidframework/container-runtime";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { SharedMap } from "@fluidframework/map";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { loadSummarizer, TestDataObject, submitAndAckSummary, getGCStateFromSummary } from "../mockSummarizerClient";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";
import { mockConfigProvider } from "./mockConfigProivder";

/**
 * Validates that the unreferenced timestamp is correctly set in the GC summary tree. Also, the timestamp is removed
 * when an unreferenced node becomes referenced again.
 */
describeFullCompat("GC unreferenced timestamp", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: { disableSummaries: true },
        gcOptions: { gcAllowed: true, writeDataAtRoot: true },
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
    const settings = { "Fluid.GarbageCollection.WriteDataAtRoot": "true" };
    const configProvider = mockConfigProvider(settings);

    // Stores the latest summary uploaded to the server.
    let latestUploadedSummary: ISummaryTree | undefined;
    // Stores the latest summary context uploaded to the server.
    let latestSummaryContext: ISummaryContext | undefined;
    // Stores the latest acked summary for the document.
    let latestAckedSummary: IAckedSummary | undefined;

    let mainContainer: IContainer;
    let dataStoreA: TestDataObject;

    const createContainer = async (): Promise<IContainer> => {
        return provider.createContainer(runtimeFactory, { configProvider });
    };

    const getNewSummarizer = async (summaryVersion?: string) => {
        return loadSummarizer(
            provider,
            runtimeFactory,
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
     * Submits a summary and returns the unreferenced timestamp for all the nodes in the container. If a node is
     * referenced, the unreferenced timestamp is undefined.
     * @returns a map of nodePath to its unreferenced timestamp.
     */
    async function getUnreferencedTimestamps(
        summarizerClient: { containerRuntime: ContainerRuntime; summaryCollection: SummaryCollection; },
    ) {
        const summaryResult = await submitAndAckSummary(provider, summarizerClient, logger, true /* fullTree */);
        latestAckedSummary = summaryResult.ackedSummary;
        assert(
            latestSummaryContext && latestSummaryContext.referenceSequenceNumber >= summaryResult.summarySequenceNumber,
            `Did not get expected summary. Expected: ${summaryResult.summarySequenceNumber}. ` +
            `Actual: ${latestSummaryContext?.referenceSequenceNumber}.`,
        );
        assert(latestUploadedSummary !== undefined, "Did not get a summary");

        const gcState = getGCStateFromSummary(latestUploadedSummary);
        assert(gcState !== undefined, "GC tree is not available in the summary");
        const nodeTimestamps: Map<string, number | undefined> = new Map();
        for (const [nodePath, nodeData] of Object.entries(gcState.gcNodes)) {
            nodeTimestamps.set(nodePath.slice(1), nodeData.unreferencedTimestampMs);
        }
        return nodeTimestamps;
    }

    beforeEach(async function() {
        provider = getTestObjectProvider();

        // These tests validate the GC state in summary generated by the container runtime. They do not care
        // about the snapshot that is downloaded from the server. So, it doesn't need to run against real services.
        if (provider.driver.type !== "local") {
            this.skip();
        }

        // Wrap the document service factory in the driver so that the `uploadSummaryCb` function is called every
        // time the summarizer client uploads a summary.
        (provider as any)._documentServiceFactory = wrapDocumentServiceFactory(
            provider.documentServiceFactory,
            uploadSummaryCb,
        );

        mainContainer = await createContainer();
        dataStoreA = await requestFluidObject<TestDataObject>(mainContainer, "default");

        await provider.ensureSynchronized();
    });

    afterEach(() => {
        latestAckedSummary = undefined;
        latestSummaryContext = undefined;
        latestUploadedSummary = undefined;
    });

    describe("unreferenced timestamp in summary", () => {
        it("adds / removes unreferenced timestamp for data stores correctly", async () => {
            const summarizerClient = await getNewSummarizer();

            // Create a new data store and mark it as referenced by storing its handle in a referenced DDS.
            const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);

            // Validate that the new data store does not have unreferenced timestamp.
            const timestamps1 = await getUnreferencedTimestamps(summarizerClient);
            const dsBTimestamp1 = timestamps1.get(dataStoreB.id);
            assert(dsBTimestamp1 === undefined, `new data store should not have unreferenced timestamp`);

            // Mark the data store as unreferenced by deleting its handle from the DDS and validate that it now has an
            // unreferenced timestamp.
            dataStoreA._root.delete("dataStoreB");
            const timestamps2 = await getUnreferencedTimestamps(summarizerClient);
            const dsBTimestamp2 = timestamps2.get(dataStoreB.id);
            assert(dsBTimestamp2 !== undefined, `data store should have unreferenced timestamp`);

            // Perform some operations and generate another summary. Validate that the data store still has the same
            // unreferenced timestamp.
            dataStoreA._root.set("key", "value");
            const timestamps3 = await getUnreferencedTimestamps(summarizerClient);
            const dsBTimestamp3 = timestamps3.get(dataStoreB.id);
            assert(dsBTimestamp3 !== undefined, `data store should still have unreferenced timestamp`);
            assert.strictEqual(dsBTimestamp2, dsBTimestamp3, "unreferenced timestamp should not have changed");

            // Mark the data store as referenced again and validate that the unreferenced timestamp is removed.
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);
            // Validate that the data store does not have unreferenced timestamp after being referenced.
            const timestamps4 = await getUnreferencedTimestamps(summarizerClient);
            const dsBTimestamp4 = timestamps4.get(dataStoreB.id);
            assert(dsBTimestamp4 === undefined, `data store should not have unreferenced timestamp anymore`);
        });

        it("adds / removes unreferenced timestamp for attachment blobs correctly", async () => {
            const summarizerClient = await getNewSummarizer();

            // Upload an attachment blob and mark it as referenced by storing its handle in a referenced DDS.
            const blob1Contents = "Blob contents 1";
            const blob1Handle = await dataStoreA._context.uploadBlob(stringToBuffer(blob1Contents, "utf-8"));
            const blob1NodePath = blob1Handle.absolutePath.slice(1);
            dataStoreA._root.set("blob1", blob1Handle);

            // Validate that the new blob does not have unreferenced timestamp.
            const timestamps1 = await getUnreferencedTimestamps(summarizerClient);
            const blob1Timestamp1 = timestamps1.get(blob1NodePath);
            assert(blob1Timestamp1 === undefined, `blob1 should not have unreferenced timestamp`);

            // Mark the blob as unreferenced by deleting its handle from the DDS and validate that it now has an
            // unreferenced timestamp.
            dataStoreA._root.delete("blob1");
            const timestamps2 = await getUnreferencedTimestamps(summarizerClient);
            const blob1Timestamp2 = timestamps2.get(blob1NodePath);
            assert(blob1Timestamp2 !== undefined, `blob1 should have unreferenced timestamp`);

            // Perform some operations and generate another summary. Validate that the blob still has the same
            // unreferenced timestamp.
            dataStoreA._root.set("key", "value");
            const timestamps3 = await getUnreferencedTimestamps(summarizerClient);
            const blob1Timestamp3 = timestamps3.get(blob1NodePath);
            assert(blob1Timestamp3 !== undefined, `blob1 should still have unreferenced timestamp`);
            assert.strictEqual(blob1Timestamp2, blob1Timestamp3, "unreferenced timestamp should not have changed");

            // Mark the blob as referenced again and validate that the unreferenced timestamp is removed.
            dataStoreA._root.set("blob1", blob1Handle);
            // Validate that the blob does not have unreferenced timestamp after being referenced.
            const timestamps4 = await getUnreferencedTimestamps(summarizerClient);
            const blob1Timestamp4 = timestamps4.get(blob1NodePath);
            assert(blob1Timestamp4 === undefined, `blob1 should not have unreferenced timestamp anymore`);
        });

        it("uses unreferenced timestamp from previous summary correctly", async () => {
            const summarizerClient1 = await getNewSummarizer();

            // Create a new data store and mark it as referenced by storing its handle in a referenced DDS.
            const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);

            // Upload an attachment blob and mark it as referenced by storing its handle in a referenced DDS.
            const blob1Contents = "Blob contents 1";
            const blob1Handle = await dataStoreA._context.uploadBlob(stringToBuffer(blob1Contents, "utf-8"));
            const blob1NodePath = blob1Handle.absolutePath.slice(1);
            dataStoreA._root.set("blob1", blob1Handle);

            // Validate that the new data store and blob do not have unreferenced timestamp.
            const timestamps1 = await getUnreferencedTimestamps(summarizerClient1);
            const dsBTimestamp1 = timestamps1.get(dataStoreB.id);
            assert(dsBTimestamp1 === undefined, `new data store should not have unreferenced timestamp`);
            const blob1Timestamp1 = timestamps1.get(blob1NodePath);
            assert(blob1Timestamp1 === undefined, `blob1 should not have unreferenced timestamp`);

            // Mark the data store and blob as unreferenced by deleting their handle from the DDS, and validate that
            // they have unreferenced timestamp.
            dataStoreA._root.delete("dataStoreB");
            dataStoreA._root.delete("blob1");
            const timestamps2 = await getUnreferencedTimestamps(summarizerClient1);
            const dsBTimestamp2 = timestamps2.get(dataStoreB.id);
            assert(dsBTimestamp2 !== undefined, `data store should have unreferenced timestamp`);
            const blob1Timestamp2 = timestamps2.get(blob1NodePath);
            assert(blob1Timestamp2 !== undefined, `blob1 should have unreferenced timestamp`);

            // Load a new summarizer from the last summary and validate that the unreferenced timestamp from the summary
            // is used for the data store and blob.
            assert(latestAckedSummary !== undefined, "Summary ack isn't available as expected");
            const summarizerClient2 = await getNewSummarizer(latestAckedSummary.summaryAck.contents.handle);
            const timestamps3 = await getUnreferencedTimestamps(summarizerClient2);
            const dsBTimestamp3 = timestamps3.get(dataStoreB.id);
            assert.strictEqual(dsBTimestamp2, dsBTimestamp3, "data store's timestamp should not have changed");
            const blob1Timestamp3 = timestamps3.get(blob1NodePath);
            assert.strictEqual(blob1Timestamp2, blob1Timestamp3, "blob1's timestamp should not have changed");
        });
    });

    /*
     * These tests validate such scenarios where nodes transition from unreferenced -> referenced -> unreferenced state
     * by verifying that their unreferenced timestamps are updated correctly.
     *
     * In these tests, V = nodes and E = edges between nodes. Root nodes that are always referenced are marked as *.
     * The nodes are data stores / DDSs represented by alphabets A, B, C and so on.
     */
    describe("References between summaries", () => {
        /*
         * Validates that we can detect references that were added and then removed.
         * 1. Summary 1 at t1. V = [A*, B]. E = []. B has unreferenced time t1.
         * 2. Op adds reference from A to B. E = [A -> B].
         * 3. Op removes reference from A to B. E = [].
         * 4. Summary 2 at t2. V = [A*, B]. E = []. B has unreferenced time t2.
         * Validates that the unreferenced time for B is t2 which is > t1.
         */
        it(`Scenario 1 - Reference added and then removed`, async () => {
            const summarizerClient = await getNewSummarizer();

            // Create data store B and mark it as referenced by storing its handle in A.
            const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);

            // Remove the reference to B which marks is as unreferenced.
            dataStoreA._root.delete("dataStoreB");

            // 1. Get summary 1 and validate that B has unreferenced timestamp. E = [].
            const timestamps1 = await getUnreferencedTimestamps(summarizerClient);
            const dsBTime1 = timestamps1.get(dataStoreB.id);
            assert(dsBTime1 !== undefined, `B should have unreferenced timestamp`);

            // 2. Add referenced from A to B. E = [A -> B].
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);

            // 3. Remove reference from A to B. E = [].
            dataStoreA._root.delete("dataStoreB");

            // 4. Get summary 2 and validate B's unreferenced timestamp updated. E = [].
            const timestamps2 = await getUnreferencedTimestamps(summarizerClient);
            const dsBTime2 = timestamps2.get(dataStoreB.id);
            assert(dsBTime2 !== undefined && dsBTime2 > dsBTime1, `B's timestamp should have updated`);
        });

        /*
         * Validates that we can detect references that were added transitively and then removed.
         * 1. Summary 1 at t1. V = [A*, B, C]. E = [B -> C]. B and C have unreferenced time t2.
         * 2. Op adds reference from A to B. E = [A -> B, B -> C].
         * 3. Op removes reference from B to C. E = [A -> B].
         * 4. Op removes reference from A to B. E = [].
         * 5. Summary 2 at t2. V = [A*, B, C]. E = []. B and C have unreferenced time t2.
         * Validates that the unreferenced time for B and C is t2 which is > t1.
         */
        it(`Scenario 2 - Reference transitively added and removed`, async () => {
            const summarizerClient = await getNewSummarizer();

            // Create data stores B and C and mark them referenced as follows by storing their handles as follows:
            // dataStoreA -> dataStoreB -> dataStoreC
            const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            const dataStoreC = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreB._root.set("dataStoreC", dataStoreC.handle);
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);

            // Remove the reference to B which marks both B and C as unreferenced.
            dataStoreA._root.delete("dataStoreB");

            // 1. Get summary 1 and validate that both B and C have unreferenced timestamps. E = [B -> C].
            const timestamps1 = await getUnreferencedTimestamps(summarizerClient);
            const dsBTime1 = timestamps1.get(dataStoreB.id);
            const dsCTime1 = timestamps1.get(dataStoreC.id);
            assert(dsBTime1 !== undefined, `B should have unreferenced timestamp`);
            assert(dsCTime1 !== undefined, `C should have unreferenced timestamp`);

            // 2. Add reference from A to B. E = [A -> B, B -> C].
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);

            // 3. Remove reference from B to C. E = [A -> B].
            dataStoreB._root.delete("dataStoreC");

            // 4. Remove reference from A to B. E = [].
            dataStoreA._root.delete("dataStoreB");

            // 5. Get summary 2 and validate that both B and C's unreferenced timestamps updated. E = [].
            const timestamps2 = await getUnreferencedTimestamps(summarizerClient);
            const dsBTime2 = timestamps2.get(dataStoreB.id);
            const dsCTime2 = timestamps2.get(dataStoreC.id);
            assert(dsBTime2 !== undefined && dsBTime2 > dsBTime1, `B's timestamp should have updated`);
            assert(dsCTime2 !== undefined && dsCTime2 > dsCTime1, `C's timestamp should have updated`);
        });

        /*
         * Validates that we can detect chain of references in which the first reference was added and then removed.
         * 1. Summary 1 at t1. V = [A*, B, C, D]. E = [B -> C, C -> D]. B, C and D have unreferenced time t2.
         * 2. Op adds reference from A to B. E = [A -> B, B -> C, C -> D].
         * 3. Op removes reference from A to B. E = [B -> C, C -> D].
         * 4. Summary 2 at t2. V = [A*, B, C, D]. E = [B -> C, C -> D]. B, C and D have unreferenced time t2.
         * Validates that the unreferenced time for B, C and D is t2 which is > t1.
         */
        it(`Scenario 3 - Reference added through chain of references and removed`, async () => {
            const summarizerClient = await getNewSummarizer();

            // Create data stores B, C and D and mark them referenced as follows by storing their handles as follows:
            // dataStoreA -> dataStoreB -> dataStoreC -> dataStoreD
            const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            const dataStoreC = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            const dataStoreD = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreB._root.set("dataStoreC", dataStoreC.handle);
            dataStoreC._root.set("dataStoreD", dataStoreD.handle);
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);

            // Remove the reference to B which marks B, C and D as unreferenced.
            dataStoreA._root.delete("dataStoreB");

            // 1. Get summary 1 and validate that B, C and D have unreferenced timestamps. E = [B -> C, C -> D].
            const timestamps1 = await getUnreferencedTimestamps(summarizerClient);
            const dsBTime1 = timestamps1.get(dataStoreB.id);
            const dsCTime1 = timestamps1.get(dataStoreC.id);
            const dsDTime1 = timestamps1.get(dataStoreD.id);
            assert(dsBTime1 !== undefined, `B should have unreferenced timestamp`);
            assert(dsCTime1 !== undefined, `C should have unreferenced timestamp`);
            assert(dsDTime1 !== undefined, `D should have unreferenced timestamp`);

            // 2. Add reference from A to B. E = [A -> B, B -> C, C -> D].
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);

            // 3. Remove reference from A to B. E = [B -> C, C -> D].
            dataStoreA._root.delete("dataStoreB");

            // 4. Get summary 2 and validate that B, C and D's unreferenced timestamps updated. E = [B -> C, C -> D].
            const timestamps2 = await getUnreferencedTimestamps(summarizerClient);
            const dsBTime2 = timestamps2.get(dataStoreB.id);
            const dsCTime2 = timestamps2.get(dataStoreC.id);
            const dsDTime2 = timestamps2.get(dataStoreD.id);
            assert(dsBTime2 !== undefined && dsBTime2 > dsBTime1, `B's timestamp should have updated`);
            assert(dsCTime2 !== undefined && dsCTime2 > dsCTime1, `C's timestamp should have updated`);
            assert(dsDTime2 !== undefined && dsDTime2 > dsDTime1, `D's timestamp should have updated`);
        });

        /*
         * Validates that we can detect references that were added and removed via new data stores.
         * 1. Summary 1 at t1. V = [A*, C]. E = []. C has unreferenced time t1.
         * 2. Data store B is created. E = [].
         * 3. Op adds reference from A to B. E = [A -> B].
         * 4. Op adds reference from B to C. E = [A -> B, B -> C].
         * 5. Op removes reference from B to C. E = [A -> B].
         * 6. Summary 2 at t2. V = [A*, B, C]. E = [A -> B]. C has unreferenced time t2.
         * Validates that the unreferenced time for C is t2 which is > t1.
         */
        it(`Scenario 4 - Reference added and removed via new nodes`, async () => {
            const summarizerClient = await getNewSummarizer();

            // Create data store C and mark it referenced by storing its handle in data store A.
            const dataStoreC = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreC", dataStoreC.handle);

            // Remove the reference to C to make it unreferenced.
            dataStoreA._root.delete("dataStoreC");

            // 1. Get summary 1 and validate that C is has unreferenced timestamp. E = [].
            const timestamps1 = await getUnreferencedTimestamps(summarizerClient);
            const dsCTime1 = timestamps1.get(dataStoreC.id);
            assert(dsCTime1 !== undefined, `C should have unreferenced timestamp`);

            // 2. Create data store B. E = [].
            const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);

            // 3. Add reference from A to B. E = [A -> B].
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);

            // 4. Add reference from B to C. E = [A -> B, B -> C].
            dataStoreB._root.set("dataStoreC", dataStoreC.handle);

            // 5. Remove reference from B to C. E = [A -> B].
            dataStoreB._root.delete("dataStoreC");

            // 6. Get summary 2 and validate that C's unreferenced timestamps updated. E = [A -> B].
            const timestamps2 = await getUnreferencedTimestamps(summarizerClient);
            const dsCTime2 = timestamps2.get(dataStoreC.id);
            assert(dsCTime2 !== undefined && dsCTime2 > dsCTime1, `C's timestamp should have updated`);
        });

        /*
         * Validates that we can detect references that were added and removed via new root data stores.
         * 1. Summary 1 at t1. V = [A*, C]. E = []. C has unreferenced time t1.
         * 2. Root data store B is created. E = [].
         * 3. Op adds reference from A to B. E = [A -> B].
         * 4. Op adds reference from B to C. E = [A -> B, B -> C].
         * 5. Op removes reference from B to C. E = [A -> B].
         * 6. Summary 2 at t2. V = [A*, B, C]. E = [A -> B]. C has unreferenced time t2.
         * Validates that the unreferenced time for C is t2 which is > t1.
         *
         * The difference from the previous tests is that the new data stores is a root data store. So, this validates
         * that we can detect new root data stores and outbound references from them.
         */
        it(`Scenario 5 - Reference added via new root nodes and removed`, async () => {
            const summarizerClient = await getNewSummarizer();

            // Create data store C and mark it referenced by storing its handle in data store A.
            const dataStoreC = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreC", dataStoreC.handle);

            // Remove the reference to C to make it unreferenced.
            dataStoreA._root.delete("dataStoreC");

            // 1. Get summary 1 and validate that C is has unreferenced timestamp. E = [].
            const timestamps1 = await getUnreferencedTimestamps(summarizerClient);
            const dsCTime1 = timestamps1.get(dataStoreC.id);
            assert(dsCTime1 !== undefined, `C should have unreferenced timestamp`);

            // 2. Create data store B. E = [].
            const dataStoreB = await dataObjectFactory.createRootInstance("dataStoreA", dataStoreA.containerRuntime);

            // 4. Add reference from B to C. E = [A -> B, B -> C].
            dataStoreB._root.set("dataStoreC", dataStoreC.handle);

            // 5. Remove reference from B to C. E = [A -> B].
            dataStoreB._root.delete("dataStoreC");

            // 6. Get summary 2 and validate that C's unreferenced timestamps updated. E = [A -> B].
            const timestamps2 = await getUnreferencedTimestamps(summarizerClient);
            const dsCTime2 = timestamps2.get(dataStoreC.id);
            assert(dsCTime2 !== undefined && dsCTime2 > dsCTime1, `C's timestamp should have updated`);
        });

        /*
         * Validates that we can detect references that were added via new data stores before they are referenced
         * themselves, and then the reference from the new data store is removed.
         * 1. Summary 1 at t1. V = [A*, C]. E = []. C has unreferenced time t1.
         * 2. Data store B is created. E = [].
         * 3. Add reference from B to C. E = [].
         * 4. Op adds reference from A to B. E = [A -> B, B -> C].
         * 5. Op removes reference from B to C. E = [A -> B].
         * 6. Summary 2 at t2. V = [A*, B, C]. E = [A -> B]. C has unreferenced time t2.
         * Validates that the unreferenced time for C is t2 which is > t1.
         *
         * The difference from previous test case is that the reference from B to C is added before B is referenced and
         * observed by summarizer. So, the summarizer does not see this reference directly but only when B is realized.
         */
        it(`Scenario 6 - Reference added via new unreferenced nodes and removed`, async () => {
            const summarizerClient = await getNewSummarizer();

            // Create data store C and mark it referenced by storing its handle in data store A.
            const dataStoreC = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreC", dataStoreC.handle);

            // Remove the reference to C to make it unreferenced.
            dataStoreA._root.delete("dataStoreC");

            // 1. Get summary 1 and validate that C is has unreferenced timestamp. E = [].
            const timestamps1 = await getUnreferencedTimestamps(summarizerClient);
            const dsCTime1 = timestamps1.get(dataStoreC.id);
            assert(dsCTime1 !== undefined, `C should have unreferenced timestamp`);

            // 2. Create data store B. E = [].
            const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);

            // 3. Add reference from B to C. E = [].
            dataStoreB._root.set("dataStoreC", dataStoreC.handle);

            // 4. Add reference from A to B. E = [A -> B, B -> C].
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);

            // 5. Remove reference from B to C. E = [A -> B].
            dataStoreB._root.delete("dataStoreC");

            // 6. Get summary 2 and validate that C's unreferenced timestamps updated. E = [A -> B].
            const timestamps2 = await getUnreferencedTimestamps(summarizerClient);
            const dsCTime2 = timestamps2.get(dataStoreC.id);
            assert(dsCTime2 !== undefined && dsCTime2 > dsCTime1, `C's timestamp should have updated`);
        });

        /*
         * Validates that we can detect references that were added transitively via new data stores before they are
         * references themselves, and then the reference from the new data store is removed.
         * 1. Summary 1 at t1. V = [A*, D]. E = []. D has unreferenced time t1.
         * 2. Data stores B and C are created. E = [].
         * 3. Add reference from B to C. E = [].
         * 4. Add reference from C to D. E = [].
         * 5. Op adds reference from A to B. E = [A -> B, B -> C, C -> D].
         * 6. Op removes reference from C to D. E = [A -> B, B -> C].
         * 7. Summary 2 at t2. V = [A*, B, C]. E = [A -> B, B -> C]. D has unreferenced time t2.
         * Validates that the unreferenced time for D is t2 which is > t1.
         *
         * This difference from the previous test case is that there is another level of indirection here that
         * references the node which was unreferenced in previous summary.
         */
        it(`Scenario 7 - Reference added transitively via new nodes and removed`, async () => {
            const summarizerClient = await getNewSummarizer();

            // Create data store D and mark it referenced by storing its handle in data store A.
            const dataStoreD = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreD", dataStoreD.handle);

            // Remove the reference to D which marks it as unreferenced.
            dataStoreA._root.delete("dataStoreD");

            // 1. Get summary 1 and validate that D is has unreferenced timestamp. E = [].
            const timestamps1 = await getUnreferencedTimestamps(summarizerClient);
            const dsDTime1 = timestamps1.get(dataStoreD.id);
            assert(dsDTime1 !== undefined, `D should have unreferenced timestamp`);

            // 2. Create data stores B and C. E = [].
            const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            const dataStoreC = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);

            // 3. Add reference from B to C. E = [].
            dataStoreB._root.set("dataStoreC", dataStoreC.handle);

            // 4. Add reference from C to D. E = [].
            dataStoreC._root.set("dataStoreD", dataStoreD.handle);

            // 5. Add reference from A to B. E = [A -> B, B -> C, C -> D].
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);

            // 6. Remove reference from C to D. E = [A -> B, B -> C].
            dataStoreC._root.delete("dataStoreD");

            // 7. Get summary 2 and validate that D's unreferenced timestamps updated. E = [A -> B, B -> C].
            const timestamps2 = await getUnreferencedTimestamps(summarizerClient);
            const dsDTime2 = timestamps2.get(dataStoreD.id);
            assert(dsDTime2 !== undefined && dsDTime2 > dsDTime1, `D's timestamp should have updated`);
        });

        /*
         * Validates that references added by unreferences nodes do not show up as references.
         * 1. Summary 1 at t1. V = [A*, B, C]. E = []. B and C have unreferenced time t1.
         * 2. Op adds reference from B to C. E = [B -> C].
         * 3. Summary 2 at t2. V = [A*, B, C]. E = [B -> C]. B and C have unreferenced time t1.
         * Validates that the unreferenced time for B and C is still t1.
         */
        it(`Scenario 8 - Reference added via unreferenced nodes`, async () => {
            const summarizerClient = await getNewSummarizer();

            // Create data stores B and C and mark them referenced.
            const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            const dataStoreC = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);
            dataStoreA._root.set("dataStoreC", dataStoreC.handle);

            // Mark B and C as unreferenced for the first summary.
            dataStoreA._root.delete("dataStoreB");
            dataStoreA._root.delete("dataStoreC");

            // 1. Get summary 1 and validate that both B and C have unreferenced timestamps. E = [].
            const timestamps1 = await getUnreferencedTimestamps(summarizerClient);
            const dsBTime1 = timestamps1.get(dataStoreB.id);
            const dsCTime1 = timestamps1.get(dataStoreC.id);
            assert(dsBTime1 !== undefined, `B should have unreferenced timestamp`);
            assert(dsCTime1 !== undefined, `C should have unreferenced timestamp`);

            // 2. Add reference from B to C. E = [B -> C].
            dataStoreB._root.set("dataStoreC", dataStoreC.handle);

            // 3. Get summary 2 and validate that both B and C's unreferenced timestamps haven't changed. E = [B -> C].
            const timestamps2 = await getUnreferencedTimestamps(summarizerClient);
            const dsBTime2 = timestamps2.get(dataStoreB.id);
            const dsCTime2 = timestamps2.get(dataStoreC.id);
            assert(dsBTime2 === dsBTime1, `B's unreferenced timestamp should be unchanged`);
            assert(dsCTime2 === dsCTime1, `C's unreferenced timestamp should be unchanged`);
        });

        /*
         * Validates that DDSs are referenced even though we don't detect their referenced between summaries. Once we
         * do GC at DDS level, this test will fail - https://github.com/microsoft/FluidFramework/issues/8470.
         * 1. Summary 1 at t1. V = [A*]. E = [].
         * 2. DDS B is created. No reference is added to it.
         * 3. Summary 2 at t2. V = [A*, B]. E = []. B is still referenced.
         */
        it(`Scenario 9 - Reference to DDS not added`, async () => {
            const summarizerClient = await getNewSummarizer();

            // 1. Get summary 1 and validate that A is referenced. E = [].
            const timestamps1 = await getUnreferencedTimestamps(summarizerClient);
            assert(timestamps1.get(dataStoreA.id) === undefined, "A should be referenced");

            // 2. Create a DDS B and don't mark it as referenced (by adding its handle in another DDS).
            const ddsB = SharedMap.create(dataStoreA.dataStoreRuntime);
            ddsB.bindToContext();

            // 3. Get summary 2 and validate that B still does not have unreferenced timestamp. E = [].
            const timestamps2 = await getUnreferencedTimestamps(summarizerClient);
            const ddsBUrl = `/${dataStoreA.id}/${ddsB.id}`;
            const ddsBTime1 = timestamps2.get(ddsBUrl.slice(1));
            assert(
                ddsBTime1 === undefined,
                `B should not have unreferenced timestamp since we do not have GC at DDS level yet`,
            );
        });
    });
});
