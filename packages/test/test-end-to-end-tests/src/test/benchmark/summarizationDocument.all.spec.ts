/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeE2EDocRun, getCurrentBenchmarkType } from "@fluidframework/test-version-utils";
import {
	benchmarkAll,
	createDocument,
	IDocumentLoaderAndSummarizer,
	ISummarizeResult,
} from "./DocumentCreator";

const scenarioTitle = "Summarize Document";
describeE2EDocRun(scenarioTitle, (getTestObjectProvider, getDocumentInfo) => {
	let documentWrapper: IDocumentLoaderAndSummarizer;
	let provider: ITestObjectProvider;
	let summaryVersion: string;
	const benchmarkType = getCurrentBenchmarkType(describeE2EDocRun);

	before(async () => {
		provider = getTestObjectProvider();
		const docData = getDocumentInfo(); // returns the type of document to be processed.
		documentWrapper = createDocument({
			testName: `${scenarioTitle} - ${docData.testTitle}`,
			provider,
			documentType: docData.documentType,
			benchmarkType,
		});
		await documentWrapper.initializeDocument();
		// Summarize the first time.
		await documentWrapper.summarize();
	});

	/**
	 * The PerformanceTestWrapper class includes 2 functionalities:
	 * 1) Store any objects that should not be garbage collected during the benchmark execution (specific for memory tests).
	 * 2) Stores the configuration properties that should be consumed by benchmarkAll to define its behavior:
	 * a. Benchmark Time tests: {@link https://benchmarkjs.com/docs#options} or  {@link BenchmarkOptions}
	 * b. Benchmark Memory tests: {@link MemoryTestObjectProps}
	 */
	class PerformanceTestWrapper {
		container: IContainer | undefined;
		summarizerClient: ISummarizeResult | undefined;
		minSampleCount = getDocumentInfo().minSampleCount;
	}

	const obj = new PerformanceTestWrapper();

	benchmarkAll(scenarioTitle, obj, {
		run: async () => {
			obj.container = await documentWrapper.loadDocument();
			assert(obj.container !== undefined, "container needs to be defined.");
			await provider.ensureSynchronized();

			obj.summarizerClient = await documentWrapper.summarize(summaryVersion);
			assert(
				obj.summarizerClient.summaryVersion !== undefined,
				"summaryVersion needs to be defined.",
			);
			summaryVersion = obj.summarizerClient.summaryVersion;
		},
		beforeIteration: () => {
			obj.container = undefined;
			obj.summarizerClient = undefined;
		},
	});
});
