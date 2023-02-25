/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ISummarizer } from "@fluidframework/container-runtime";
import { createSummarizer, ITestObjectProvider, summarizeNow } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { benchmarkMemory, IMemoryTestObject } from "@fluid-tools/benchmark";
import { SharedMap } from "@fluidframework/map";
import { DocumentCreator } from "./DocumentCreator";

const testName = "Summarization  Medium Document- memory benchmarks";
describeNoCompat(testName, (getTestObjectProvider) => {
	let documentCreator: DocumentCreator;
	let provider: ITestObjectProvider;
	let summaryVersion: string;

	async function waitForSummary(summarizer: ISummarizer): Promise<string> {
		// Wait for all pending ops to be processed by all clients.
		await provider.ensureSynchronized();
		const summaryResult = await summarizeNow(summarizer);
		return summaryResult.summaryVersion;
	}

	before(async () => {
		provider = getTestObjectProvider();
		documentCreator = new DocumentCreator({
			testName,
			provider,
			documentSize: 1, // 1*5 = 5 MB
			driverEndpointName: provider.driver.endpointName,
			driverType: provider.driver.type,
		});
		await documentCreator.initializeDocument();
		assert(documentCreator.mainContainer !== undefined, "mainContainer needs to be defined.");
		const { summarizer: summarizerClient } = await createSummarizer(
			provider,
			documentCreator.mainContainer,
			undefined,
			undefined,
			undefined,
			documentCreator.logger,
		);
		await provider.ensureSynchronized();
		summaryVersion = await waitForSummary(summarizerClient);
		assert(summaryVersion !== undefined, "summaryVersion needs to be defined.");
		summarizerClient.close();
	});

	benchmarkMemory(
		new (class implements IMemoryTestObject {
			title = "Generate summary tree 5Mb document";
			dataObject2map: SharedMap | undefined;
			container2: IContainer | undefined;
			summarizerClient2: { container: IContainer; summarizer: ISummarizer } | undefined;
			key: string[] = [""];
			async run() {
				this.container2 = await documentCreator.loadDocument();
				await provider.ensureSynchronized();

				this.summarizerClient2 = await createSummarizer(
					provider,
					this.container2,
					summaryVersion,
					undefined,
					undefined,
					documentCreator.logger,
				);
				summaryVersion = await waitForSummary(this.summarizerClient2.summarizer);
				assert(summaryVersion !== undefined, "summaryVersion needs to be defined.");
				this.summarizerClient2.summarizer.close();
			}
			beforeIteration() {
				this.dataObject2map = undefined;
				this.container2 = undefined;
				this.summarizerClient2 = undefined;
				this.key = [""];
			}
		})(),
	);
});
