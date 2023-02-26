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

const testName = "Generate summary tree 10Mb document";
describeNoCompat("Summarization  Larger Document- memory benchmarks", (getTestObjectProvider) => {
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
			documentType: "LargeDocumentMap",
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
			title = testName;
			dataObject2map: SharedMap | undefined;
			container: IContainer | undefined;
			summarizerClient: { container: IContainer; summarizer: ISummarizer } | undefined;
			async run() {
				this.container = await documentCreator.loadDocument();
				assert(this.container !== undefined, "container needs to be defined.");
				await provider.ensureSynchronized();

				this.summarizerClient = await createSummarizer(
					provider,
					this.container,
					summaryVersion,
					undefined,
					undefined,
					documentCreator.logger,
				);
				summaryVersion = await waitForSummary(this.summarizerClient.summarizer);
				assert(summaryVersion !== undefined, "summaryVersion needs to be defined.");
				this.summarizerClient.summarizer.close();
			}
			beforeIteration() {
				this.dataObject2map = undefined;
				this.container = undefined;
				this.summarizerClient = undefined;
			}
		})(),
	);
});
