/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITestDataObject, describeCompat, itExpects } from "@fluid-private/test-version-utils";
import type {
	ISummaryAckMessage,
	ISummaryOpMessage,
	Summarizer,
	SummaryCollection,
} from "@fluidframework/container-runtime/internal";
import { type IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import {
	MessageType,
	type ISequencedDocumentMessage,
	type ISummaryAck,
	type ISummaryContent,
} from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizer,
	createTestConfigProvider,
	summarizeNow,
} from "@fluidframework/test-utils/internal";
import { createSandbox, SinonSandbox } from "sinon";

import { reconnectSummarizerToBeElected } from "../gc/index.js";

type WithPrivates<T, TPrivates> = Omit<T, keyof TPrivates> & TPrivates;
type SummaryCollectionWithPrivates = WithPrivates<
	SummaryCollection,
	{
		handleOp(opArg: ISequencedDocumentMessage): void;
	}
>;
type SummarizerWithPrivates = WithPrivates<
	Summarizer,
	{
		summaryCollection: SummaryCollectionWithPrivates;
		runtime: IContainerRuntime;
	}
>;

/**
 * These tests validate the behavior of the summarizer when it gets summary acks that are newer than the summary
 * it knows about.
 */
describeCompat(
	"Summarizer on getting newer summary acks",
	"NoCompat",
	(getTestObjectProvider) => {
		const testContainerConfig: ITestContainerConfig = {
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: { state: "disabled" },
				},
			},
		};
		const configProvider = createTestConfigProvider();

		let provider: ITestObjectProvider;

		let sandbox: SinonSandbox;
		before(() => {
			sandbox = createSandbox();
		});

		beforeEach("getTestObjectProvider", async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
			configProvider.set("Fluid.ContainerRuntime.Test.CloseSummarizerDelayOverrideMs", 0);
		});

		afterEach(() => {
			sandbox.restore();
			configProvider.clear();
		});

		itExpects(
			"closes the container on getting a newer summary ack and fetching the corresponding snapshot",
			[{ eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed" }],
			async () => {
				const container1 = await provider.makeTestContainer(testContainerConfig);
				const defaultDataStore1 = (await container1.getEntryPoint()) as ITestDataObject;
				defaultDataStore1._root.set("1", "2");

				// Create 2 summarizers. They should both load from the first snapshot. The first summarizer will
				// summarize and the second one will get the summary ack.
				const { summarizer: summarizer1 } = await createSummarizer(provider, container1, {
					loaderProps: { configProvider },
				});
				const { summarizer: summarizer2, container: summarizer2Container } =
					await createSummarizer(provider, container1, {
						loaderProps: { configProvider },
					});

				// Summarize via the first summarizer.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer1);

				// Close the first summarizer and elect the second summarizer to be able to summarize. This step is
				// needed to run the second summarizer so that it starts listening for summary acks and processes them.
				summarizer1.close();
				await reconnectSummarizerToBeElected(summarizer2Container);

				// The second summarizer will fail to summarize because it will get a newer ack, fetch the latest
				// snapshot and then close.
				// Send an op and wait for it to be processed by the summarizer. This will ensure that the summary ack
				// will be processed as well since it's sequenced before this op.
				defaultDataStore1._root.set("2", "3");
				await provider.ensureSynchronized();
				await assert.rejects(async () => summarizeNow(summarizer2), "Summarize should fail");
				assert.strictEqual(
					summarizer2Container.disposed,
					true,
					"Summarizer container should dispose after fetching newer ack",
				);
			},
		);

		/**
		 * This test tests a scenario where a summarizer gets a newer summary ack, but on fetching the latest snapshot,
		 * it gets a snapshot which is older than the one corresponding to the ack.
		 * This can happen in cases such as database rollbacks in server which results in losing recent snapshots but
		 * not the corresponding acks.
		 * Summarizers should not close in this scenario. They should continue generating summaries.
		 */
		it("doesn't fail on getting a newer summary ack and fetching a snapshot older than the ack's snapshot", async () => {
			const container1 = await provider.makeTestContainer(testContainerConfig);
			const defaultDataStore1 = (await container1.getEntryPoint()) as ITestDataObject;

			const mockLogger = new MockLogger();
			const createResult = await createSummarizer(
				provider,
				container1,
				{
					loaderProps: { configProvider },
				},
				undefined /* summaryVersion */,
				mockLogger,
			);

			const summarizerContainer = createResult.container;
			const summarizer = createResult.summarizer as SummarizerWithPrivates;
			const summaryCollection = summarizer.summaryCollection;

			defaultDataStore1._root.set("1", "2");
			await provider.ensureSynchronized();
			const lastOp = summarizer.runtime.deltaManager.lastMessage;
			assert(lastOp !== undefined, "No ops in delta manager");

			/**
			 * The only snapshot for this container is the create snapshot at reference seq# 0.
			 * Manufacture a summary op and a summary ack with reference seq# of the last processed op. This simulates
			 * an op / ack pair for a snapshot that doesn't exist in storage.
			 */
			const summaryOpHandle = "deletedSummaryHandle1";
			const summaryAckHandle = "deletedSummaryHandle2";
			const summaryOpContent: ISummaryContent = {
				handle: summaryOpHandle,
				message: "summary@100:50",
				parents: [],
				head: "deletedSummaryHead",
			};
			const fakeSummaryOp: ISummaryOpMessage = {
				...lastOp,
				type: MessageType.Summarize,
				contents: summaryOpContent,
				referenceSequenceNumber: lastOp.sequenceNumber, // This is greater than 0 representing a newer summary.
				sequenceNumber: lastOp.sequenceNumber + 1,
			};

			const summaryAck: ISummaryAck = {
				handle: summaryAckHandle,
				summaryProposal: { summarySequenceNumber: fakeSummaryOp.sequenceNumber },
			};
			const fakeSummaryAck: ISummaryAckMessage = {
				...fakeSummaryOp,
				type: MessageType.SummaryAck,
				contents: summaryAck,
				sequenceNumber: fakeSummaryOp.sequenceNumber + 1,
			};

			// Simulate calling summary collection with the above summary op / ack pair. This will end up calling
			// container runtime which will attempt to fetch the latest snapshot but will not find a newer snapshot.
			// So, it should ignore this ack.
			summaryCollection.handleOp(fakeSummaryOp);
			summaryCollection.handleOp(fakeSummaryAck);

			const getSnapshotTreeSpy = sandbox.spy(summarizer.runtime.storage, "getSnapshotTree");
			const uploadSummarySpy = sandbox.spy(
				summarizer.runtime.storage,
				"uploadSummaryWithContext",
			);

			await assert.doesNotReject(summarizeNow(summarizer), "Summarize should not fail");
			assert.notStrictEqual(
				summarizerContainer.disposed,
				true,
				"Summarizer should not close on receiving ack with no corresponding snapshot",
			);
			assert(
				getSnapshotTreeSpy.calledOnce,
				"Summarizer should call getSnapshotTree in response to the ack",
			);
			assert(uploadSummarySpy.calledOnce, "A summary should be uploaded");

			// Validate that when uploading the summary, container runtime does not use the handles of the fake
			// summary op / ack as the parent ack handle.
			const uploadedSummaryContext = uploadSummarySpy.args[0][1];
			assert.notStrictEqual(
				uploadedSummaryContext.ackHandle,
				summaryOpHandle,
				"Should not use summary op handle",
			);
			assert.notStrictEqual(
				uploadedSummaryContext.ackHandle,
				summaryAckHandle,
				"Should not use summary ack handle",
			);

			const fetchEventDetailsString = mockLogger.events.find((event) =>
				event.eventName.includes("RefreshLatestSummaryAckFetch_end"),
			)?.details;
			assert(
				fetchEventDetailsString !== undefined,
				"Did not find RefreshLatestSummaryAckFetch_end event",
			);
			const fetchEventDetails = JSON.parse(fetchEventDetailsString as string);
			assert(
				fetchEventDetails !== undefined,
				"RefreshLatestSummaryAckFetch_end doesn't have details",
			);
			assert(
				fetchEventDetails.newerSnapshotPresent === false,
				"It should not fetch newer snapshot",
			);
			assert.strictEqual(
				fetchEventDetails.targetAckHandle,
				summaryAckHandle,
				"The target handle should be the fake summary ack handle",
			);
			assert.notStrictEqual(
				fetchEventDetails.snapshotVersion,
				summaryAckHandle,
				"The fetched snapshot handle should not be the fake summary ack handle",
			);
		});
	},
);
