/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ISummarizer } from "@fluidframework/container-runtime";
import { createSummarizer, ITestObjectProvider, summarizeNow } from "@fluidframework/test-utils";
import { SharedMap } from "@fluidframework/map";
import {
	describeE2EDocRun,
	describeE2EDocsMemory,
	BenchmarkType,
} from "@fluidframework/test-version-utils";
import { benchmarkFull, DocumentCreator } from "./DocumentCreator";
import { DocumentMap } from "./DocumentMap";

const scenarioTitle = "Summarize Document";
describeE2EDocRun(scenarioTitle, (getTestObjectProvider, getDocumentInfo) => {
	let documentMap: DocumentMap;
	let provider: ITestObjectProvider;
	let summaryVersion: string;
	const benchmarkType: BenchmarkType =
		describeE2EDocRun === describeE2EDocsMemory ? "E2EMemory" : "E2ETime";
	async function waitForSummary(summarizer: ISummarizer): Promise<string> {
		// Wait for all pending ops to be processed by all clients.
		await provider.ensureSynchronized();
		const summaryResult = await summarizeNow(summarizer);
		return summaryResult.summaryVersion;
	}

	before(async () => {
		provider = getTestObjectProvider();
		const docData = getDocumentInfo();
		documentMap = DocumentCreator.create({
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

	class benchmarkObj {
		dataObject2map: SharedMap | undefined;
		container: IContainer | undefined;
		summarizerClient: { container: IContainer; summarizer: ISummarizer } | undefined;
		minSampleCount = 10;
	}

	const t = new benchmarkObj();

	benchmarkFull<benchmarkObj>(
		benchmarkType,
		scenarioTitle,
		async () => {
			t.container = await documentMap.loadDocument();
			assert(t.container !== undefined, "container needs to be defined.");
			await provider.ensureSynchronized();

			t.summarizerClient = await createSummarizer(
				provider,
				t.container,
				summaryVersion,
				undefined,
				undefined,
				documentMap.logger,
			);
			summaryVersion = await waitForSummary(t.summarizerClient.summarizer);
			assert(summaryVersion !== undefined, "summaryVersion needs to be defined.");
			t.summarizerClient.summarizer.close();
		},
		t,
		() => {
			t.dataObject2map = undefined;
			t.container = undefined;
			t.summarizerClient = undefined;
		},
	);
});
