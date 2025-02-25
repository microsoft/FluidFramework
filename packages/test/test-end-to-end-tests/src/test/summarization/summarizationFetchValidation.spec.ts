/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { ISummarizeResults, ISummarizer } from "@fluidframework/container-runtime/internal";
import { type IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import { ISummaryContext, ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import { seqFromTree } from "@fluidframework/runtime-utils/internal";
import { LoggingError } from "@fluidframework/telemetry-utils/internal";
import {
	ITestObjectProvider,
	createSummarizer,
	createTestConfigProvider,
	summarizeNow,
	waitForContainerConnection,
	type ITestContainerConfig,
	type ITestFluidObject,
} from "@fluidframework/test-utils/internal";
import { createSandbox, SinonSandbox } from "sinon";

/**
 * Validates the scenario in which we always retrieve the latest snapshot.
 */
describeCompat(
	"Summarizer fetches expected number of times",
	"NoCompat",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;
		let mainContainer: IContainer;
		let mainDataStore: ITestFluidObject;

		const configProvider = createTestConfigProvider();
		const testContainerConfig: ITestContainerConfig = {
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: { state: "disabled" },
				},
			},
			loaderProps: { configProvider },
		};
		const summarizerContainerConfig: ITestContainerConfig = {
			loaderProps: { configProvider },
		};

		let sandbox: SinonSandbox;
		before(() => {
			sandbox = createSandbox();
		});

		afterEach(() => {
			sandbox.restore();
			configProvider.clear();
		});

		beforeEach("setup", async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
			configProvider.set("Fluid.ContainerRuntime.Test.CloseSummarizerDelayOverrideMs", 0);
			mainContainer = await provider.makeTestContainer(testContainerConfig);

			mainDataStore = (await mainContainer.getEntryPoint()) as ITestFluidObject;
			mainDataStore.root.set("test", "value");
			await waitForContainerConnection(mainContainer);
		});

		afterEach(() => {
			configProvider.clear();
		});

		interface GetVersionWrap {
			/** The reference sequence number of the submitted summary. */
			summaryRefSeq: number;
			/** The version number of the submitted summary. */
			summaryVersion: string;
			/** Number of times snapshot is fetched from the server when submitting a summary. */
			fetchCount: number;
			/** The referenced sequence number of the last fetched snapshot when submitting a summary. */
			fetchSnapshotRefSeq: number;
		}

		async function createSummarizerWithConfig(summaryVersion?: string) {
			return createSummarizer(
				provider,
				mainContainer,
				summarizerContainerConfig,
				summaryVersion,
			);
		}

		async function waitForSummary(summarizer: ISummarizer) {
			// Wait for all pending ops to be processed by all clients.
			await provider.ensureSynchronized();
			const summaryResult = await summarizeNow(summarizer);
			return {
				summaryVersion: summaryResult.summaryVersion,
				summaryRefSeq: summaryResult.summaryRefSeq,
			};
		}

		async function sendOpAndSummarize(summarizer: ISummarizer): Promise<GetVersionWrap> {
			mainDataStore.root.set("key", "value");

			// Spy on the getSnapshotTree function to find out if it was called and if so, what is the
			// reference sequence number of the snapshot returned.
			const containerRuntime = (summarizer as any).runtime as IContainerRuntime;
			const getSnapshotTreeSpy = sandbox.spy(containerRuntime.storage, "getSnapshotTree");

			const summaryResult = await waitForSummary(summarizer);
			assert(summaryResult.summaryVersion, "Summary version should be defined");
			const summaryVersion = summaryResult.summaryVersion;
			const summaryRefSeq = summaryResult.summaryRefSeq;

			const fetchCount = getSnapshotTreeSpy.callCount;
			let fetchSnapshotRefSeq = -1;
			// If getSnapshotTree was called, get the reference sequence number of the snapshot it returned.
			if (fetchCount > 0) {
				const snapshotTree = await getSnapshotTreeSpy.returnValues[0];
				assert(snapshotTree !== null, "Could not find snapshot tree");
				fetchSnapshotRefSeq = await getSnapshotSequenceNumber(containerRuntime, snapshotTree);
			}

			getSnapshotTreeSpy.restore();
			return { fetchCount, fetchSnapshotRefSeq, summaryVersion, summaryRefSeq };
		}

		async function getSnapshotSequenceNumber(
			containerRuntime: IContainerRuntime,
			snapshotTree: ISnapshotTree,
		) {
			const readAndParseBlob = async <T>(id: string) =>
				readAndParse<T>(containerRuntime.storage, id);
			return seqFromTree(snapshotTree, readAndParseBlob);
		}

		it("First Summary does not result in fetch", async () => {
			const summarizer1 = (await createSummarizerWithConfig()).summarizer;

			const versionWrap = await sendOpAndSummarize(summarizer1);
			assert(versionWrap.fetchCount === 0, "No fetch should have happened");
			summarizer1.close();
		});

		it("Summarizing consecutive times should not fetch", async () => {
			const summarizer1 = (await createSummarizerWithConfig()).summarizer;

			let versionWrap = await sendOpAndSummarize(summarizer1);
			assert(versionWrap.fetchCount === 0, "No fetch should have happened");

			versionWrap = await sendOpAndSummarize(summarizer1);
			assert(versionWrap.fetchCount === 0, "No fetch should have happened");
			summarizer1.close();
		});

		it("Summarizer loading from an older summary should fetch latest summary", async function () {
			const summarizer1 = (await createSummarizerWithConfig()).summarizer;
			// Create a second summarizer. Note that this is done before posting a summary because the server may
			// delete this summary when a new one is posted.
			// This summarizer will be used later to generate a summary and validate that it fetches the latest summary.
			const { summarizer: summarizer2, container: container2 } =
				await createSummarizerWithConfig();
			const containerRuntime2 = (summarizer2 as any).runtime as IContainerRuntime;

			// Create a spy for "getSnapshotTree" function of the second summarizer. When it receives the ack for
			// the summary submitted by the first summarizer, it should call this function to fetch the latest snapshot.
			const getSnapshotTreeSpy2 = sandbox.spy(containerRuntime2.storage, "getSnapshotTree");

			// This tells the summarizer to process the latest summary ack
			// This is because the second summarizer is not the elected summarizer and thus the summaryManager does not
			// tell the summarizer to process acks.
			const summarizerRunP = summarizer2.run("test");

			const versionWrap1 = await sendOpAndSummarize(summarizer1);
			assert(versionWrap1.fetchCount === 0, "No fetch should have happened");
			summarizer1.close();

			// Send an op and wait for the second summarizer to process this. This ensures that the summary ack from
			// the previous summary will be processed.
			mainDataStore.root.set("key", "value");
			await summarizerRunP;

			// Validate that the second summarizer fetches the latest snapshot.
			assert.strictEqual(
				getSnapshotTreeSpy2.calledOnce,
				true,
				"Snapshot fetch did not happen",
			);
			const snapshotTree2 = await getSnapshotTreeSpy2.returnValues[0];
			assert(snapshotTree2 !== null, "Did not find snapshot tree");
			const fetchSnapshotRefSeq = await getSnapshotSequenceNumber(
				containerRuntime2,
				snapshotTree2,
			);
			assert.strictEqual(
				fetchSnapshotRefSeq,
				versionWrap1.summaryRefSeq,
				"Fetch did not download latest snapshot",
			);
		});

		const errorString = "Summary failed after upload";
		itExpects(
			"Summarizer succeeds after Summarizer fails",
			[
				{
					eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
					error: errorString,
				},
				{
					eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed",
					error: errorString,
				},
			],
			async () => {
				// Create new summarizer
				const summarizer = (await createSummarizerWithConfig()).summarizer;

				// Second summary should be discarded
				const containerRuntime = (summarizer as any).runtime as IContainerRuntime;
				let uploadSummaryUploaderFunc = containerRuntime.storage.uploadSummaryWithContext;
				let lastSummaryVersion: string | undefined;
				const func = async (summary: ISummaryTree, context: ISummaryContext) => {
					uploadSummaryUploaderFunc = uploadSummaryUploaderFunc.bind(containerRuntime.storage);
					const response = await uploadSummaryUploaderFunc(summary, context);
					// ODSP has single commit summary enabled by default and
					// will update the summary version even without the summary op.
					if (provider.driver.type === "odsp") {
						lastSummaryVersion = response;
					}
					throw new LoggingError("Summary failed after upload");
				};
				containerRuntime.storage.uploadSummaryWithContext = func;

				const result2: ISummarizeResults = summarizer.summarizeOnDemand({
					reason: "test2",
				});
				assert((await result2.summarySubmitted).success === false, "Summary should fail");
				summarizer.close();

				const secondSummarizer = (await createSummarizerWithConfig(lastSummaryVersion))
					.summarizer;
				const versionWrap = await sendOpAndSummarize(secondSummarizer);
				assert(versionWrap.fetchCount === 0, "No fetch should have happened");
				secondSummarizer.close();
			},
		);
	},
);
