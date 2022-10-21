/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import {
    ContainerRuntime,
    IContainerRuntimeOptions,
    ISummarizer,
} from "@fluidframework/container-runtime";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { SharedMatrix } from "@fluidframework/matrix";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider,
    waitForContainerConnection,
    summarizeNow,
    createSummarizerFromFactory,
} from "@fluidframework/test-utils";
import { describeNoCompat, getContainerRuntimeApi } from "@fluidframework/test-version-utils";
import { IContainerRuntimeBase, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { FetchSource } from "@fluidframework/driver-definitions";
import { pkgVersion } from "../packageVersion";

// Note GC needs to be disabled.
const runtimeOptions: IContainerRuntimeOptions = {
    summaryOptions: {
        disableSummaries: true,
        summaryConfigOverrides: { state: "disabled" },
    },
    gcOptions: { gcAllowed: false },
};
export const TestDataObjectType1 = "@fluid-example/test-dataStore1";
class TestDataObject1 extends DataObject {
    public get _root() {
        return this.root;
    }

    public get _context() {
        return this.context;
    }

    private readonly matrixKey = "SharedMatrix";
    public matrix!: SharedMatrix;

    protected async initializingFirstTime() {
        const sharedMatrix = SharedMatrix.create(this.runtime, this.matrixKey);
        this.root.set(this.matrixKey, sharedMatrix.handle);

       sharedMatrix.insertRows(0, 3);
       sharedMatrix.insertCols(0, 3);
    }

    protected async hasInitialized() {
        const matrixHandle = this.root.get<IFluidHandle<SharedMatrix>>(this.matrixKey);
        assert(matrixHandle !== undefined, "SharedMatrix not found");
        this.matrix = await matrixHandle.get();
    }
}
const dataStoreFactory1 = new DataObjectFactory(
    TestDataObjectType1,
    TestDataObject1,
    [SharedMatrix.getFactory()],
    [],
    [],
);

const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
    runtime.IFluidHandleContext.resolveHandle(request);

const registryStoreEntries = new Map<string, Promise<IFluidDataStoreFactory>>([
    [dataStoreFactory1.type, Promise.resolve(dataStoreFactory1)],
    ],
);
const containerRuntimeFactoryWithDefaultDataStore =
    getContainerRuntimeApi(pkgVersion).ContainerRuntimeFactoryWithDefaultDataStore;
const runtimeFactory = new containerRuntimeFactoryWithDefaultDataStore(
    dataStoreFactory1,
    registryStoreEntries,
    undefined,
    [innerRequestHandler],
    runtimeOptions,
);

async function createSummarizer(
    provider: ITestObjectProvider,
    container: IContainer,
    summaryVersion?: string,
): Promise<ISummarizer> {
    return createSummarizerFromFactory(
        provider,
        container,
        dataStoreFactory1,
        summaryVersion,
        containerRuntimeFactoryWithDefaultDataStore,
        registryStoreEntries,
    );
}

/**
 * Validates the scenario in which we always retrieve the latest snapshot.
 */
describeNoCompat("Summarizer always uses the latest snapshot",
 (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let mainContainer: IContainer;
    let mainDataStore: TestDataObject1;

    const createContainer = async (): Promise<IContainer> => {
        return provider.createContainer(runtimeFactory);
    };

    async function waitForSummary(summarizer: ISummarizer): Promise<string> {
        // Wait for all pending ops to be processed by all clients.
        await provider.ensureSynchronized();
        const summaryResult = await summarizeNow(summarizer);
        return summaryResult.summaryVersion;
    }

    beforeEach(async () => {
        provider = getTestObjectProvider({ syncSummarizer: true });
        mainContainer = await createContainer();
        // Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
        // re-sent. Do it here so that the extra events don't mess with rest of the test.
        mainDataStore = await requestFluidObject<TestDataObject1>(mainContainer, "default");
        mainDataStore._root.set("test", "value");
        await waitForContainerConnection(mainContainer);
    });

    function getAndIncrementCellValue(sharedMatrix: SharedMatrix,
        row: number, column: number, initialValue?: string): number {
        const cellValue = sharedMatrix.getCell(row, column);
        if (!cellValue) {
           assert(initialValue, "Initial Value should be valid for the scenario");
           sharedMatrix.setCell(row, column, initialValue);
            return parseInt(initialValue, 10);
        } else {
            let newVal = parseInt(cellValue, 10);
            newVal++;
            sharedMatrix.setCell(row, column, newVal.toString());
            return newVal;
        }
    }

    const loadContainer = async (
        summaryVersion: string,
    ): Promise<IContainer> => {
        const requestHeader = {
            [LoaderHeader.version]: summaryVersion,
        };
        const container = await provider.loadContainer(runtimeFactory, undefined, requestHeader);
        return container;
    };

    it("Loading summarizer from old snapshot", async () => {
        const summarizerClient = await createSummarizer(provider, mainContainer);
        // 1.
        let value = getAndIncrementCellValue(mainDataStore.matrix, 0, 0, "1");
        assert(value === 1, "Value == 1");

        // Generate first Summary
        const summaryVersion = await waitForSummary(summarizerClient);
        assert(summaryVersion, "Summary version should be defined");

        // Do some changes
        value = getAndIncrementCellValue(mainDataStore.matrix, 0, 0);
        assert(value === 2, "Value == 2");

        // Generate second Summary
        const summaryVersion1 = await waitForSummary(summarizerClient);
        assert(summaryVersion1, "Summary version should be defined");

        // Do some changes
        value = getAndIncrementCellValue(mainDataStore.matrix, 0, 0);
        assert(value === 3, "Value == 3");

        // Generate third Summary
        const summaryVersion2 = await waitForSummary(summarizerClient);
        assert(summaryVersion2, "Summary version should be defined");

        // 4.
        value = getAndIncrementCellValue(mainDataStore.matrix, 0, 0);
        assert(value === 4, "Value == 4");

        summarizerClient.close();
        await provider.ensureSynchronized();

        const newContainer = await loadContainer(summaryVersion1);
        // Create a summarizer from the first summary.
        const summarizerClient2 = await createSummarizer(provider, newContainer,
            summaryVersion1);

        // Do some ops.
        value = getAndIncrementCellValue(mainDataStore.matrix, 0, 0);

        // Detour getVersions to make sure we fetch once after getting the Summary Ack.
        let fetchCount: number = 0;
        const containerRuntime = (summarizerClient2 as any).runtime as ContainerRuntime;
        let getVersionsFunc = containerRuntime.storage.getVersions;
        const funcSummary1 = async (versionId: string | null,
            count: number,
            scenarioName?: string,
            fetchSource?: FetchSource,
        ) => {
            getVersionsFunc = getVersionsFunc.bind(containerRuntime.storage);
            const response = await getVersionsFunc(versionId, count, scenarioName, fetchSource);
            fetchCount++;
            return response;
        };
        containerRuntime.storage.getVersions = funcSummary1;

        // Wait for the summarizer to run again.
        const summaryVersion3 = await waitForSummary(summarizerClient2);
        assert(summaryVersion3, "Summary version should be defined");
        assert(fetchCount === 1, "Single fetch should have happened once");
        const cellValue = mainDataStore.matrix.getCell(0, 0);
        assert(value === parseInt(cellValue, 10), "CellValue is as expected.");
    });
});
