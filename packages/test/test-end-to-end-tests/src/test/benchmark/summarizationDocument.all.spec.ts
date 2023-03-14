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
	let document: IDocumentLoaderAndSummarizer;
	let provider: ITestObjectProvider;
	let summaryVersion: string;
	const benchmarkType = getCurrentBenchmarkType(describeE2EDocRun);

	before(async () => {
		provider = getTestObjectProvider();
		const docData = getDocumentInfo(); // returns the type of document to be processed.
		document = createDocument({
			testName: `${scenarioTitle} - ${docData.testTitle}`,
			provider,
			documentType: docData.documentType,
			benchmarkType,
		});
		await document.initializeDocument();
		// Summarize the first time.
		await document.summarize();
	});

	class BenchmarkObj {
		container: IContainer | undefined;
		summarizerClient: ISummarizeResult | undefined;
		minSampleCount = getDocumentInfo().minSampleCount;
	}

	const obj = new BenchmarkObj();

	benchmarkAll<BenchmarkObj>(scenarioTitle, {
		run: async () => {
			obj.container = await document.loadDocument();
			assert(obj.container !== undefined, "container needs to be defined.");
			await provider.ensureSynchronized();

			obj.summarizerClient = await document.summarize(summaryVersion);
			assert(
				obj.summarizerClient.summaryVersion !== undefined,
				"summaryVersion needs to be defined.",
			);
			summaryVersion = obj.summarizerClient.summaryVersion;
		},
		obj,
		beforeIteration: () => {
			obj.container = undefined;
			obj.summarizerClient = undefined;
		},
	});
});
