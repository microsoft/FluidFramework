/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { IContainer, DisconnectReason } from "@fluidframework/container-definitions/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizer,
	createTestConfigProvider,
	summarizeNow,
} from "@fluidframework/test-utils/internal";

import { reconnectSummarizerToBeElected } from "../gc/index.js";

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
		const summarizerContainerConfig: ITestContainerConfig = {
			loaderProps: { configProvider },
		};

		let provider: ITestObjectProvider;

		const createContainer = async (): Promise<IContainer> => {
			return provider.makeTestContainer(testContainerConfig);
		};

		beforeEach("setup", async function () {
			provider = getTestObjectProvider({ syncSummarizer: true });
			// Run these tests only for Local and ODSP drivers. Ideally we only need to run tests with local server since we are only testing the summarizer's logic independednt of the service,
			// but keeping ODSP in the mix to also test code with single commit summaries. (ODSP has single commit summaries enabled by default)
			if (!["local", "odsp"].includes(provider.driver.type)) {
				this.skip();
			}
			configProvider.set("Fluid.ContainerRuntime.Test.CloseSummarizerDelayOverrideMs", 0);
		});

		afterEach(() => {
			configProvider.clear();
		});

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
				const { container: summarizingContainer1, summarizer: summarizer1 } =
					await createSummarizer(provider, container, summarizerContainerConfig);

				// summary1
				const { summaryVersion: summaryVersion1 } = await summarizeNow(summarizer1);

				// Create a second summarizer. Note that this is done before posting a summary because the server may
				// delete this summary when a new one is posted.
				// This summarizer will be used later to generate a summary and validate that it fetches the latest summary.
				const { container: summarizingContainer2, summarizer: summarizer2 } =
					await createSummarizer(
						provider,
						container,
						summarizerContainerConfig,
						summaryVersion1,
					);

				// summary2
				await summarizeNow(summarizer1);
				summarizer1.close();
				summarizingContainer1.close(DisconnectReason.Expected);

				// Reconnect the second summarizer's container so that it is elected as the summarizer client.
				await reconnectSummarizerToBeElected(summarizingContainer2);

				// This tells the summarizer to process the latest summary ack
				// This is because the second summarizer is not the elected summarizer and thus the summaryManager does not
				// tell the summarizer to process acks.
				await summarizer2.run("test");

				assert(
					summarizingContainer2.closed,
					"Untracked summary's acks should close the summarizer",
				);
				assert(summarizingContainer1.closed, "summarizer1 should be closed");
				assert(!container.closed, "Original container should not be closed");
			},
		);
	},
);
