/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITestDataObject, describeCompat, itExpects } from "@fluid-private/test-version-utils";
import {
	IDocumentService,
	IDocumentServiceFactory,
	type IDocumentStorageService,
	type ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import { seqFromTree } from "@fluidframework/runtime-utils/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizer,
	createTestConfigProvider,
	summarizeNow,
} from "@fluidframework/test-utils/internal";

import { wrapObjectAndOverride } from "../../mocking.js";
import { reconnectSummarizerToBeElected } from "../gc/index.js";

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

		beforeEach("getTestObjectProvider", async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
			configProvider.set("Fluid.ContainerRuntime.Test.CloseSummarizerDelayOverrideMs", 0);
		});

		afterEach(() => {
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
				await assert.rejects(async () => summarizeNow(summarizer2));
				assert.strictEqual(
					summarizer2Container.disposed,
					true,
					"Summarizer container should dispose after fetching newer ack",
				);
			},
		);

		/**
		 * This test tests a scenario where a summarizer gets a newer summary ack, but on fetching the latest snapshot,
		 * it gets a snapshot which is older than the one corresponding to the ack. The summarizer then closes.
		 * This can happen in cases such as database rollbacks in server which results in losing recent snapshots but
		 * not the corresponding acks.
		 * Currently, documents in this state are corrupted because they will keep doing this in a loop.
		 */
		itExpects(
			"closes the container on getting a newer summary ack and fetching a snapshot older than the ack's snapshot",
			[{ eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed" }],
			async () => {
				const container1 = await provider.makeTestContainer(testContainerConfig);
				const defaultDataStore1 = (await container1.getEntryPoint()) as ITestDataObject;
				defaultDataStore1._root.set("1", "2");

				const { summarizer: summarizer1 } = await createSummarizer(provider, container1, {
					loaderProps: { configProvider },
				});

				// Intercept the document storage service's getSnapshotTree function and configure it to send an older
				// snapshot if it has seen one before. This will re-create a scenario where the storage sends an older
				// snapshot because the latest one is lost.
				// Note that this is done after creating the first summarizer so it shouldn't be affected.
				let previousSnapshotTree: ISnapshotTree | null = null;
				const snapshotHandler = async (
					storage: IDocumentStorageService,
					snapshotTree: ISnapshotTree | null,
				): Promise<ISnapshotTree | null> => {
					assert(snapshotTree !== null, "The server did not return a snapshot");
					const readAndParseBlob = async <T>(id: string) => readAndParse<T>(storage, id);
					// When the second summarizer loads, previousSnapshotTree will be null. So, the snapshot tree from
					// the server is returned.
					// The next time this is called on getting the summary ack, return the previousSnapshotTree after
					// validating that it is in fact older that the one received from the server. The validation is not
					// necessary but it will ensure that the test is non-flaky.
					if (previousSnapshotTree !== null) {
						const latestRefSeqNumber = await seqFromTree(snapshotTree, readAndParseBlob);
						const previousRefSeqNumber = await seqFromTree(
							previousSnapshotTree,
							readAndParseBlob,
						);
						if (latestRefSeqNumber > previousRefSeqNumber) {
							return previousSnapshotTree;
						}
					}
					previousSnapshotTree = snapshotTree;
					return snapshotTree;
				};
				(provider as any)._documentServiceFactory =
					wrapObjectAndOverride<IDocumentServiceFactory>(provider.documentServiceFactory, {
						createDocumentService:
							(factory) =>
							async (...args) => {
								const service = await factory.createDocumentService(...args);
								return wrapObjectAndOverride<IDocumentService>(service, {
									connectToStorage: {
										getSnapshotTree: (storage) => async (version, scenarioName) => {
											const res = await storage.getSnapshotTree(version, scenarioName);
											return snapshotHandler(storage, res);
										},
									},
								});
							},
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
				await assert.rejects(async () => summarizeNow(summarizer2));
				assert.strictEqual(
					summarizer2Container.disposed,
					true,
					"Summarizer container should have disposed",
				);
			},
		);
	},
);
