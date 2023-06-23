/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import {
	ITestContainerConfig,
	mockConfigProvider,
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
} from "@fluidframework/test-utils";

describeNoCompat("Summarizer can refresh a snapshot from the server", (getTestObjectProvider) => {
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
	});

	it("The summarizing client can refresh from an unexpected ack", async () => {
		const container = await createContainer();
		const { container: summarizingContainer, summarizer } = await createSummarizer(
			provider,
			container,
			testContainerConfig,
			undefined,
			undefined,
		);

		await provider.ensureSynchronized();
		const { summaryVersion } = await summarizeNow(summarizer);
		assert(!summarizingContainer.closed, "Refreshing acks should not close the summarizer");
		assert(!container.closed, "Original container should not be closed");

		await summarizeNow(summarizer);
		summarizer.stop("summarizerClientDisconnected");
		summarizer.close();
		await createSummarizer(provider, container, undefined, summaryVersion);
		await provider.ensureSynchronized();
	});
});
