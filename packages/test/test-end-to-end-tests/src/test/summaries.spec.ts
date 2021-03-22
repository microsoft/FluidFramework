/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore, DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { assert, bufferToString, TelemetryNullLogger } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { ISummaryBlob, SummaryType } from "@fluidframework/protocol-definitions";
import { channelsTreeName } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedObjectSequence } from "@fluidframework/sequence";
import { describeNoCompat } from "@fluidframework/test-version-utils";

import {
    ITestObjectProvider,
    createAndAttachContainer,
    createDocumentId,
    createLoader,
} from "@fluidframework/test-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";

const defaultDataStoreId = "default";

class TestDataObject extends DataObject {
    public static readonly dataObjectName = "TestDataObject";
    public readonly getRoot = () => this.root;
    public readonly getRuntime = () => this.runtime;
    public readonly getContext = () => this.context;
}

async function createContainer(
    provider: ITestObjectProvider,
    runtimeOptions: Omit<IContainerRuntimeOptions, "generateSummaries">,
): Promise<IContainer> {
    const documentId = createDocumentId();
    const codeDetails: IFluidCodeDetails = {
        package: "summarizerTestPackage",
    };

    const factory = new DataObjectFactory(TestDataObject.dataObjectName, TestDataObject, [
        SharedMap.getFactory(),
        SharedDirectory.getFactory(),
        SharedMatrix.getFactory(),
        SharedObjectSequence.getFactory(),
    ], []);

    const thisRuntimeOptions: IContainerRuntimeOptions = {
        ...{ generateSummaries: false },
        ...runtimeOptions,
    };

    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        factory,
        [
            [defaultDataStoreId, Promise.resolve(factory)],
            [TestDataObject.dataObjectName, Promise.resolve(factory)],
        ],
        undefined,
        undefined,
        thisRuntimeOptions,
    );

    const loader = createLoader(
        [[codeDetails, runtimeFactory]],
        provider.documentServiceFactory,
        provider.urlResolver,
        ChildLogger.create(getTestLogger?.(), undefined, { all: { driverType: provider.driver?.type } }),
    );
    const container = await createAndAttachContainer(
        codeDetails,
        loader,
        provider.driver.createCreateNewRequest(documentId));

    provider.opProcessingController.addDeltaManagers(container.deltaManager);

    return container;
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

    it("Should generate summary tree", async () => {
        const container = await createContainer(provider, { disableIsolatedChannels: false });
        const defaultDataStore = await requestFluidObject<TestDataObject>(container, defaultDataStoreId);
        const containerRuntime = defaultDataStore.getContext().containerRuntime as ContainerRuntime;

        await provider.ensureSynchronized();

        const { gcData, stats, summary } = await containerRuntime.summarize({
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

        // Validate GC nodes
        const gcNodeIds = Object.keys(gcData.gcNodes);
        assert(gcNodeIds.includes("/"), "Expected root gc node.");
        assert(gcNodeIds.includes("/default"), "Expected default data store gc node.");
        assert(gcNodeIds.includes("/default/root"), "Expected default root DDS gc node.");
    });

    it("Should generate summary tree with isolated channels disabled", async () => {
        const container = await createContainer(provider, { disableIsolatedChannels: true });
        const defaultDataStore = await requestFluidObject<TestDataObject>(container, defaultDataStoreId);
        const containerRuntime = defaultDataStore.getContext().containerRuntime as ContainerRuntime;

        await provider.ensureSynchronized();

        const { gcData, stats, summary } = await containerRuntime.summarize({
            runGC: false,
            fullTree: false,
            trackState: false,
            summaryLogger: new TelemetryNullLogger(),
        });

        // Validate stats
        assert(stats.handleNodeCount === 0, "Expecting no handles for first summary.");
        // .component, and .attributes blobs
        assert(stats.blobNodeCount >= 2, `Stats expected at least 2 blob nodes, but had ${stats.blobNodeCount}.`);
        // root node, default data store, and default root dds
        assert(stats.treeNodeCount >= 3, `Stats expected at least 3 tree nodes, but had ${stats.treeNodeCount}.`);

        // Validate summary
        assert(!summary.unreferenced, "Root summary should be referenced.");

        assert(summary.tree[".metadata"] === undefined, "Unexpected .metadata blob in summary root.");

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

        // Validate GC nodes
        const gcNodeIds = Object.keys(gcData.gcNodes);
        assert(gcNodeIds.includes("/"), "Expected root gc node.");
        assert(gcNodeIds.includes("/default"), "Expected default data store gc node.");
        assert(gcNodeIds.includes("/default/root"), "Expected default root DDS gc node.");
    });
});
