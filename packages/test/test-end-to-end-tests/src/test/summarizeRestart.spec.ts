/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITestDataObject, describeNoCompat, itExpects } from "@fluid-internal/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizer,
	mockConfigProvider,
	summarizeNow,
} from "@fluidframework/test-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";

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
				eventName: "fluid:telemetry:Container:ContainerClose",
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

			const dataStore = await requestFluidObject<ITestDataObject>(container, "default");
			dataStore._root.set("an", "op");

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
				eventName: "fluid:telemetry:Container:ContainerClose",
				error: "Restarting summarizer instead of refreshing",
			},
			{
				eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_cancel",
				error: "Restarting summarizer instead of refreshing",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:HandleLastSummaryAckError",
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

			const dataStore = await requestFluidObject<ITestDataObject>(container, "default");
			dataStore._root.set("an", "op");

			await provider.ensureSynchronized();
			const container2 = summarizingContainer2 as any;
			// Intentional hack to allow two summaries to be submitted at the same time

			const summarizeResults = summarizer.summarizeOnDemand({ reason: "end-to-end test" });
			container2._clientId = (summarizer2 as any).runtime.summarizerClientId;

			const summarizeResults2 = summarizer2.summarizeOnDemand({ reason: "end-to-end test" });

			await Promise.all([
				summarizeResults.summarySubmitted,
				summarizeResults2.summarySubmitted,
			]);

			await Promise.all([
				summarizeResults.summaryOpBroadcasted,
				summarizeResults2.summaryOpBroadcasted,
			]);

			await Promise.all([
				summarizeResults.receivedSummaryAckOrNack,
				summarizeResults2.receivedSummaryAckOrNack,
			]);
			const ack = await summarizeResults.receivedSummaryAckOrNack;
			const nack = await summarizeResults2.receivedSummaryAckOrNack;

			await provider.ensureSynchronized();

			assert(ack.success, "Should be an ack");
			assert(!nack.success, "Should be a nack");
			assert(summarizingContainer2.closed, "Unknown acks should close the summarizer");
			assert(!summarizingContainer.closed, "summarizer1 should not be closed");
			assert(!container.closed, "Original container should not be closed");
		},
	);

	itExpects(
		"Closes the summarizing client instead of refreshing when loading from an older summary",
		[
			{
				eventName: "fluid:telemetry:Container:ContainerClose",
				error: "Restarting summarizer instead of refreshing",
			},
			{
				eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_cancel",
				error: "Restarting summarizer instead of refreshing",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:HandleLastSummaryAckError",
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
			const { summaryVersion } = await summarizeNow(summarizer);

			const dataStore = await requestFluidObject<ITestDataObject>(container, "default");
			dataStore._root.set("an", "op");

			await provider.ensureSynchronized();
			// s2
			await summarizeNow(summarizer);
			summarizer.close();
			summarizingContainer.close();

			const { container: summarizingContainer2, summarizer: summarizer2 } =
				await createSummarizer(
					provider,
					container,
					summaryVersion,
					undefined,
					mockConfigProvider(settings),
				);

			await provider.ensureSynchronized();
			await summarizer2.run("abc");

			assert(summarizingContainer2.closed, "Unknown acks should close the summarizer");
			assert(summarizingContainer.closed, "summarizer1 should be closed");
			assert(!container.closed, "Original container should not be closed");
		},
	);
});
