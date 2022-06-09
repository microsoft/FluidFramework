/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import {
    gcTreeKey,
    IAckedSummary,
    IContainerRuntimeOptions,
} from "@fluidframework/container-runtime";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { ISummaryTree, SummaryObject, SummaryType } from "@fluidframework/protocol-definitions";
import { SharedMap } from "@fluidframework/map";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { TestDataObject, loadSummarizer, submitAndAckSummary } from "../mockSummarizerClient";
import { mockConfigProvider } from "./mockConfigProivder";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";

/**
 * Validates this scenario: When two DDSs in the same datastore has one change, gets summarized, and then gc is called
 * from loading a new container. We do not want to allow duplicate GC routes to be created in this scenario.
 */
describeNoCompat("GC Data Store Duplicates", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            disableSummaries: true,
        },
        gcOptions: {
            gcAllowed: true,
        },
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

    const configProvider = mockConfigProvider({});

    let mainContainer: IContainer;
    let mainDataStore: TestDataObject;
    let latestUploadedSummary: ISummaryTree | undefined;
    let latestAckedSummary: IAckedSummary | undefined;

    /**
     * Callback that will be called by the document storage service whenever a summary is uploaded by the client.
     * Update the summary context to include the summary proposal and ack handle as per the latest ack for the
     * document.
     */
    function uploadSummaryCb(summaryTree: ISummaryTree, context: ISummaryContext): ISummaryContext {
        latestUploadedSummary = summaryTree;
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

    const logger = new TelemetryNullLogger();

    async function summarizeOnNewContainerAndGetGCState(summaryVersion?: string): Promise<SummaryObject> {
        await provider.ensureSynchronized();
        const summarizerClient = await loadSummarizer(
            provider,
            runtimeFactory,
            mainContainer.deltaManager.lastSequenceNumber,
            summaryVersion,
            { configProvider },
        );
        const summaryResult = await submitAndAckSummary(provider, summarizerClient, logger, false /* fullTree */);
        latestAckedSummary = summaryResult.ackedSummary;
        assert(latestUploadedSummary !== undefined, "Did not get a summary");

        return latestUploadedSummary.tree[gcTreeKey];
    }

    const createContainer = async (): Promise<IContainer> => {
        return provider.createContainer(runtimeFactory, { configProvider });
    };

    beforeEach(async () => {
        provider = getTestObjectProvider();
        // Wrap the document service factory in the driver so that the `uploadSummaryCb` function is called every
        // time the summarizer client uploads a summary.
        (provider as any)._documentServiceFactory = wrapDocumentServiceFactory(
            provider.documentServiceFactory,
            uploadSummaryCb,
        );

        // Create a Container for the first client.
        mainContainer = await createContainer();
        mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        await provider.ensureSynchronized();
    });

    it("Back routes added by GC are removed when passed from data stores to DDSs", async () => {
        const dds = SharedMap.create(mainDataStore.dataStoreRuntime);
        mainDataStore._root.set("dds", dds.handle);

        await summarizeOnNewContainerAndGetGCState();

        // Change ds1 but not the root dds
        dds.set("change", "change1");

        assert(latestAckedSummary !== undefined, "Ack'd summary isn't available as expected");
        const gcObject = await summarizeOnNewContainerAndGetGCState(latestAckedSummary.summaryAck.contents.handle);
        assert(gcObject !== undefined, "Expected a gc blob!");
        assert(gcObject.type === SummaryType.Handle, "Expected a handle!");
        assert(gcObject.handleType === SummaryType.Tree, "Expected a gc tree handle!");
    });
});
