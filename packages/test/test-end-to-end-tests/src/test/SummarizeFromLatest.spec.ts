/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import {
    IContainerRuntimeOptions,
    ISummarizer,
} from "@fluidframework/container-runtime";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, mixinSummaryHandler } from "@fluidframework/datastore";
import { SharedMatrix } from "@fluidframework/matrix";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider,
    waitForContainerConnection,
    summarizeNow,
    createSummarizerFromFactory,
} from "@fluidframework/test-utils";
import { describeNoCompat, getContainerRuntimeApi } from "@fluidframework/test-version-utils";
import { IContainerRuntimeBase, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { pkgVersion } from "../packageVersion";

// eslint-disable-next-line @typescript-eslint/ban-types
type ProviderPropertyKeys<T extends Object, TProp extends keyof T = keyof T> = string extends TProp
  ? never
  : number extends TProp
  ? never // exclude indexers [key:string |number]: any
  : TProp extends keyof T[TProp] // TProp is a property of T, T[TProp] and, T[TProp][TProp]
  ? TProp extends keyof T[TProp][TProp] // ex; IProvideFoo.IFoo.IFoo.IFoo
    ? TProp
    : never
  : never;

// eslint-disable-next-line @typescript-eslint/ban-types
type Provider<T extends Object = Object> = Partial<Pick<T, ProviderPropertyKeys<T>>>;
interface ProvideSearchContent {
    SearchContent: SearchContent;
  }
interface SearchContent extends ProvideSearchContent {
    getSearchContent(): Promise<string | undefined>;
  }

// Note GC needs to be disabled.
const runtimeOptions: IContainerRuntimeOptions = {
    summaryOptions: {
        disableSummaries: true,
        summaryConfigOverrides: { state: "disabled" },
    },
    gcOptions: { gcAllowed: false },
};
export const TestDataObjectType1 = "@fluid-example/test-dataStore1";
export const TestDataObjectType2 = "@fluid-example/test-dataStore2";
class TestDataObject2 extends DataObject {
    public get _root() {
        return this.root;
    }
    public get _context() {
        return this.context;
    }
    private readonly mapKey = "SharedMap";
    public map!: SharedMap;

    protected async initializingFirstTime() {
        const sharedMap = SharedMap.create(this.runtime, this.mapKey);
        this.root.set(this.mapKey, sharedMap.handle);
   }

    protected async hasInitialized() {
        const mapHandle = this.root.get<IFluidHandle<SharedMap>>(this.mapKey);
        assert(mapHandle !== undefined, "SharedMap not found");
        this.map = await mapHandle.get();
    }
}

class TestDataObject1 extends DataObject implements SearchContent {
    public async getSearchContent(): Promise<string | undefined> {
        // By this time, we are in the middle of the summarization process and
        // the DataStore should have been initialized with no child.
        // We will force it to be realized so when we invoke completeSummary on the SummarizerNode it would
        // cause bug https://dev.azure.com/fluidframework/internal/_workitems/edit/1633 to happen.
        const dataTestDataObject2Handle = this.root.get<IFluidHandle<TestDataObject2>>("dsFactory2");
        assert(dataTestDataObject2Handle, "dsFactory2 not located");
        const dataStore2 = await dataTestDataObject2Handle.get();
        if (!dataStore2.map.has("mapkey")) {
            dataStore2.map.set("mapkey", "1");
        }
        const currentValue = dataStore2.map.get("mapkey");
        let newVal = parseInt(currentValue, 10);
        newVal++;
        dataStore2.map.set("mapkey", newVal.toString());

        return Promise.resolve("TestDataObject1 Search Blob");
    }

    public get SearchContent() {
        return this;
    }

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

       const dsFactory2 = await requestFluidObject<TestDataObject2>(
       await this._context.containerRuntime.createDataStore(TestDataObjectType2), "");
       this.root.set("dsFactory2", dsFactory2.handle);

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
    [SharedMap.getFactory(), SharedMatrix.getFactory()],
    [],
    [],
    createDataStoreRuntime(),
);
const dataStoreFactory2 = new DataObjectFactory(
    TestDataObjectType2,
    TestDataObject2,
    [SharedMap.getFactory(), SharedMatrix.getFactory()],
    [],
    [],
    createDataStoreRuntime(),
);
const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
    runtime.IFluidHandleContext.resolveHandle(request);

const registryStoreEntries = new Map<string, Promise<IFluidDataStoreFactory>>([
    [dataStoreFactory1.type, Promise.resolve(dataStoreFactory1)],
    [dataStoreFactory2.type, Promise.resolve(dataStoreFactory2)],
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

function createDataStoreRuntime(factory: typeof FluidDataStoreRuntime = FluidDataStoreRuntime) {
    return mixinSummaryHandler(async (runtime: FluidDataStoreRuntime) => {
        const obj: Provider<SearchContent> = (await DataObject.getDataObject(runtime)) as Provider<SearchContent>;
        const searchObj = obj.SearchContent;
        if (searchObj === undefined) {
            return undefined;
        }
        // ODSP parser requires every search blob end with a line-feed character.
        const searchContent = await searchObj.getSearchContent();
        if (searchContent === undefined) {
            return undefined;
        }
        const content = searchContent.endsWith("\n") ? searchContent : `${searchContent}\n`;
        return {
            // This is the path in snapshot that ODSP expects search blob (in plain text) to be for components
            // that want to provide search content.
            path: ["_search", "01"],
            content,
        };
    }, factory);
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
        mainDataStore._root.set("anytest", "anyvalue");
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
    it("Summarizer always run from latest snapshot", async () => {
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

         // Create 5 data stores and add their handles to mark it as referenced.
         const dataStore2 = await dataStoreFactory1.createInstance(mainDataStore._context.containerRuntime);
         const dataStore3 = await dataStoreFactory1.createInstance(mainDataStore._context.containerRuntime);
         const dataStore4 = await dataStoreFactory1.createInstance(mainDataStore._context.containerRuntime);
         const dataStore5 = await dataStoreFactory1.createInstance(mainDataStore._context.containerRuntime);
         const dataStore6 = await dataStoreFactory1.createInstance(mainDataStore._context.containerRuntime);

         mainDataStore._root.set("dataStore2", dataStore2.handle);
         mainDataStore._root.set("dataStore3", dataStore3.handle);
         mainDataStore._root.set("dataStore4", dataStore4.handle);
         mainDataStore._root.set("dataStore5", dataStore5.handle);
         mainDataStore._root.set("dataStore6", dataStore6.handle);

        summarizerClient.close();
        await provider.ensureSynchronized();

        // Create a summarizer from the first summary.
        const summarizerClient2 = await createSummarizer(provider, mainContainer,
            summaryVersion);

        // Do some ops.
        value = getAndIncrementCellValue(mainDataStore.matrix, 0, 0);

        // Wait for the summarizer to run again.
        const summaryVersion3 = await waitForSummary(summarizerClient2);
        assert(summaryVersion3, "Summary version should be defined");

       const cellValue = mainDataStore.matrix.getCell(0, 0);
        assert(value === parseInt(cellValue, 10), "CellValue is as expected.");
    });
});
