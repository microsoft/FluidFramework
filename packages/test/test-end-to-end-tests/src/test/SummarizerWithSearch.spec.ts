/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import {
	IContainer,
	IRuntimeFactory,
	LoaderHeader,
} from "@fluidframework/container-definitions/internal";
import { ILoaderProps } from "@fluidframework/container-loader/internal";
import {
	ContainerRuntime,
	IAckedSummary,
	ISummaryNackMessage,
	SummaryCollection,
	neverCancelledSummaryToken,
} from "@fluidframework/container-runtime/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import type { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import { ISequencedDocumentMessage, ISummaryTree } from "@fluidframework/driver-definitions";
import {
	DriverHeader,
	type IDocumentServiceFactory,
	ISummaryContext,
	MessageType,
} from "@fluidframework/driver-definitions/internal";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";
import { ITelemetryLoggerExt, createChildLogger } from "@fluidframework/telemetry-utils/internal";
import {
	ITestObjectProvider,
	createSummarizerFromFactory,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { wrapObjectAndOverride } from "../mocking.js";

/**
 * Loads a summarizer client with the given version (if any) and returns its container runtime and summary collection.
 */
async function loadSummarizer(
	provider: ITestObjectProvider,
	runtimeFactory: IRuntimeFactory,
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
	latestSummaryRefSeqNum: number,
	fullTree: boolean = false,
	cancellationToken = neverCancelledSummaryToken,
) {
	// Wait for all pending ops to be processed by all clients.
	await provider.ensureSynchronized();
	const summarySequenceNumber = summarizerClient.containerRuntime.deltaManager.lastSequenceNumber;
	// Submit a summary
	const result = await summarizerClient.containerRuntime.submitSummary({
		fullTree,
		summaryLogger: logger,
		cancellationToken,
		latestSummaryRefSeqNum,
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

/**
 * Validates whether or not a GC Tree Summary Handle should be written to the summary.
 */
describeCompat(
	"Prepare for Summary with Search Blobs",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { DataObject, DataObjectFactory, FluidDataStoreRuntime } = apis.dataRuntime;
		const { mixinSummaryHandler } = apis.dataRuntime.packages.datastore;
		const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;

		function createDataStoreRuntime(
			factory: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
		) {
			return mixinSummaryHandler(async (runtime: FluidDataStoreRuntime) => {
				await DataObject.getDataObject(runtime);
				return undefined;
			}, factory);
		}

		class TestDataObject2 extends DataObject {
			public get _root() {
				return this.root;
			}
			public get _context() {
				return this.context;
			}
		}

		class TestDataObject1 extends DataObject {
			public get _root() {
				return this.root;
			}

			public get _context() {
				return this.context;
			}

			protected async initializingFirstTime() {
				const dataStore2 =
					await this._context.containerRuntime.createDataStore(TestDataObjectType2);
				this.root.set("ds2", dataStore2.entryPoint);
			}

			protected async hasInitialized() {
				const dataStore2Handle = this.root.get<IFluidHandle<TestDataObject2>>("ds2");
				await dataStore2Handle?.get();
			}
		}
		const dataStoreFactory1 = new DataObjectFactory(
			TestDataObjectType1,
			TestDataObject1,
			[],
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
		);

		const registryStoreEntries = new Map<string, Promise<IFluidDataStoreFactory>>([
			[dataStoreFactory1.type, Promise.resolve(dataStoreFactory1)],
			[dataStoreFactory2.type, Promise.resolve(dataStoreFactory2)],
		]);
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: dataStoreFactory1,
			registryEntries: registryStoreEntries,
		});

		const logger = createChildLogger();

		let provider: ITestObjectProvider;

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
			return loadSummarizer(provider, runtimeFactory, summaryVersion);
		};

		/**
		 * Callback that will be called by the document storage service whenever a summary is uploaded by the client.
		 * Update the summary context to include the summary proposal and ack handle as per the latest ack for the
		 * document.
		 */
		function uploadSummaryCb(
			summaryTree: ISummaryTree,
			context: ISummaryContext,
		): ISummaryContext {
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
			const latestSummaryRefSeqNum =
				latestAckedSummary?.summaryOp.referenceSequenceNumber ?? 0;
			const summaryResult = await submitAndAckSummary(
				provider,
				summarizerClient,
				logger,
				latestSummaryRefSeqNum,
				false, // fullTree
			);
			latestAckedSummary = summaryResult.ackedSummary;
			assert(
				latestSummaryContext &&
					latestSummaryContext.referenceSequenceNumber >=
						summaryResult.summarySequenceNumber,
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
			beforeEach("setup", async () => {
				provider = getTestObjectProvider({ syncSummarizer: true });
				// Wrap the document service factory in the driver so that the `uploadSummaryCb` function is called every
				// time the summarizer client uploads a summary.
				(provider as any)._documentServiceFactory =
					wrapObjectAndOverride<IDocumentServiceFactory>(
						provider.documentServiceFactory,
						{
							createDocumentService: {
								connectToStorage: {
									uploadSummaryWithContext: (dss) => async (summary, context) => {
										uploadSummaryCb(summary, context);
										// eslint-disable-next-line @typescript-eslint/no-unsafe-return
										return dss.uploadSummaryWithContext(summary, context);
									},
								},
							},
						},
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
					summaryLogger: logger,
					cancellationToken: neverCancelledSummaryToken,
					latestSummaryRefSeqNum: 0,
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

				const dataStoreA = await dataStoreFactory1.createInstance(
					mainDataStore._context.containerRuntime,
				);
				mainDataStore._root.set("dataStoreA", dataStoreA.handle);

				const summaryVersion = await waitForSummary(summarizerClient1);
				mainDataStore._root.set("key", "value");

				const summarizerClient2 = await getNewSummarizer(summaryVersion);
				// Wait for all pending ops to be processed by all clients.
				await provider.ensureSynchronized();
				const summarySequenceNumber =
					summarizerClient2.containerRuntime.deltaManager.lastSequenceNumber;

				// Submit a summary
				const latestSummaryRefSeqNum =
					latestAckedSummary?.summaryOp.referenceSequenceNumber ?? 0;
				const result = await summarizerClient2.containerRuntime.submitSummary({
					fullTree: false,
					summaryLogger: logger,
					cancellationToken: neverCancelledSummaryToken,
					latestSummaryRefSeqNum,
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
					summaryLogger: logger,
					cancellationToken: neverCancelledSummaryToken,
					latestSummaryRefSeqNum: summary1.summaryRefSeq,
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
	},
);
