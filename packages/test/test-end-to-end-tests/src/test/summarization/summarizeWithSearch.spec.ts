/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	SummaryCollection,
	neverCancelledSummaryToken,
	type ISummaryNackMessage,
} from "@fluidframework/container-runtime/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import type { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import {
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import {
	ITestObjectProvider,
	createSummarizerFromFactory,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

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
		const dataStoreFactory1 = new DataObjectFactory({
			type: TestDataObjectType1,
			ctor: TestDataObject1,
			sharedObjects: [],
			optionalProviders: [],
		});
		const dataStoreFactory2 = new DataObjectFactory({
			type: TestDataObjectType2,
			ctor: TestDataObject2,
			sharedObjects: [],
			optionalProviders: [],
		});

		const registryStoreEntries = new Map<string, Promise<IFluidDataStoreFactory>>([
			[dataStoreFactory1.type, Promise.resolve(dataStoreFactory1)],
			[dataStoreFactory2.type, Promise.resolve(dataStoreFactory2)],
		]);
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: dataStoreFactory1,
			registryEntries: registryStoreEntries,
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: { state: "disabled" },
				},
			},
		});

		const logger = createChildLogger();

		let provider: ITestObjectProvider;
		let mainContainer: IContainer;
		let mainDataStore: TestDataObject1;
		let mainContainerRuntime: ContainerRuntime;

		/**
		 * Loads a summarizer client with the given version (if any) and returns its container runtime and summary collection.
		 */
		async function loadSummarizer(summaryVersion?: string) {
			const { summarizer, container } = await createSummarizerFromFactory(
				provider,
				mainContainer,
				dataStoreFactory1,
				summaryVersion,
				ContainerRuntimeFactoryWithDefaultDataStore,
				registryStoreEntries,
			);
			await waitForContainerConnection(container);

			// Fail fast if we receive a nack as something must have gone wrong.
			const summaryCollection = new SummaryCollection(
				container.deltaManager,
				createChildLogger(),
			);
			summaryCollection.on("summaryNack", (op: ISummaryNackMessage) => {
				throw new Error(
					`Received Nack for sequence#: ${op.contents.summaryProposal.summarySequenceNumber}`,
				);
			});
			// The runtime prop is private to the Summarizer class
			const containerRuntime = (summarizer as any).runtime as ContainerRuntime;
			const entryPoint = await containerRuntime.getAliasedDataStoreEntryPoint("default");
			if (entryPoint === undefined) {
				throw new Error("default dataStore must exist");
			}
			return {
				summarizer,
				containerRuntime,
				entryPoint: entryPoint.get(),
				summaryCollection,
			};
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
				mainContainer = await provider.createContainer(runtimeFactory);
				// Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
				// re-sent. Do it here so that the extra events don't mess with rest of the test.
				mainDataStore = (await mainContainer.getEntryPoint()) as TestDataObject1;
				mainDataStore._root.set("anytest", "anyvalue");
				mainContainerRuntime = mainDataStore._context.containerRuntime as ContainerRuntime;
				await waitForContainerConnection(mainContainer);
			});

			it("summarize should not fail when data store is created after summary generation and before processing summary ack", async () => {
				const { containerRuntime, summaryCollection } = await loadSummarizer();

				// Wait for all pending ops to be processed by all clients.
				await provider.ensureSynchronized();

				// Submit a summary
				const result = await containerRuntime.submitSummary({
					fullTree: false,
					summaryLogger: logger,
					cancellationToken: neverCancelledSummaryToken,
					latestSummaryRefSeqNum: 0,
				});
				assert(result.stage === "submit", "The summary was not submitted");
				await waitForSummaryOp(containerRuntime);
				const dataStore = await containerRuntime.createDataStore(TestDataObjectType2);
				await dataStore.entryPoint.get();

				// Wait for the above summary to be ack'd.
				const ackedSummary = await summaryCollection.waitSummaryAck(
					result.referenceSequenceNumber,
				);
				// The assert 0x1a6 should not be hit anymore.
				await containerRuntime.refreshLatestSummaryAck({
					proposalHandle: ackedSummary.summaryOp.contents.handle,
					ackHandle: ackedSummary.summaryAck.contents.handle,
					summaryRefSeq: ackedSummary.summaryOp.referenceSequenceNumber,
					summaryLogger: logger,
				});
			});

			it("Test Assert 0x1a6 should not happen with MixinSearch", async () => {
				const { summarizer } = await loadSummarizer();

				const dataStoreA = await dataStoreFactory1.createInstance(
					mainDataStore._context.containerRuntime,
				);
				mainDataStore._root.set("dataStoreA", dataStoreA.handle);

				const { summaryVersion } = await summarizeNow(summarizer);
				mainDataStore._root.set("key", "value");

				const { containerRuntime: containerRuntime2, summaryCollection: summaryCollection2 } =
					await loadSummarizer(summaryVersion);
				// Wait for all pending ops to be processed by all clients.
				await provider.ensureSynchronized();

				// Submit a summary
				const result = await containerRuntime2.submitSummary({
					fullTree: false,
					summaryLogger: logger,
					cancellationToken: neverCancelledSummaryToken,
					latestSummaryRefSeqNum: 0,
				});
				assert(result.stage === "submit", "The summary was not submitted");

				await waitForSummaryOp(containerRuntime2);

				const dataStore = await containerRuntime2.createDataStore(TestDataObjectType2);
				await dataStore.entryPoint.get();

				// Wait for the above summary to be ack'd.
				const ackedSummary = await summaryCollection2.waitSummaryAck(
					result.referenceSequenceNumber,
				);

				// The assert 0x1a6 should be hit now.
				await containerRuntime2.refreshLatestSummaryAck({
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
				const summarizer2 = await loadSummarizer(summary1.summaryVersion);

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
		});
	},
);
