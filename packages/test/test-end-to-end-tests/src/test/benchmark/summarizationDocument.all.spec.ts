/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeE2EDocs } from "@fluid-private/test-version-utils";
import { BenchmarkMode, currentBenchmarkMode } from "@fluid-tools/benchmark";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { delay } from "@fluidframework/core-utils/internal";
import { ITestObjectProvider } from "@fluidframework/test-utils/internal";

import {
	IBenchmarkParameters,
	IDocumentLoaderAndSummarizer,
	ISummarizeResult,
	benchmarkAll,
	createDocument,
} from "./DocumentCreator.js";

const scenarioTitle = "Summarize Document";
describeE2EDocs(scenarioTitle, (getTestObjectProvider, getDocumentInfo) => {
	let documentWrapper: IDocumentLoaderAndSummarizer;
	let provider: ITestObjectProvider;
	let summaryVersion: string;

	beforeEach(async function () {
		provider = getTestObjectProvider();
		const docData = getDocumentInfo(); // returns the type of document to be processed.
		if (
			docData.supportedEndpoints &&
			!docData.supportedEndpoints?.includes(provider.driver.type)
		) {
			this.skip();
		}
		documentWrapper = createDocument({
			testName: `${scenarioTitle} - ${docData.testTitle}`,
			provider,
			documentType: docData.documentType,
			documentTypeInfo: docData.documentTypeInfo,
		});
		await documentWrapper.initializeDocument();
		// Summarize the first time.
		const lastSummarizeClient = await documentWrapper.summarize(
			documentWrapper.mainContainer,
			undefined,
			/* close container */ true,
		);
		summaryVersion = lastSummarizeClient.summaryVersion;
	});

	/**
	 * The PerformanceTestWrapper class includes 2 functionalities:
	 * 1) Store any objects that should not be garbage collected during the benchmark execution (specific for memory tests).
	 * 2) Stores the configuration properties that should be consumed by benchmarkAll to define its behavior:
	 * a. Benchmark Time tests: {@link https://benchmarkjs.com/docs#options} or  {@link BenchmarkOptions}
	 * b. Benchmark Memory tests: {@link MemoryTestObjectProps}
	 */

	benchmarkAll(scenarioTitle, () => {
		return new (class PerformanceTestWrapper implements IBenchmarkParameters {
			container: IContainer | undefined;
			summarizerClient: ISummarizeResult | undefined;
			minSampleCount = getDocumentInfo().minSampleCount;
			async run(): Promise<void> {
				this.container = await documentWrapper.loadDocument();
				assert(this.container !== undefined, "container needs to be defined.");
				await provider.ensureSynchronized();
				assert(this.container.closed !== true, "container needs to be open.");
				try {
					this.summarizerClient = await documentWrapper.summarize(
						this.container,
						summaryVersion,
						/* close container */ false,
					);

					assert(
						this.summarizerClient.summaryVersion !== undefined,
						"summaryVersion needs to be defined.",
					);
					summaryVersion = this.summarizerClient.summaryVersion;
					this.summarizerClient.summarizer.close();
				} catch (error) {
					throw new Error(`Error summarizing: ${error}`);
				}
				this.container.close();
			}
			async before(): Promise<void> {
				this.container = undefined;
				this.summarizerClient = undefined;
				if (currentBenchmarkMode === BenchmarkMode.Performance) {
					// TODO: this should be removed, or document why it exists
					await delay(2000);
				}
			}
		})();
	});
});
