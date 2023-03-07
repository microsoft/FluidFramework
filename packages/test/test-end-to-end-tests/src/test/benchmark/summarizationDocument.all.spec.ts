/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ISummarizer } from "@fluidframework/container-runtime";
import { createSummarizer, ITestObjectProvider, summarizeNow } from "@fluidframework/test-utils";
import { SharedMap } from "@fluidframework/map";
import { describeE2EDocRun, getCurrentBenchmarkType } from "@fluidframework/test-version-utils";
import { benchmarkFull, createDocument } from "./DocumentCreator";
import { DocumentMap } from "./DocumentMap";

const scenarioTitle = "Summarize Document";
describeE2EDocRun(scenarioTitle, (getTestObjectProvider, getDocumentInfo) => {
	let documentMap: DocumentMap;
	let provider: ITestObjectProvider;
	let summaryVersion: string;
	const benchmarkType = getCurrentBenchmarkType(describeE2EDocRun);
	async function waitForSummary(summarizer: ISummarizer): Promise<string> {
		// Wait for all pending ops to be processed by all clients.
		await provider.ensureSynchronized();
		const summaryResult = await summarizeNow(summarizer);
		return summaryResult.summaryVersion;
	}

	before(async () => {
		provider = getTestObjectProvider();
		const docData = getDocumentInfo(); // returns the type of document to be processed.
		documentMap = createDocument({
			testName: `${scenarioTitle} - ${docData.testTitle}`,
			provider,
			documentType: docData.documentType,
			benchmarkType,
		});
		await documentMap.initializeDocument();
		assert(documentMap.mainContainer !== undefined, "mainContainer needs to be defined.");
		const { summarizer: summarizerClient } = await createSummarizer(
			provider,
			documentMap.mainContainer,
			undefined,
			undefined,
			undefined,
			documentMap.logger,
		);
		await provider.ensureSynchronized();
		summaryVersion = await waitForSummary(summarizerClient);
		assert(summaryVersion !== undefined, "summaryVersion needs to be defined.");
		summarizerClient.close();
	});

	class BenchmarkObj {
		dataObject2map: SharedMap | undefined;
		container: IContainer | undefined;
		summarizerClient: { container: IContainer; summarizer: ISummarizer } | undefined;
		minSampleCount = 10;
	}

	const obj = new BenchmarkObj();

	benchmarkFull<BenchmarkObj>(scenarioTitle, benchmarkType, {
		run: async () => {
			obj.container = await documentMap.loadDocument();
			assert(obj.container !== undefined, "container needs to be defined.");
			await provider.ensureSynchronized();

			obj.summarizerClient = await createSummarizer(
				provider,
				obj.container,
				summaryVersion,
				undefined,
				undefined,
				documentMap.logger,
			);
			summaryVersion = await waitForSummary(obj.summarizerClient.summarizer);
			assert(summaryVersion !== undefined, "summaryVersion needs to be defined.");
			obj.summarizerClient.summarizer.close();
		},
		obj,
		beforeIteration: () => {
			obj.dataObject2map = undefined;
			obj.container = undefined;
			obj.summarizerClient = undefined;
		},
	});
});
