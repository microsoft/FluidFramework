/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import {
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	createTestConfigProvider,
	createSummarizer,
	summarizeNow,
} from "@fluidframework/test-utils";
import { DefaultSummaryConfiguration } from "@fluidframework/container-runtime";

describeCompat(
	"Summarizer closes instead of refreshing",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { SharedCounter } = apis.dds;

		const configProvider = createTestConfigProvider();
		const testContainerConfig: ITestContainerConfig = {
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: { state: "disabled" },
				},
			},
			loaderProps: { configProvider },
			registry: [[SharedCounter.getFactory().type, SharedCounter.getFactory()]],
		};
		const summarizerContainerConfig: ITestContainerConfig = { loaderProps: { configProvider } };

		let provider: ITestObjectProvider;

		const createContainer = async (): Promise<IContainer> => {
			return provider.makeTestContainer(testContainerConfig);
		};

		beforeEach("setup", async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
			configProvider.set("Fluid.ContainerRuntime.Test.CloseSummarizerDelayOverrideMs", 100);
		});

		afterEach(() => {
			configProvider.clear();
		});

		itExpects(
			"Closes the summarizing client instead of refreshing",
			[
				{
					eventName:
						"fluid:telemetry:Summarizer:Running:RefreshLatestSummaryFromServerFetch_end",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerDispose",
					category: "generic",
				},
				{
					eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
					category: "generic",
					error: "summary state stale - Unsupported option 'refreshLatestAck'",
				},
				{
					eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed",
					error: "summary state stale - Unsupported option 'refreshLatestAck'",
				},
			],
			async () => {
				const container = await createContainer();
				const { container: summarizingContainer, summarizer } = await createSummarizer(
					provider,
					container,
					summarizerContainerConfig,
				);

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
					eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_end",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerDispose",
					category: "generic",
				},
			],
			async () => {
				const container = await createContainer();
				const { container: summarizingContainer, summarizer } = await createSummarizer(
					provider,
					container,
					summarizerContainerConfig,
				);

				const { container: summarizingContainer2, summarizer: summarizer2 } =
					await createSummarizer(provider, container, summarizerContainerConfig);

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
					eventName: "fluid:telemetry:Container:ContainerDispose",
					category: "generic",
				},
			],
			async () => {
				const container = await createContainer();
				const { container: summarizingContainer, summarizer } = await createSummarizer(
					provider,
					container,
					summarizerContainerConfig,
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
						summarizerContainerConfig,
						summaryVersion1,
					);

				// This tells the summarizer to process the latest summary ack
				// This is because the second summarizer is not the elected summarizer and thus the summaryManager does not
				// tell the summarizer to process acks.
				await summarizer2.run("test");

				assert(summarizingContainer2.closed, "Unknown acks should close the summarizer");
				assert(summarizingContainer.closed, "summarizer1 should be closed");
				assert(!container.closed, "Original container should not be closed");
			},
		);

		itExpects(
			"Closes the summarizing client instead of refreshing when failing to summarize",
			[
				{ eventName: "fluid:telemetry:Summarizer:Running:GarbageCollection_cancel" },
				{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel" },
				{
					eventName:
						"fluid:telemetry:Summarizer:Running:RefreshLatestSummaryFromServerFetch_end",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerDispose",
					category: "generic",
				},
				{
					eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
					category: "generic",
					error: "summary state stale - Unsupported option 'refreshLatestAck'",
				},
				{
					eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed",
					error: "summary state stale - Unsupported option 'refreshLatestAck'",
				},
			],
			async () => {
				const container = await createContainer();
				const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
				const counter = SharedCounter.create(dataObject.runtime, "counter");
				dataObject.root.set("counter", counter.handle);

				// summary1
				await provider.ensureSynchronized();

				const summaryConfigOverrides = {
					...DefaultSummaryConfiguration,
					maxOps: 1,
				};

				const configWithMissingChannelFactory: ITestContainerConfig = {
					...testContainerConfig,
					runtimeOptions: {
						summaryOptions: {
							summaryConfigOverrides,
						},
					},
					registry: [], // omit the sharedCounter factory from the registry to cause a summarization error
				};

				const { container: summarizingContainer, summarizer } = await createSummarizer(
					provider,
					container,
					configWithMissingChannelFactory,
				);

				await provider.ensureSynchronized();

				// The summarizer should now fail as we have a missing channel factory
				await summarizer.run("test");
				await provider.ensureSynchronized();

				assert(
					summarizingContainer.closed,
					"summarizer should be closed after failing to summarize",
				);
				assert(!container.closed, "Original container should not be closed");
			},
		);
	},
);
