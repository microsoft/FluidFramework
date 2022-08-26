/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import {
    IAckedSummary,
    IContainerRuntimeOptions,
    ISummarizer,
} from "@fluidframework/container-runtime";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, mixinSummaryHandler } from "@fluidframework/datastore";
import { SharedMatrix } from "@fluidframework/matrix";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider,
    wrapDocumentServiceFactory,
    waitForContainerConnection,
    summarizeNow,
    createSummarizerFromFactory,
} from "@fluidframework/test-utils";
import { describeNoCompat, getContainerRuntimeApi } from "@fluidframework/test-version-utils";
import { IContainerRuntimeBase, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { UndoRedoStackManager } from "@fluidframework/undo-redo";
import { SharedCounter } from "@fluidframework/counter";
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
class TestDataObject2 extends DataObject implements SearchContent {
    public async getSearchContent(): Promise<string | undefined> {
        return Promise.resolve("TestDataObject2 Search Blob");
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
        dataStore2.map.set("mapkey", "value");

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
    private readonly counterKey = "Counter";
    public matrix!: SharedMatrix;
    public undoRedoStackManager!: UndoRedoStackManager;
    public counter!: SharedCounter;

    protected async initializingFirstTime() {
        const sharedMatrix = SharedMatrix.create(this.runtime, this.matrixKey);
        this.root.set(this.matrixKey, sharedMatrix.handle);

       const counter = SharedCounter.create(this.runtime, this.counterKey);
       this.root.set(this.counterKey, counter.handle);

       const dsFactory2 = await requestFluidObject<TestDataObject2>(
       await this._context.containerRuntime.createDataStore(TestDataObjectType2), "");
       this.root.set("dsFactory2", dsFactory2.handle);
    }

    protected async hasInitialized() {
        const matrixHandle = this.root.get<IFluidHandle<SharedMatrix>>(this.matrixKey);
        assert(matrixHandle !== undefined, "SharedMatrix not found");
        this.matrix = await matrixHandle.get();

        this.undoRedoStackManager = new UndoRedoStackManager();
        this.matrix.insertRows(0, 3);
        this.matrix.insertCols(0, 3);
        this.matrix.openUndo(this.undoRedoStackManager);

        const counterHandle = this.root.get<IFluidHandle<SharedCounter>>(this.counterKey);
        assert(counterHandle);
        this.counter = await counterHandle.get();
    }
}
const dataStoreFactory1 = new DataObjectFactory(
    TestDataObjectType1,
    TestDataObject1,
    [SharedMap.getFactory(), SharedMatrix.getFactory(), SharedCounter.getFactory()],
    [],
    [],
    createDataStoreRuntime(),
);
const dataStoreFactory2 = new DataObjectFactory(
    TestDataObjectType2,
    TestDataObject2,
    [SharedMap.getFactory(), SharedMatrix.getFactory(), SharedCounter.getFactory()],
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

const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
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
        getContainerRuntimeApi(pkgVersion).ContainerRuntimeFactoryWithDefaultDataStore,
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
 * Validates whether or not a GC Tree Summary Handle should be written to the summary.
 */
describeNoCompat("Summary with Search Blobs and DataStore realization during Summarization",
 (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    // Stores the latest acked summary for the document.
    let latestAckedSummary: IAckedSummary | undefined;

    let mainContainer: IContainer;
    let mainDataStore: TestDataObject1;

    const createContainer = async (): Promise<IContainer> => {
        return provider.createContainer(runtimeFactory);
    };

    /**
     * Callback that will be called by the document storage service whenever a summary is uploaded by the client.
     * Update the summary context to include the summary proposal and ack handle as per the latest ack for the
     * document.
     */
    function uploadSummaryCb(summaryTree: ISummaryTree, context: ISummaryContext): ISummaryContext {
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

    async function waitForSummary(summarizer: ISummarizer): Promise<string> {
        // Wait for all pending ops to be processed by all clients.
        await provider.ensureSynchronized();
        const summaryResult = await summarizeNow(summarizer);
        return summaryResult.summaryVersion;
    }

    describe("Realize DataStore during Search and make sure pendingSummaries does not get corrupted", () => {
        beforeEach(async () => {
            provider = getTestObjectProvider({ syncSummarizer: true });
            // Wrap the document service factory in the driver so that the `uploadSummaryCb` function is called every
            // time the summarizer client uploads a summary.
            (provider as any)._documentServiceFactory = wrapDocumentServiceFactory(
                provider.documentServiceFactory,
                uploadSummaryCb,
            );

            mainContainer = await createContainer();
            // Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
            // re-sent. Do it here so that the extra events don't mess with rest of the test.
            mainDataStore = await requestFluidObject<TestDataObject1>(mainContainer, "default");
            mainDataStore._root.set("anytest", "anyvalue");
            await waitForContainerConnection(mainContainer);
        });

        it("No Summary Upload Error when DS gets realized between summarize and completeSummary", async () => {
            const summarizerClient = await createSummarizer(provider, mainContainer);
            await provider.ensureSynchronized();
            mainDataStore.matrix.setCell(0, 0, "value");

            // Here are the steps that would cause bug 1633 to repro:
            // Additional information: https://dev.azure.com/fluidframework/internal/_workitems/edit/1633
            // 1) Summary starts
            // 2) The summarize method from the DataStore2 (TestDataObject2) will be executed but, as it has not
            //    been realized, it has no child nodes and hasn't changed, we will use a handle instead.
            // 3) During the summarization from the other DataStore1 (TestDataObject1),
            // due to the mixinSummaryHandler (search) we explicitly realize the DataStore2 and
            // new Summarizer Nodes are added to it.
            // 4) That would (without the fix) corrupt the pendingSummaries/lastSummary from one of the child nodes.
            // 5) Next Summarization starts, the lastSummary data would be used to upload the summary and we
            //  would get an error
            // "Cannot locate node with path '.app/.channels/guid1/root' under '<handle>'."
            //  instead of .app/.channels/guid1/.channels/root

            const summaryVersion = await waitForSummary(summarizerClient);
            assert(summaryVersion, "Summary version should be defined");

            mainDataStore.matrix.setCell(0, 0, "value1");
            // The new summarization would immediately trigger bug 1633.
            const summaryVersion1 = await waitForSummary(summarizerClient);
            assert(summaryVersion1, "Summary version should be defined");

            // Make sure the next summarization succeeds.
            mainDataStore.matrix.setCell(0, 0, "value1");
            const summaryVersion2 = await waitForSummary(summarizerClient);
            assert(summaryVersion2, "Summary version should be defined");

            summarizerClient.close();

            // Just make sure new summarizer will be able to load and execute successfully.
            const summarizerClient2 = await createSummarizer(provider, mainContainer,
                summaryVersion2);

            mainDataStore.matrix.setCell(0, 0, "value2");
            const summaryVersion3 = await waitForSummary(summarizerClient2);
            assert(summaryVersion3, "Summary version should be defined");
        });

        afterEach(() => {
            latestAckedSummary = undefined;
        });
    });
});
