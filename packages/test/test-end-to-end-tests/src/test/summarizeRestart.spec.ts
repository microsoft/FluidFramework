/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { describeNoCompat, itExpects } from "@fluid-internal/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizer,
	mockConfigProvider,
	summarizeNow,
} from "@fluidframework/test-utils";

describeNoCompat("Summarizer closes instead of refreshing", (getTestObjectProvider) => {
	const settings = {};
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: { state: "disabled" },
			},
		},
		loaderProps: { configProvider: mockConfigProvider(settings) },
	};

	let provider: ITestObjectProvider;
	const createContainer = async (): Promise<IContainer> => {
		return provider.makeTestContainer(testContainerConfig);
	};

	beforeEach(async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
		settings["Fluid.ContainerRuntime.Test.SummarizationRecoveryMethod"] = "restart";
	});

	itExpects(
		"Closes the summarizing client instead of refreshing",
		[
			{
				eventName: "fluid:telemetry:ContainerRuntime:ClosingSummarizerOnSummaryStale",
				message: "Stopping fetch from storage",
			},
		],
		async () => {
			const container = await createContainer();
			const { container: summarizingContainer, summarizer } = await createSummarizer(
				provider,
				container,
				undefined,
				undefined,
				mockConfigProvider(settings),
			);

			await provider.ensureSynchronized();
			const summarizeResults = summarizer.summarizeOnDemand({
				reason: "end-to-end test",
				refreshLatestAck: true,
			});
			await provider.ensureSynchronized();
			await summarizeResults.receivedSummaryAckOrNack;
			assert(summarizingContainer.closed, "Unknown acks should close the summarizer");
			assert(!container.closed, "Original container should not be closed");
		},
	);

	itExpects(
		"Closes the summarizing client instead of refreshing with two clients",
		[
			{
				eventName: "fluid:telemetry:ContainerRuntime:ClosingSummarizerOnSummaryStale",
				message: "Stopping fetch from storage",
			},
			{
				eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_cancel",
				error: "Restarting summarizer instead of refreshing",
			},
		],
		async () => {
			const container = await createContainer();
			const { container: summarizingContainer, summarizer } = await createSummarizer(
				provider,
				container,
				undefined,
				undefined,
				mockConfigProvider(settings),
			);

			const { container: summarizingContainer2, summarizer: summarizer2 } =
				await createSummarizer(
					provider,
					container,
					undefined,
					undefined,
					mockConfigProvider(settings),
				);

			await summarizeNow(summarizer);
			await provider.ensureSynchronized();

			// This tells the summarizer to process the latest summary ack
			// This is because the second summarizer is not the elected summarizer and thus the summaryManager does not
			// tell the summarizer to process acks.
			await summarizer2.run("test");

			assert(summarizingContainer2.closed, "Unknown acks should close the summarizer");
			assert(!summarizingContainer.closed, "summarizer1 should not be closed");
			assert(!container.closed, "Original container should not be closed");
		},
	);

	itExpects(
		"Closes the summarizing client instead of refreshing when loading from an older summary",
		[
			{
				eventName: "fluid:telemetry:ContainerRuntime:ClosingSummarizerOnSummaryStale",
				message: "Stopping fetch from storage",
			},
			{
				eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_cancel",
				error: "Restarting summarizer instead of refreshing",
			},
		],
		async () => {
			const container = await createContainer();
			const { container: summarizingContainer, summarizer } = await createSummarizer(
				provider,
				container,
				undefined,
				undefined,
				mockConfigProvider(settings),
			);

			// summary1
			const { summaryVersion: summaryVersion1 } = await summarizeNow(summarizer);

			await provider.ensureSynchronized();
			// summary2
			await summarizeNow(summarizer);
			summarizer.close();
			summarizingContainer.close();

			const { container: summarizingContainer2, summarizer: summarizer2 } =
				await createSummarizer(
					provider,
					container,
					summaryVersion1,
					undefined,
					mockConfigProvider(settings),
				);

			await provider.ensureSynchronized();

			// This tells the summarizer to process the latest summary ack
			// This is because the second summarizer is not the elected summarizer and thus the summaryManager does not
			// tell the summarizer to process acks.
			await summarizer2.run("test");

			assert(summarizingContainer2.closed, "Unknown acks should close the summarizer");
			assert(summarizingContainer.closed, "summarizer1 should be closed");
			assert(!container.closed, "Original container should not be closed");
		},
	);
});
