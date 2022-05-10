/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore, DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { assert, bufferToString, TelemetryNullLogger } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import {
    ContainerRuntime,
    Summarizer,
    ISummarizer,
    ISummarizeResults,
    ISummaryRuntimeOptions } from "@fluidframework/container-runtime";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { ISummaryBlob, SummaryType } from "@fluidframework/protocol-definitions";
import { channelsTreeName, IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedObjectSequence } from "@fluidframework/sequence";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { createLoader, ITestContainerConfig, ITestObjectProvider } from "@fluidframework/test-utils";
import { IRequest } from "@fluidframework/core-interfaces";

const defaultDataStoreId = "default";
let summarizer: ISummarizer;

class TestDataObject extends DataObject {
    public static readonly dataObjectName = "TestDataObject";
    public readonly getRoot = () => this.root;
    public readonly getRuntime = () => this.runtime;
    public readonly getContext = () => this.context;
}

const flushPromises = async () => new Promise((resolve) => process.nextTick(resolve));
const maxOps = 10;
const testContainerConfig: ITestContainerConfig = {
    runtimeOptions: {
        summaryOptions: {
            initialSummarizerDelayMs: 0,
            summaryConfigOverrides: { maxOps },
        },
    },
};

async function createContainer(
    provider: ITestObjectProvider,
    summaryOpt: ISummaryRuntimeOptions,
): Promise<IContainer> {
    const factory = new DataObjectFactory(TestDataObject.dataObjectName, TestDataObject, [
        SharedMap.getFactory(),
        SharedDirectory.getFactory(),
        SharedMatrix.getFactory(),
        SharedObjectSequence.getFactory(),
    ], []);

    // Force generateSummaries to false.
    const summaryOptions: ISummaryRuntimeOptions = { ...summaryOpt, disableSummaries: true };

    const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
        runtime.IFluidHandleContext.resolveHandle(request);

    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        factory,
        [
            [defaultDataStoreId, Promise.resolve(factory)],
            [TestDataObject.dataObjectName, Promise.resolve(factory)],
        ],
        undefined,
        [innerRequestHandler],
        { summaryOptions },
    );

    return provider.createContainer(runtimeFactory);
}

async function createSummarizer(provider: ITestObjectProvider): Promise<ISummarizer> {
    const loader = createLoader(
        [[provider.defaultCodeDetails, provider.createFluidEntryPoint(testContainerConfig)]],
        provider.documentServiceFactory,
        provider.urlResolver,
    );

    const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
    await container.attach(provider.driver.createCreateNewRequest(provider.documentId));
    const absoluteUrl = await container.getAbsoluteUrl("");
    if (absoluteUrl === undefined) {
        throw new Error("URL could not be resolved");
    }
    return Summarizer.create(loader, absoluteUrl);
}

function readBlobContent(content: ISummaryBlob["content"]): unknown {
    const json = typeof content === "string" ? content : bufferToString(content, "utf8");
    return JSON.parse(json);
}

// REVIEW: enable compat testing?
describeNoCompat("Summaries", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    beforeEach(() => {
        provider = getTestObjectProvider();
    });

    it("On demand summaries", async () => {
        summarizer = await createSummarizer(provider);

        let result: ISummarizeResults = summarizer.summarizeOnDemand({ reason: "test" });
        let negResult: ISummarizeResults | undefined = summarizer.summarizeOnDemand({ reason: "negative test" });

        let submitResult = await result.summarySubmitted;
        assert(submitResult.success, "on-demand summary should submit");
        assert(submitResult.data.stage === "submit",
            "on-demand summary submitted data stage should be submit");
        assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

        let broadcastResult = await result.summaryOpBroadcasted;
        assert(broadcastResult.success, "summary op should be broadcast");

        let ackNackResult = await result.receivedSummaryAckOrNack;
        assert(ackNackResult.success, "summary op should be acked");

        await flushPromises();

        assert((await negResult.summarySubmitted).success === false, "Should fail to submit summary");

        const seq: number = (summarizer as any).runtime.deltaManager.lastSequenceNumber;
        result = summarizer.summarizeOnDemand({ reason: "test" });
        try {
            negResult = undefined;
            negResult = summarizer.summarizeOnDemand({ reason: "negative test" });
        } catch (reason) {}
        assert(negResult === undefined, "Should not have attempted to summarize while summarizing");

        submitResult = await result.summarySubmitted;
        assert(submitResult.success, "Result should be complete on success");
        assert(submitResult.data.referenceSequenceNumber === seq, "ref seq num");
        assert(submitResult.data.stage === "submit", "Should have been submitted");
        assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

        broadcastResult = await result.summaryOpBroadcasted;
        assert(broadcastResult.success, "summary op should be broadcast");

        assert(broadcastResult.data.summarizeOp.referenceSequenceNumber === seq,
            "summarize op ref seq num should be same as summary seq");

        ackNackResult = await result.receivedSummaryAckOrNack;
        assert(ackNackResult.success, "summary op should be acked");
    });

    it("Should generate summary tree", async () => {
        const container = await createContainer(provider, { disableIsolatedChannels: false });
        const defaultDataStore = await requestFluidObject<TestDataObject>(container, defaultDataStoreId);
        const containerRuntime = defaultDataStore.getContext().containerRuntime as ContainerRuntime;

        await provider.ensureSynchronized();

        const { stats, summary } = await containerRuntime.summarize({
            runGC: false,
            fullTree: false,
            trackState: false,
            summaryLogger: new TelemetryNullLogger(),
        });

        // Validate stats
        assert(stats.handleNodeCount === 0, "Expecting no handles for first summary.");
        // .metadata, .component, and .attributes blobs
        assert(stats.blobNodeCount >= 3, `Stats expected at least 3 blob nodes, but had ${stats.blobNodeCount}.`);
        // root node, data store .channels, default data store, dds .channels, and default root dds
        assert(stats.treeNodeCount >= 5, `Stats expected at least 5 tree nodes, but had ${stats.treeNodeCount}.`);

        // Validate summary
        assert(!summary.unreferenced, "Root summary should be referenced.");

        assert(summary.tree[".metadata"]?.type === SummaryType.Blob, "Expected .metadata blob in summary root.");
        const metadata = readBlobContent(summary.tree[".metadata"].content) as Record<string, unknown>;
        assert(metadata.summaryFormatVersion === 1, "Metadata blob should have summaryFormatVersion 1");
        assert(metadata.disableIsolatedChannels === undefined, "Unexpected metadata blob disableIsolatedChannels");

        const channelsTree = summary.tree[channelsTreeName];
        assert(channelsTree?.type === SummaryType.Tree, "Expected .channels tree in summary root.");

        const defaultDataStoreNode = channelsTree.tree[defaultDataStoreId];
        assert(defaultDataStoreNode?.type === SummaryType.Tree, "Expected default data store tree in summary.");
        assert(!defaultDataStoreNode.unreferenced, "Default data store should be referenced.");
        assert(defaultDataStoreNode.tree[".component"]?.type === SummaryType.Blob,
            "Expected .component blob in default data store summary tree.");
        const dataStoreChannelsTree = defaultDataStoreNode.tree[channelsTreeName];
        const attributes = readBlobContent(defaultDataStoreNode.tree[".component"].content) as Record<string, unknown>;
        assert(attributes.snapshotFormatVersion === undefined, "Unexpected datastore attributes snapshotFormatVersion");
        assert(attributes.summaryFormatVersion === 2, "Datastore attributes summaryFormatVersion should be 2");
        assert(attributes.disableIsolatedChannels === undefined,
            "Unexpected datastore attributes disableIsolatedChannels");
        assert(dataStoreChannelsTree?.type === SummaryType.Tree, "Expected .channels tree in default data store.");

        const defaultDdsNode = dataStoreChannelsTree.tree.root;
        assert(defaultDdsNode?.type === SummaryType.Tree, "Expected default root DDS in summary.");
        assert(!defaultDdsNode.unreferenced, "Default root DDS should be referenced.");
        assert(defaultDdsNode.tree[".attributes"]?.type === SummaryType.Blob,
            "Expected .attributes blob in default root DDS summary tree.");
    });

    it("Should generate summary tree with isolated channels disabled", async () => {
        const container = await createContainer(provider, { disableIsolatedChannels: true });
        const defaultDataStore = await requestFluidObject<TestDataObject>(container, defaultDataStoreId);
        const containerRuntime = defaultDataStore.getContext().containerRuntime as ContainerRuntime;

        await provider.ensureSynchronized();

        let result: ISummarizeResults | undefined = summarizer.summarizeOnDemand({ reason: "test" });

        const submitResult = await result.summarySubmitted;
        assert(submitResult.success, "on-demand summary should submit");
        assert(submitResult.data.stage === "submit",
            "on-demand summary submitted data stage should be submit");

        assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

        const broadcastResult = await result.summaryOpBroadcasted;
        assert(broadcastResult.success, "summary op should be broadcast");

        const ackNackResult = await result.receivedSummaryAckOrNack;
        assert(ackNackResult.success, "summary should be acked");

        const { stats, summary } = await containerRuntime.summarize({
            runGC: false,
            fullTree: false,
            trackState: false,
            summaryLogger: new TelemetryNullLogger(),
        });

        summarizer.stop("summarizerClientDisconnected");
        await flushPromises();

        try {
            result = undefined;
            result = summarizer.summarizeOnDemand({ reason: "test" });
        } catch (error: any) {
            assert(error.errorType === "summarizingError", "Should throw a summarizer error");
        }
        assert(result === undefined, "Should not have attempted summary with disposed summarizer");

        // Validate stats
        assert(stats.handleNodeCount === 0, "Expecting no handles for first summary.");
        // .component, and .attributes blobs
        assert(stats.blobNodeCount >= 2, `Stats expected at least 2 blob nodes, but had ${stats.blobNodeCount}.`);
        // root node, default data store, and default root dds
        assert(stats.treeNodeCount >= 3, `Stats expected at least 3 tree nodes, but had ${stats.treeNodeCount}.`);

        // Validate summary
        assert(!summary.unreferenced, "Root summary should be referenced.");
        assert(summary.tree[channelsTreeName] === undefined, "Unexpected .channels tree in summary root.");

        const defaultDataStoreNode = summary.tree[defaultDataStoreId];
        assert(defaultDataStoreNode?.type === SummaryType.Tree, "Expected default data store tree in summary.");
        assert(!defaultDataStoreNode.unreferenced, "Default data store should be referenced.");
        assert(defaultDataStoreNode.tree[".component"]?.type === SummaryType.Blob,
            "Expected .component blob in default data store summary tree.");
        const attributes = readBlobContent(defaultDataStoreNode.tree[".component"].content) as Record<string, unknown>;
        assert(attributes.snapshotFormatVersion === "0.1", "Datastore attributes snapshotFormatVersion should be 0.1");
        assert(attributes.summaryFormatVersion === undefined, "Unexpected datastore attributes summaryFormatVersion");
        assert(attributes.disableIsolatedChannels === undefined,
            "Unexpected datastore attributes disableIsolatedChannels");
        assert(defaultDataStoreNode.tree[channelsTreeName] === undefined,
            "Unexpected .channels tree in default data store.");

        const defaultDdsNode = defaultDataStoreNode.tree.root;
        assert(defaultDdsNode?.type === SummaryType.Tree, "Expected default root DDS in summary.");
        assert(!defaultDdsNode.unreferenced, "Default root DDS should be referenced.");
        assert(defaultDdsNode.tree[".attributes"]?.type === SummaryType.Blob,
            "Expected .attributes blob in default root DDS summary tree.");
    });
});
