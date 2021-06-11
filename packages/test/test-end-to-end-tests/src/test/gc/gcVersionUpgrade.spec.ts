/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore, DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import {
    IContainer,
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
    LoaderHeader,
} from "@fluidframework/container-definitions";
import { IAckedSummary, IContainerRuntimeOptions, SummaryCollection } from "@fluidframework/container-runtime";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import {
    ISummaryConfiguration,
    ISummaryTree,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import { channelsTreeName } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { flattenRuntimeOptions } from "../flattenRuntimeOptions";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }

    public get _context() {
        return this.context;
    }
}

/**
 * Runtime factory that increments the current GC version of the container runtime it creates. This is used to simulate
 * scenario where the GC version upgrades and we have to regenerate the GC data and summary.
 */
class ContainerRuntimeFactoryWithGC extends ContainerRuntimeFactoryWithDefaultDataStore {
    public async instantiateRuntime(
        context: IContainerContext,
    ): Promise<IRuntime> {
        const runtime = await super.instantiateRuntime(context);
        (runtime as any).currentGCVersion += 1;
        return runtime;
    }
}

// REVIEW: enable compat testing?
describeNoCompat("GC version upgrade", (getTestObjectProvider) => {
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
    const defaultRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        factory,
        [
            [factory.type, Promise.resolve(factory)],
        ],
        undefined,
        undefined,
        flattenRuntimeOptions(runtimeOptions),
    );

    let container1: IContainer;
    let defaultDataStore1: TestDataObject;
    let summaryCollection1: SummaryCollection;

    let latestUploadedSummary: ISummaryTree | undefined;
    let latestSummaryContext: ISummaryContext | undefined;

    const createContainer = async (runtimeFactory: IRuntimeFactory): Promise<IContainer> => {
        return provider.createContainer(runtimeFactory);
    };

    const loadContainer = async (summaryVersion: string, runtimeFactory: IRuntimeFactory): Promise<IContainer> => {
        const requestHeader = {
            [LoaderHeader.version]: summaryVersion,
        };
        return provider.loadContainer(runtimeFactory, undefined /* options */, requestHeader);
    };

    /**
     * Waits for a summary with the current state of the document (including all in-flight changes). It basically
     * synchronizes all containers and waits for a summary that contains the last processed sequence number.
     * @returns the version of this summary that be used to download it from the server.
     */
     async function waitForSummary(container: IContainer, summaryCollection: SummaryCollection) {
        await provider.ensureSynchronized();
        const sequenceNumber = container.deltaManager.lastSequenceNumber;
        const ackedSummary: IAckedSummary =
            await summaryCollection.waitSummaryAck(sequenceNumber);
        return {
            summaryVersion: ackedSummary.summaryAck.contents.handle,
            sequenceNumber,
        };
    }

    /**
     * Callback that will be called by the document storage service whenever a summary is uploaded by the client.
     */
    function uploadSummaryCb(summaryTree: ISummaryTree, context: ISummaryContext): void {
        latestUploadedSummary = summaryTree;
        latestSummaryContext = context;
    }

    /**
     * Validates that the data store's summary is of correct type - tree or handle.
     * The data stores ids in dataStoresAsHandles should have their summary as handles. All other
     * data stores should have their summary as tree.
     */
    function validateDataStoreSummaryState(
        summarySequenceNumber: number,
        dataStoresAsHandles: string[],
    ) {
        assert(
            latestSummaryContext && latestSummaryContext.referenceSequenceNumber >= summarySequenceNumber,
            `Did not get expected summary. Expected: ${summarySequenceNumber}. ` +
            `Actual: ${latestSummaryContext?.referenceSequenceNumber}.`,
        );
        assert(latestUploadedSummary !== undefined, "Did not get a summary");

        const dataStoreTrees =
            (latestUploadedSummary.tree[channelsTreeName] as ISummaryTree)?.tree ?? latestUploadedSummary.tree;
        for (const [key, value] of Object.entries(dataStoreTrees)) {
            if (dataStoresAsHandles.includes(key)) {
                assert(value.type === SummaryType.Handle, `The summary for data store ${key} should be a handle`);
            } else {
                assert(value.type === SummaryType.Tree, `The summary for data store ${key} should be a tree`);
            }
        }
    }

    beforeEach(async () => {
        provider = getTestObjectProvider();
        // Wrap the document service factory in the driver so that the `uploadSummaryCb` function is called every
        // time the summarizer client uploads a summary.
        (provider as any)._documentServiceFactory = wrapDocumentServiceFactory(
            provider.documentServiceFactory,
            uploadSummaryCb,
        );

        container1 = await createContainer(defaultRuntimeFactory);
        defaultDataStore1 = await requestFluidObject<TestDataObject>(container1, "default");

        // Create and setup a summary collection that will be used to track and wait for summaries.
        summaryCollection1 = new SummaryCollection(container1.deltaManager, new TelemetryNullLogger());
    });

    afterEach(() => {
        latestSummaryContext = undefined;
        latestUploadedSummary = undefined;
    });

    it("should regenerate summary and GC data when GC version updates", async () => {
        // Stores the ids of data stores whose summary tree should be handles.
        let summaryVersion: string;
        let dataStoresAsHandles: string[] = [];

        // Create couple of data stores.
        const dataStore2 = await factory.createInstance(defaultDataStore1._context.containerRuntime);
        defaultDataStore1._root.set("dataStore2", dataStore2.handle);
        const dataStore3 = await factory.createInstance(defaultDataStore1._context.containerRuntime);
        defaultDataStore1._root.set("dataStore3", dataStore3.handle);

        // Generate a summary and validate that all data store summaries are trees.
        {
            const summaryResult = await waitForSummary(container1, summaryCollection1);
            validateDataStoreSummaryState(summaryResult.sequenceNumber, dataStoresAsHandles);
        }

        // Generate another summary so that the summaries for the two data stores created above are handles.
        {
            // Make a change so that ummary is generated.
            defaultDataStore1._root.set("randomKey1", "randomValue1");
            // dataStore2 and dataStore3 did not change. So, their summaries should be handles.
            dataStoresAsHandles.push(dataStore2.id, dataStore3.id);

            const summaryResult = await waitForSummary(container1, summaryCollection1);
            validateDataStoreSummaryState(summaryResult.sequenceNumber, dataStoresAsHandles);

            // Update the summaryVersion that we will load a new container with.
            summaryVersion = summaryResult.summaryVersion;
        }

        // Create a new container (and new summarizer) with a new GC version and validate that GC and summary data is
        // regenerated. Basically, the summaries of all data stores (including unchanged ones) should now be trees.
        {
            // Close the first container so that the summarizer client is also closed.
            container1.close();

            // ContainerRuntimeFactoryWithGC will create container runtime with an incremented GC version.
            const gcRuntimeFactory = new ContainerRuntimeFactoryWithGC(
                factory,
                [
                    [factory.type, Promise.resolve(factory)],
                ],
                undefined,
                undefined,
                flattenRuntimeOptions(runtimeOptions),
            );

            // Load a new container with the summary that was generated above.
            const container2 = await loadContainer(summaryVersion, gcRuntimeFactory);
            const summaryCollection2 = new SummaryCollection(container2.deltaManager, new TelemetryNullLogger());
            const defaultDataStore2 = await requestFluidObject<TestDataObject>(container2, "default");

            // Make a change so that ummary is generated.
            defaultDataStore2._root.set("randomKey2", "randomValue2");

            // There shouldn't be any handles in the summary since we regenerate summary and GC data. Even though
            // dataStore2 and dataStore3 are unchanged, we should get summary tree for them.
            dataStoresAsHandles = [];
            const summaryResult = await waitForSummary(container2, summaryCollection2);
            validateDataStoreSummaryState(summaryResult.sequenceNumber, dataStoresAsHandles);
        }
    });
});
