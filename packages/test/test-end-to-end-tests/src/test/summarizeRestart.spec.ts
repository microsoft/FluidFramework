/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizer,
	mockConfigProvider,
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

	it("Closes the summarizing client instead of refreshing", async () => {
		const container = await createContainer();
		const { container: summarizingContainer, summarizer } = await createSummarizer(
			provider,
			container,
			undefined,
			undefined,
			mockConfigProvider(settings),
		);

		await provider.ensureSynchronized();
		console.log("preSummary");
		const summarizeResults = summarizer.summarizeOnDemand({
			reason: "end-to-end test",
			refreshLatestAck: true,
		});
		await provider.ensureSynchronized();
		await summarizeResults.receivedSummaryAckOrNack;
		assert(summarizingContainer.closed === true, "Unknown acks should close the summarizer");
	});
});
