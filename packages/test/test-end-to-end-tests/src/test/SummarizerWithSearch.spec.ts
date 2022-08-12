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
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IContainer, IRuntimeFactory, LoaderHeader } from "@fluidframework/container-definitions";
import { ILoaderProps } from "@fluidframework/container-loader";
import {
    ContainerRuntime,
    IAckedSummary,
    IContainerRuntimeOptions,
    ISummaryNackMessage,
    neverCancelledSummaryToken,
    SummaryCollection,
} from "@fluidframework/container-runtime";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { FluidDataStoreRuntime, mixinSummaryHandler } from "@fluidframework/datastore";
import { DriverHeader, ISummaryContext } from "@fluidframework/driver-definitions";
import { SharedMatrix } from "@fluidframework/matrix";
import { ISequencedDocumentMessage, ISummaryTree, MessageType } from "@fluidframework/protocol-definitions";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { TelemetryNullLogger } from "@fluidframework/telemetry-utils";
import {
    ITestFluidObject,
    ITestObjectProvider,
    wrapDocumentServiceFactory,
    waitForContainerConnection,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { UndoRedoStackManager } from "@fluidframework/undo-redo";

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
  * Loads a summarizer client with the given version (if any) and returns its container runtime and summary collection.
  */
 async function loadSummarizer(
    provider: ITestObjectProvider,
    runtimeFactory: IRuntimeFactory,
    sequenceNumber: number,
    summaryVersion?: string,
    loaderProps?: Partial<ILoaderProps>,
) {
    const requestHeader = {
        [LoaderHeader.cache]: false,
        [LoaderHeader.clientDetails]: {
            capabilities: { interactive: true },
            type: "summarizer",
        },
        [DriverHeader.summarizingClient]: true,
        [LoaderHeader.reconnect]: false,
        [LoaderHeader.sequenceNumber]: sequenceNumber,
        [LoaderHeader.version]: summaryVersion,
    };
    const summarizerContainer = await provider.loadContainer(runtimeFactory, loaderProps, requestHeader);
    await waitForContainerConnection(summarizerContainer);

    // Fail fast if we receive a nack as something must have gone wrong.
    const summaryCollection = new SummaryCollection(summarizerContainer.deltaManager, new TelemetryNullLogger());
    summaryCollection.on("summaryNack", (op: ISummaryNackMessage) => {
        throw new Error(`Received Nack for sequence#: ${op.contents.summaryProposal.summarySequenceNumber}`);
    });

    const defaultDataStore = await requestFluidObject<ITestFluidObject>(summarizerContainer, "default");
    return {
        containerRuntime: defaultDataStore.context.containerRuntime as ContainerRuntime,
        summaryCollection,
    };
}

/**
 * Generates, uploads, submits a summary on the given container runtime and waits for the summary to be ack'd
 * by the server.
 * @returns The acked summary and the last sequence number contained in the summary that is submitted.
 */
async function submitAndAckSummary(
    provider: ITestObjectProvider,
    summarizerClient: { containerRuntime: ContainerRuntime; summaryCollection: SummaryCollection; },
    logger: ITelemetryLogger,
    fullTree: boolean = false,
    cancellationToken = neverCancelledSummaryToken,
) {
    // Wait for all pending ops to be processed by all clients.
    await provider.ensureSynchronized();
    const summarySequenceNumber = summarizerClient.containerRuntime.deltaManager.lastSequenceNumber;
    // Submit a summary
    const result = await summarizerClient.containerRuntime.submitSummary({
        fullTree,
        refreshLatestAck: false,
        summaryLogger: logger,
        cancellationToken,
    });
    assert(result.stage === "submit", "The summary was not submitted");
    // Wait for the above summary to be ack'd.
    const ackedSummary = await summarizerClient.summaryCollection.waitSummaryAck(summarySequenceNumber);
    // Update the container runtime with the given ack. We have to do this manually because there is no summarizer
    // client in these tests that takes care of this.
    await summarizerClient.containerRuntime.refreshLatestSummaryAck({
        proposalHandle: ackedSummary.summaryOp.contents.handle,
        ackHandle: ackedSummary.summaryAck.contents.handle,
        summaryRefSeq: ackedSummary.summaryOp.referenceSequenceNumber,
        summaryLogger: logger },
    );
    return { ackedSummary, summarySequenceNumber };
}

export const TestDataObjectType1 = "@fluid-example/test-dataStore1";
export const TestDataObjectType2 = "@fluid-example/test-dataStore2";
class TestDataObject2 extends DataObject {
    public get _root() {
        return this.root;
    }
    public get _context() {
        return this.context;
    }
}
class TestDataObject1 extends DataObject implements SearchContent {
    public async getSearchContent(): Promise<string | undefined> {
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

       const dsFactory2 = await requestFluidObject<TestDataObject2>(
           await this._context.containerRuntime.createDataStore(TestDataObjectType2), "");
       this.root.set("dsFactory2", dsFactory2.handle);

       const counter = SharedCounter.create(this.runtime, this.counterKey);
       this.root.set(this.counterKey, counter.handle);
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

/**
 * Validates whether or not a GC Tree Summary Handle should be written to the summary.
 */
describeNoCompat("Prepare for Summary with Search Blobs", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataStoreFactory1 = new DataObjectFactory(
        TestDataObjectType1,
        TestDataObject1,
        [SharedMatrix.getFactory(), SharedCounter.getFactory()],
        [],
        [],
        createDataStoreRuntime(),
    );
    const dataStoreFactory2 = new DataObjectFactory(
        TestDataObjectType2,
        TestDataObject2,
        [],
        [],
        [],
        createDataStoreRuntime(),
    );
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: { disableSummaries: true },
        gcOptions: { gcAllowed: false },
    };
    const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
        runtime.IFluidHandleContext.resolveHandle(request);
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        dataStoreFactory1,
        [
            [dataStoreFactory1.type, Promise.resolve(dataStoreFactory1)],
            [dataStoreFactory2.type, Promise.resolve(dataStoreFactory2)],
        ],
        undefined,
        [innerRequestHandler],
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
    let mainDataStore: TestDataObject1;

    const createContainer = async (): Promise<IContainer> => {
        return provider.createContainer(runtimeFactory);
    };

    const getNewSummarizer = async (summaryVersion?: string) => {
        return loadSummarizer(
            provider,
            runtimeFactory,
            mainContainer.deltaManager.lastSequenceNumber,
            summaryVersion,
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
     * Submits a summary and validates that the data stores with ids in `changedDataStoreIds` are resummarized. All
     * other data stores are not resummarized and a handle is sent for them in the summary.
     */
    async function waitForSummary(
        summarizerClient: { containerRuntime: ContainerRuntime; summaryCollection: SummaryCollection; },
    ): Promise<string> {
        const summaryResult = await submitAndAckSummary(provider,
            summarizerClient,
            logger,
            false, // fullTree
        );
        latestAckedSummary = summaryResult.ackedSummary;
        assert(
            latestSummaryContext && latestSummaryContext.referenceSequenceNumber >= summaryResult.summarySequenceNumber,
            `Did not get expected summary. Expected: ${summaryResult.summarySequenceNumber}. ` +
            `Actual: ${latestSummaryContext?.referenceSequenceNumber}.`,
        );
        assert(latestUploadedSummary !== undefined, "Did not get a summary");
        return latestAckedSummary.summaryAck.contents.handle;
    }

    async function waitForSummaryOp(containerRuntime: ContainerRuntime) {
        await new Promise<void>((resolve) => {
            containerRuntime.deltaManager.on("op", (op: ISequencedDocumentMessage) => {
                if (op.type === MessageType.Summarize) {
                    resolve();
                }
            });
        });
    }

    describe("Realize DataStore during Search while waiting for Summary Ack", () => {
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

        it("Test Assert 0x1a6 should not happen - small repro", async () => {
            const summarizerClient = await getNewSummarizer();
            // Wait for all pending ops to be processed by all clients.
            await provider.ensureSynchronized();
            const summarySequenceNumber = summarizerClient.containerRuntime.deltaManager.lastSequenceNumber;
            // Submit a summary
            const result = await summarizerClient.containerRuntime.submitSummary({
                fullTree: false,
                refreshLatestAck: false,
                summaryLogger: logger,
                cancellationToken: neverCancelledSummaryToken,
            });
            assert(result.stage === "submit", "The summary was not submitted");
            await waitForSummaryOp(summarizerClient.containerRuntime);
            await requestFluidObject<TestDataObject2>(
                await summarizerClient.containerRuntime.createDataStore(TestDataObjectType2), "");
            // Wait for the above summary to be ack'd.
            const ackedSummary = await summarizerClient.summaryCollection.waitSummaryAck(summarySequenceNumber);
            // The assert 0x1a6 should not be hit anymore.
            await summarizerClient.containerRuntime.refreshLatestSummaryAck({
                proposalHandle: ackedSummary.summaryOp.contents.handle,
                ackHandle: ackedSummary.summaryAck.contents.handle,
                summaryRefSeq: ackedSummary.summaryOp.referenceSequenceNumber,
                summaryLogger: logger },
            );
        });

        it("Test Assert 0x1a6 should not happen with MixinSearch", async () => {
            const summarizerClient1 = await getNewSummarizer();

            const DataStoreA = await dataStoreFactory1.createInstance(mainDataStore._context.containerRuntime);
            mainDataStore.matrix.setCell(0, 0, DataStoreA.handle);

            const summaryVersion = await waitForSummary(summarizerClient1);
            mainDataStore.matrix.setCell(0, 0, "value");

            const summarizerClient2 = await getNewSummarizer(summaryVersion);
            // Wait for all pending ops to be processed by all clients.
            await provider.ensureSynchronized();
            const summarySequenceNumber = summarizerClient2.containerRuntime.deltaManager.lastSequenceNumber;

            // Submit a summary
            const result = await summarizerClient2.containerRuntime.submitSummary({
                fullTree: false,
                refreshLatestAck: false,
                summaryLogger: logger,
                cancellationToken: neverCancelledSummaryToken,
            });
            assert(result.stage === "submit", "The summary was not submitted");

            await waitForSummaryOp(summarizerClient2.containerRuntime);

            await requestFluidObject<TestDataObject2>(
                await summarizerClient2.containerRuntime.createDataStore(TestDataObjectType2), "");

            // Wait for the above summary to be ack'd.
            const ackedSummary = await summarizerClient2.summaryCollection.waitSummaryAck(summarySequenceNumber);

            // The assert 0x1a6 should be hit now.
            await summarizerClient2.containerRuntime.refreshLatestSummaryAck({
                proposalHandle: ackedSummary.summaryOp.contents.handle,
                ackHandle: ackedSummary.summaryAck.contents.handle,
                summaryRefSeq: ackedSummary.summaryOp.referenceSequenceNumber,
                summaryLogger: logger },
            );
        });

        afterEach(() => {
            latestAckedSummary = undefined;
            latestSummaryContext = undefined;
            latestUploadedSummary = undefined;
        });
    });
});
