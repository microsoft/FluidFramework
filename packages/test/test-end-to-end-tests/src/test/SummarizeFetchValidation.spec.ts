/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	ISummarizeResults,
	ISummarizer,
} from "@fluidframework/container-runtime/internal";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	ISummaryContext,
	ISnapshotTree,
	IVersion,
} from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import { seqFromTree } from "@fluidframework/runtime-utils/internal";
import { LoggingError } from "@fluidframework/telemetry-utils/internal";
import {
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
	waitForContainerConnection,
	type ITestContainerConfig,
	type ITestFluidObject,
} from "@fluidframework/test-utils/internal";

// eslint-disable-next-line import/no-internal-modules
import { reconnectSummarizerToBeElected } from "./gc/gcTestSummaryUtils.js";

const testContainerConfig: ITestContainerConfig = {
	runtimeOptions: {
		summaryOptions: {
			summaryConfigOverrides: { state: "disabled" },
		},
	},
};
export const TestDataObjectType1 = "@fluid-example/test-dataStore1";

/**
 * Validates the scenario in which we always retrieve the latest snapshot.
 */
describeCompat.only(
	"Summarizer fetches expected number of times",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		let provider: ITestObjectProvider;
		let mainContainer: IContainer;
		let mainDataStore: ITestFluidObject;

		async function waitForSummary(summarizer: ISummarizer) {
			// Wait for all pending ops to be processed by all clients.
			await provider.ensureSynchronized();
			const summaryResult = await summarizeNow(summarizer);
			return {
				summaryVersion: summaryResult.summaryVersion,
				summaryRefSeq: summaryResult.summaryRefSeq,
			};
		}

		beforeEach("setup", async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
			mainContainer = await provider.makeTestContainer(testContainerConfig);

			mainDataStore = (await mainContainer.getEntryPoint()) as ITestFluidObject;
			mainDataStore.root.set("test", "value");
			await waitForContainerConnection(mainContainer);
		});

		interface GetVersionWrap {
			/** The reference sequence number of the submitted summary. */
			summaryRefSeq?: number;
			/** The version number of the submitted summary. */
			summaryVersion?: string;
			/** Number of times snapshot is fetched from the server when submitting a summary. */
			fetchCount: number;
			/** The referenced sequence number of the last fetched snapshot when submitting a summary. */
			fetchSnapshotRefSeq: number;
			/** Error during summarize, if any */
			error?: any;
		}

		async function sendOpAndSummarize(summarizer: ISummarizer): Promise<GetVersionWrap> {
			let fetchCount: number = 0;
			let fetchSnapshotRefSeq = -1;
			mainDataStore.root.set("key", "value");

			const containerRuntime = (summarizer as any).runtime as ContainerRuntime;
			const readAndParseBlob = async <T>(id: string) =>
				readAndParse<T>(containerRuntime.storage, id);
			let getSnapshotTreeFunc = containerRuntime.storage.getSnapshotTree;
			const getSnapshotTreeOverride = async (
				version?: IVersion,
				scenarioName?: string,
			): Promise<ISnapshotTree | null> => {
				getSnapshotTreeFunc = getSnapshotTreeFunc.bind(containerRuntime.storage);
				const snapshotTree = await getSnapshotTreeFunc(version, scenarioName);
				assert(snapshotTree !== null, "getSnapshotTree should did not return a tree");
				fetchSnapshotRefSeq = await seqFromTree(snapshotTree, readAndParseBlob);
				fetchCount++;
				return snapshotTree;
			};
			containerRuntime.storage.getSnapshotTree = getSnapshotTreeOverride;

			// Try to summarize. This can fail in scenario such as when a newer ack is received by the summarizer. In such
			// cases, return the error.
			let error: any;
			let summaryVersion: string | undefined;
			let summaryRefSeq: number | undefined;
			try {
				const summaryResult = await waitForSummary(summarizer);
				assert(summaryResult.summaryVersion, "Summary version should be defined");
				summaryVersion = summaryResult.summaryVersion;
				summaryRefSeq = summaryResult.summaryRefSeq;
			} catch (e) {
				error = e;
			}
			return { fetchCount, fetchSnapshotRefSeq, summaryVersion, summaryRefSeq, error };
		}

		it("First Summary does not result in fetch", async () => {
			const summarizer1 = (await createSummarizer(provider, mainContainer)).summarizer;

			const versionWrap = await sendOpAndSummarize(summarizer1);
			assert(versionWrap.fetchCount === 0, "No fetch should have happened");
			summarizer1.close();
		});

		it("Summarizing consecutive times should not fetch", async () => {
			const summarizer1 = (await createSummarizer(provider, mainContainer)).summarizer;

			let versionWrap = await sendOpAndSummarize(summarizer1);
			assert(versionWrap.fetchCount === 0, "No fetch should have happened");

			versionWrap = await sendOpAndSummarize(summarizer1);
			assert(versionWrap.fetchCount === 0, "No fetch should have happened");
			summarizer1.close();
		});

		itExpects(
			"Summarizer loading from an older summary should fetch latest summary",
			[
				{
					eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed",
					error: "disconnected",
				},
			],
			async function () {
				// TODO: This test is consistently failing when ran against FRS. See ADO:7895
				if (
					provider.driver.type === "routerlicious" &&
					provider.driver.endpointName === "frs"
				) {
					this.skip();
				}
				const summarizer1 = (await createSummarizer(provider, mainContainer)).summarizer;
				// Create a second summarizer. Note that this is done before posting a summary because the server may
				// delete this summary when a new one is posted.
				// This summarizer will be used later to generate a summary and validate that it fetches the latest summary.
				const { container: container2, summarizer: summarizer2 } = await createSummarizer(
					provider,
					mainContainer,
				);

				const versionWrap1 = await sendOpAndSummarize(summarizer1);
				assert(versionWrap1.fetchCount === 0, "No fetch should have happened");
				assert(versionWrap1.summaryVersion, "Summary version should be defined");
				summarizer1.close();

				// Reconnect the second summarizer's container so that it is elected as the summarizer client.
				await reconnectSummarizerToBeElected(container2);

				// Try to summarize with the second summarizer. This will fetch the latest snapshot on receiving the ack for the
				// above summary and then close.
				const versionWrap2 = await sendOpAndSummarize(summarizer2);

				assert(
					versionWrap2.error?.message === "disconnected",
					"The summarizer should have disconnected after fetching latest snapshot",
				);
				assert(versionWrap2.fetchCount === 1, "Fetch should have happened");
				assert.strictEqual(
					versionWrap2.fetchSnapshotRefSeq,
					versionWrap1.summaryRefSeq,
					"Fetch did not download latest snapshot",
				);
				summarizer2.close();
			},
		);

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
				const summarizer = (await createSummarizer(provider, mainContainer)).summarizer;

				// Second summary should be discarded
				const containerRuntime = (summarizer as any).runtime as ContainerRuntime;
				let uploadSummaryUploaderFunc = containerRuntime.storage.uploadSummaryWithContext;
				let lastSummaryVersion: string | undefined;
				const func = async (summary: ISummaryTree, context: ISummaryContext) => {
					uploadSummaryUploaderFunc = uploadSummaryUploaderFunc.bind(
						containerRuntime.storage,
					);
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

				const secondSummarizer = (
					await createSummarizer(provider, mainContainer, undefined, lastSummaryVersion)
				).summarizer;
				const versionWrap = await sendOpAndSummarize(secondSummarizer);
				assert(versionWrap.fetchCount === 0, "No fetch should have happened");
				secondSummarizer.close();
			},
		);
	},
);
