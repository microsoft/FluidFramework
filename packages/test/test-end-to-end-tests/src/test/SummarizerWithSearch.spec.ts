/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
	PureDataObject,
} from "@fluidframework/aqueduct";
import { ITelemetryLoggerExt, createChildLogger } from "@fluidframework/telemetry-utils";
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
import { FluidObject, IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { FluidDataStoreRuntime, mixinSummaryHandler } from "@fluidframework/datastore";
import { DriverHeader, ISummaryContext } from "@fluidframework/driver-definitions";
import { SharedMatrix } from "@fluidframework/matrix";
import {
	ISequencedDocumentMessage,
	ISummaryTree,
	MessageType,
} from "@fluidframework/protocol-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import {
	ITestObjectProvider,
	wrapDocumentServiceFactory,
	waitForContainerConnection,
	summarizeNow,
	createSummarizerFromFactory,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import { UndoRedoStackManager } from "@fluidframework/undo-redo";

interface ProvideSearchContent {
	SearchContent: SearchContent;
}
interface SearchContent extends ProvideSearchContent {
	getSearchContent(): Promise<string | undefined>;
}

function createDataStoreRuntime(factory: typeof FluidDataStoreRuntime = FluidDataStoreRuntime) {
	return mixinSummaryHandler(async (runtime: FluidDataStoreRuntime) => {
		const obj: PureDataObject & FluidObject<SearchContent> =
			await DataObject.getDataObject(runtime);
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
		[LoaderHeader.loadMode]: {
			opsBeforeReturn: "sequenceNumber",
		},
		[LoaderHeader.sequenceNumber]: sequenceNumber,
		[LoaderHeader.version]: summaryVersion,
	};
	const summarizerContainer = await provider.loadContainer(
		runtimeFactory,
		loaderProps,
		requestHeader,
	);
	await waitForContainerConnection(summarizerContainer);

	// Fail fast if we receive a nack as something must have gone wrong.
	const summaryCollection = new SummaryCollection(
		summarizerContainer.deltaManager,
		createChildLogger(),
	);
	summaryCollection.on("summaryNack", (op: ISummaryNackMessage) => {
		throw new Error(
			`Received Nack for sequence#: ${op.contents.summaryProposal.summarySequenceNumber}`,
		);
	});

	// entryPoint of a summarizer container is the Summarizer object
	const summarizer = await summarizerContainer.getEntryPoint();
	// The runtime prop is private to the Summarizer class
	const containerRuntime = (summarizer as any).runtime as ContainerRuntime;
	const entryPoint = await containerRuntime.getAliasedDataStoreEntryPoint("default");
	if (entryPoint === undefined) {
		throw new Error("default dataStore must exist");
	}
	return {
		containerRuntime,
		entryPoint: entryPoint.get(),
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
	summarizerClient: { containerRuntime: ContainerRuntime; summaryCollection: SummaryCollection },
	logger: ITelemetryLoggerExt,
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
	const ackedSummary =
		await summarizerClient.summaryCollection.waitSummaryAck(summarySequenceNumber);
	// Update the container runtime with the given ack. We have to do this manually because there is no summarizer
	// client in these tests that takes care of this.
	await summarizerClient.containerRuntime.refreshLatestSummaryAck({
		proposalHandle: ackedSummary.summaryOp.contents.handle,
		ackHandle: ackedSummary.summaryAck.contents.handle,
		summaryRefSeq: ackedSummary.summaryOp.referenceSequenceNumber,
		summaryLogger: logger,
	});
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

		const dataStore = await this._context.containerRuntime.createDataStore(TestDataObjectType2);
		const dsFactory2 = (await dataStore.entryPoint.get()) as TestDataObject2;
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
describeCompat("Prepare for Summary with Search Blobs", "NoCompat", (getTestObjectProvider) => {
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
		gcOptions: { gcAllowed: true },
	};
	const registryStoreEntries = new Map<string, Promise<IFluidDataStoreFactory>>([
		[dataStoreFactory1.type, Promise.resolve(dataStoreFactory1)],
		[dataStoreFactory2.type, Promise.resolve(dataStoreFactory2)],
	]);
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataStoreFactory1,
		registryEntries: registryStoreEntries,
		runtimeOptions,
	});
	const logger = createChildLogger();

	// Stores the latest summary uploaded to the server.
	let latestUploadedSummary: ISummaryTree | undefined;
	// Stores the latest summary context uploaded to the server.
	let latestSummaryContext: ISummaryContext | undefined;
	// Stores the latest acked summary for the document.
	let latestAckedSummary: IAckedSummary | undefined;

	let mainContainer: IContainer;
	let mainDataStore: TestDataObject1;
	let mainContainerRuntime: ContainerRuntime;

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
	async function waitForSummary(summarizerClient: {
		containerRuntime: ContainerRuntime;
		summaryCollection: SummaryCollection;
	}): Promise<string> {
		const summaryResult = await submitAndAckSummary(
			provider,
			summarizerClient,
			logger,
			false, // fullTree
		);
		latestAckedSummary = summaryResult.ackedSummary;
		assert(
			latestSummaryContext &&
				latestSummaryContext.referenceSequenceNumber >= summaryResult.summarySequenceNumber,
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
			mainDataStore = (await mainContainer.getEntryPoint()) as TestDataObject1;
			mainDataStore._root.set("anytest", "anyvalue");
			mainContainerRuntime = mainDataStore._context.containerRuntime as ContainerRuntime;
			await waitForContainerConnection(mainContainer);
		});

		it("Test Assert 0x1a6 should not happen - small repro", async () => {
			const summarizerClient = await getNewSummarizer();
			// Wait for all pending ops to be processed by all clients.
			await provider.ensureSynchronized();
			const summarySequenceNumber =
				summarizerClient.containerRuntime.deltaManager.lastSequenceNumber;
			// Submit a summary
			const result = await summarizerClient.containerRuntime.submitSummary({
				fullTree: false,
				refreshLatestAck: false,
				summaryLogger: logger,
				cancellationToken: neverCancelledSummaryToken,
			});
			assert(result.stage === "submit", "The summary was not submitted");
			await waitForSummaryOp(summarizerClient.containerRuntime);
			const dataStore =
				await summarizerClient.containerRuntime.createDataStore(TestDataObjectType2);
			await dataStore.entryPoint.get();
			// Wait for the above summary to be ack'd.
			const ackedSummary =
				await summarizerClient.summaryCollection.waitSummaryAck(summarySequenceNumber);
			// The assert 0x1a6 should not be hit anymore.
			await summarizerClient.containerRuntime.refreshLatestSummaryAck({
				proposalHandle: ackedSummary.summaryOp.contents.handle,
				ackHandle: ackedSummary.summaryAck.contents.handle,
				summaryRefSeq: ackedSummary.summaryOp.referenceSequenceNumber,
				summaryLogger: logger,
			});
		});

		it("Test Assert 0x1a6 should not happen with MixinSearch", async () => {
			const summarizerClient1 = await getNewSummarizer();

			const DataStoreA = await dataStoreFactory1.createInstance(
				mainDataStore._context.containerRuntime,
			);
			mainDataStore.matrix.setCell(0, 0, DataStoreA.handle);

			const summaryVersion = await waitForSummary(summarizerClient1);
			mainDataStore.matrix.setCell(0, 0, "value");

			const summarizerClient2 = await getNewSummarizer(summaryVersion);
			// Wait for all pending ops to be processed by all clients.
			await provider.ensureSynchronized();
			const summarySequenceNumber =
				summarizerClient2.containerRuntime.deltaManager.lastSequenceNumber;

			// Submit a summary
			const result = await summarizerClient2.containerRuntime.submitSummary({
				fullTree: false,
				refreshLatestAck: false,
				summaryLogger: logger,
				cancellationToken: neverCancelledSummaryToken,
			});
			assert(result.stage === "submit", "The summary was not submitted");

			await waitForSummaryOp(summarizerClient2.containerRuntime);

			const dataStore =
				await summarizerClient2.containerRuntime.createDataStore(TestDataObjectType2);
			await dataStore.entryPoint.get();

			// Wait for the above summary to be ack'd.
			const ackedSummary =
				await summarizerClient2.summaryCollection.waitSummaryAck(summarySequenceNumber);

			// The assert 0x1a6 should be hit now.
			await summarizerClient2.containerRuntime.refreshLatestSummaryAck({
				proposalHandle: ackedSummary.summaryOp.contents.handle,
				ackHandle: ackedSummary.summaryAck.contents.handle,
				summaryRefSeq: ackedSummary.summaryOp.referenceSequenceNumber,
				summaryLogger: logger,
			});
		});

		it("Data store with GC data realized after summarize", async () => {
			// Create a summarizer client.
			const { summarizer: summarizer1 } = await createSummarizerFromFactory(
				provider,
				mainContainer,
				dataStoreFactory1,
				undefined,
				undefined,
				registryStoreEntries,
			);

			// Create a second data store.
			const ds2 = await mainContainerRuntime.createDataStore(TestDataObjectType2);
			mainDataStore._root.set("dataStore2", ds2.entryPoint);

			await provider.ensureSynchronized();

			// Summarize with the above data store.
			const summary1 = await summarizeNow(summarizer1);
			summarizer1.close();

			// Create a new summarizer from the above summary.
			const summarizer2 = await getNewSummarizer(summary1.summaryVersion);

			const summarySequenceNumber =
				summarizer2.containerRuntime.deltaManager.lastSequenceNumber;
			// Submit a summary and wait for the summary op.
			const result = await summarizer2.containerRuntime.submitSummary({
				fullTree: false,
				refreshLatestAck: false,
				summaryLogger: logger,
				cancellationToken: neverCancelledSummaryToken,
			});
			assert(result.stage === "submit", "The summary was not submitted");
			await waitForSummaryOp(summarizer2.containerRuntime);

			// Before refresh is called, request the second data store in the summarizer. This will create summarizer
			// nodes for its child DDSes. The data store's summarizer node should update the pending used routes
			// of the child's summarizer node.
			const ds2MainDataStore = (await summarizer2.entryPoint) as TestDataObject1;
			const ds2MainDataStoreHandle =
				ds2MainDataStore._root.get<IFluidHandle<TestDataObject2>>("dataStore2");
			assert(
				ds2MainDataStoreHandle !== undefined,
				"Data store2 handle not present in summarizer",
			);
			await ds2MainDataStoreHandle.get();

			// Wait for the above summary to be ack'd.
			const ackedSummary =
				await summarizer2.summaryCollection.waitSummaryAck(summarySequenceNumber);
			// Refresh the summary. This should not result in any errors.
			await summarizer2.containerRuntime.refreshLatestSummaryAck({
				proposalHandle: ackedSummary.summaryOp.contents.handle,
				ackHandle: ackedSummary.summaryAck.contents.handle,
				summaryRefSeq: ackedSummary.summaryOp.referenceSequenceNumber,
				summaryLogger: logger,
			});
		});

		afterEach(() => {
			latestAckedSummary = undefined;
			latestSummaryContext = undefined;
			latestUploadedSummary = undefined;
		});
	});
});
