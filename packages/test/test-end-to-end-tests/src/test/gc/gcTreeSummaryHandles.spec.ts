/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITelemetryLoggerExt, createChildLogger } from "@fluidframework/telemetry-utils";
import { IContainer, IRuntimeFactory, LoaderHeader } from "@fluidframework/container-definitions";
import { ILoaderProps } from "@fluidframework/container-loader";
import {
	ContainerRuntime,
	IAckedSummary,
	IContainerRuntimeOptions,
	ISummaryCancellationToken,
	ISummaryNackMessage,
	neverCancelledSummaryToken,
	SummarizerStopReason,
	SummaryCollection,
} from "@fluidframework/container-runtime";
import { DriverHeader, ISummaryContext } from "@fluidframework/driver-definitions";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { gcTreeKey } from "@fluidframework/runtime-definitions";
import {
	ITestFluidObject,
	ITestObjectProvider,
	TestFluidObjectFactory,
	wrapDocumentServiceFactory,
	waitForContainerConnection,
	createContainerRuntimeFactoryWithDefaultDataStore,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";

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

	const summarizer = await summarizerContainer.getEntryPoint();
	return {
		containerRuntime: (summarizer as any).runtime as ContainerRuntime,
		summaryCollection,
	};
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace FailingSubmitSummaryStage {
	export type Base = 1;
	export type Generate = 2;
	export type Upload = 3;

	export const Base: Base = 1 as const;
	export const Generate: Generate = 2 as const;
	export const Upload: Upload = 3 as const;
}

type FailingSubmitSummaryStage =
	| FailingSubmitSummaryStage.Base
	| FailingSubmitSummaryStage.Generate
	| FailingSubmitSummaryStage.Upload;

class ControlledCancellationToken implements ISummaryCancellationToken {
	count: number = 0;
	get cancelled(): boolean {
		this.count++;
		return this.count >= this.whenToCancel;
	}

	constructor(
		private readonly whenToCancel: FailingSubmitSummaryStage,
		public readonly waitCancelled: Promise<SummarizerStopReason> = new Promise(() => {}),
	) {}
}

async function submitFailingSummary(
	provider: ITestObjectProvider,
	summarizerClient: { containerRuntime: ContainerRuntime; summaryCollection: SummaryCollection },
	logger: ITelemetryLoggerExt,
	failingStage: FailingSubmitSummaryStage,
	fullTree: boolean = false,
) {
	await provider.ensureSynchronized();
	// Submit a summary with a fail token on generate
	const result = await summarizerClient.containerRuntime.submitSummary({
		fullTree,
		refreshLatestAck: false,
		summaryLogger: logger,
		cancellationToken: new ControlledCancellationToken(failingStage),
	});

	const stageMap = new Map<FailingSubmitSummaryStage, string>();
	stageMap.set(FailingSubmitSummaryStage.Base, "base");
	stageMap.set(FailingSubmitSummaryStage.Generate, "generate");
	stageMap.set(FailingSubmitSummaryStage.Upload, "upload");

	const failingStageString = stageMap.get(failingStage);
	assert(result.stage === failingStageString, `Expected a failure on ${failingStageString}`);
	assert(result.stage !== "submit", `Expected a failing stage: ${failingStageString}`);
	assert(result.error !== undefined, `Expected an error on ${failingStageString}`);
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
	cancellationToken: ISummaryCancellationToken = neverCancelledSummaryToken,
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

/**
 * Validates whether or not a GC Tree Summary Handle should be written to the summary.
 */
describeCompat(
	"GC Tree stored as a handle in summaries",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const {
			containerRuntime: { ContainerRuntimeFactoryWithDefaultDataStore },
		} = apis;

		let provider: ITestObjectProvider;
		// TODO:#4670: Make this compat-version-specific.
		const defaultFactory = new TestFluidObjectFactory([]);
		const runtimeOptions: IContainerRuntimeOptions = {
			gcOptions: { gcAllowed: true },
		};
		const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
			ContainerRuntimeFactoryWithDefaultDataStore,
			{
				defaultFactory,
				registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
				runtimeOptions,
			},
		);
		const logger = createChildLogger();

		// Stores the latest summary uploaded to the server.
		let latestUploadedSummary: ISummaryTree | undefined;
		// Stores the latest summary context uploaded to the server.
		let latestSummaryContext: ISummaryContext | undefined;
		// Stores the latest acked summary for the document.
		let latestAckedSummary: IAckedSummary | undefined;

		let mainContainer: IContainer;
		let summarizerClient1: {
			containerRuntime: ContainerRuntime;
			summaryCollection: SummaryCollection;
		};
		let dataStoreA: ITestFluidObject;
		let dataStoreB: ITestFluidObject;
		let dataStoreC: ITestFluidObject;

		const isTreeHandle = true;
		const isTree = false;

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
		async function submitSummaryAndValidateState(
			summarizerClient: {
				containerRuntime: ContainerRuntime;
				summaryCollection: SummaryCollection;
			},
			isHandle: boolean,
		): Promise<string> {
			const summaryResult = await submitAndAckSummary(
				provider,
				summarizerClient,
				logger,
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
			const gcObject = latestUploadedSummary.tree[gcTreeKey];

			if (isHandle) {
				assert(gcObject.type === SummaryType.Handle, "Expected a gc handle!");
			} else {
				assert(gcObject.type === SummaryType.Tree, "Expected a gc blob!");
			}

			return latestAckedSummary.summaryAck.contents.handle;
		}

		describe("Stores handle in summary when GC state does not change", () => {
			beforeEach(async () => {
				provider = getTestObjectProvider({ syncSummarizer: true });
				// Wrap the document service factory in the driver so that the `uploadSummaryCb` function is called every
				// time the summarizer client uploads a summary.
				(provider as any)._documentServiceFactory = wrapDocumentServiceFactory(
					provider.documentServiceFactory,
					uploadSummaryCb,
				);

				mainContainer = await createContainer();
				dataStoreA = (await mainContainer.getEntryPoint()) as ITestFluidObject;

				// Create data stores B and C, and mark them as referenced.
				const containerRuntime = dataStoreA.context.containerRuntime;
				dataStoreB = (await (
					await containerRuntime.createDataStore(defaultFactory.type)
				).entryPoint.get()) as ITestFluidObject;
				dataStoreA.root.set("dataStoreB", dataStoreB.handle);
				dataStoreC = (await (
					await containerRuntime.createDataStore(defaultFactory.type)
				).entryPoint.get()) as ITestFluidObject;
				dataStoreA.root.set("dataStoreC", dataStoreC.handle);

				await waitForContainerConnection(mainContainer);

				// A gc blob should be submitted as this is the first summary
				summarizerClient1 = await getNewSummarizer();
				await submitSummaryAndValidateState(summarizerClient1, isTree);
			});

			afterEach(() => {
				latestAckedSummary = undefined;
				latestSummaryContext = undefined;
				latestUploadedSummary = undefined;
			});

			it("Stores handle when data store changes, but no handles are modified", async () => {
				// Load a new summarizerClient from the full GC tree
				const summarizerClient2 = await getNewSummarizer();
				const tree1 =
					await summarizerClient1.containerRuntime.storage.getSnapshotTree()[gcTreeKey];
				const tree2 =
					await summarizerClient2.containerRuntime.storage.getSnapshotTree()[gcTreeKey];
				assert.deepEqual(tree2, tree1, "GC trees between containers should be the same!");

				// Make a change in dataStoreA.
				dataStoreA.root.set("key", "value");

				// Summarize and validate that a GC blob handle is generated.
				const summaryVersion = await submitSummaryAndValidateState(
					summarizerClient1,
					isTreeHandle,
				);

				// Load a new summarizerClient
				const summarizerClient3 = await getNewSummarizer(summaryVersion);

				// Summarize on a new summarizer client and validate that a GC blob handle is generated.
				await submitSummaryAndValidateState(summarizerClient3, isTreeHandle);
				const tree3 =
					await summarizerClient1.containerRuntime.storage.getSnapshotTree()[gcTreeKey];
				const tree4 =
					await summarizerClient3.containerRuntime.storage.getSnapshotTree()[gcTreeKey];
				assert.deepEqual(tree2, tree3, "GC trees with handles should be the same!");
				assert.deepEqual(
					tree3,
					tree4,
					"GC trees between containers should be the regardless of handle!",
				);
			});

			it("New gc blobs are submitted when handles are added and deleted", async () => {
				// Make a change in dataStoreA.
				dataStoreA.root.set("key", "value");

				// A gc blob handle should be submitted as there are no gc changes
				await submitSummaryAndValidateState(summarizerClient1, isTreeHandle);

				// A new gc blob should be submitted as there is a deleted gc reference
				dataStoreA.root.delete("dataStoreC");

				// Summarize and validate that all data store entries are trees since a datastore reference has changed.
				await submitSummaryAndValidateState(summarizerClient1, isTree);

				// A gc blob handle should be submitted as there are no gc changes
				await submitSummaryAndValidateState(summarizerClient1, isTreeHandle);

				// Add a handle reference to dataStore C
				dataStoreA.root.set("dataStoreC", dataStoreC.handle);
				// A new gc blob should be submitted as there is a new gc reference
				await submitSummaryAndValidateState(summarizerClient1, isTree);
			});

			it("GC blob handle written when summary fails", async () => {
				// Make a change in dataStoreA.
				dataStoreA.root.set("key", "value");

				// A gc blob handle should be submitted as there are no gc changes
				await submitSummaryAndValidateState(summarizerClient1, isTreeHandle);

				await submitFailingSummary(
					provider,
					summarizerClient1,
					logger,
					FailingSubmitSummaryStage.Generate,
				);

				// GC blob handle expected
				await submitSummaryAndValidateState(summarizerClient1, isTreeHandle);
			});

			it("GC blob written when summary fails", async () => {
				// Make a reference change by deleting a handle
				dataStoreA.root.delete("dataStoreB");

				await provider.ensureSynchronized();

				await submitFailingSummary(
					provider,
					summarizerClient1,
					logger,
					FailingSubmitSummaryStage.Upload,
				);

				// GC blob expected as the summary had changed
				await submitSummaryAndValidateState(summarizerClient1, isTree);
			});

			it("GC blob handle written when new summarizer loaded from last summary summarizes", async () => {
				await submitSummaryAndValidateState(summarizerClient1, isTreeHandle);

				await provider.ensureSynchronized();

				// Make a reference change by deleting a handle
				dataStoreA.root.delete("dataStoreB");

				await submitFailingSummary(
					provider,
					summarizerClient1,
					logger,
					FailingSubmitSummaryStage.Generate,
				);

				// GC blob expected as the summary had changed
				const summaryVersion: string = await submitSummaryAndValidateState(
					summarizerClient1,
					isTree,
				);

				const summarizerClient2 = await getNewSummarizer(summaryVersion);

				// GC blob expected to be the same as the summary has not changed
				await submitSummaryAndValidateState(summarizerClient2, isTreeHandle);
			});
		});
	},
);
