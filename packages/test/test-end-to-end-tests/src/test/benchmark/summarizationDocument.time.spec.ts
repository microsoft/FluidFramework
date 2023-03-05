/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { ISummarizer } from "@fluidframework/container-runtime";
import { createSummarizer, ITestObjectProvider, summarizeNow } from "@fluidframework/test-utils";
import { describeE2EDocsRuntime, DescribeE2EDocInfo } from "@fluidframework/test-version-utils";
import { benchmark } from "@fluid-tools/benchmark";
import { DocumentCreator } from "./DocumentCreator";
import { DocumentMap } from "./DocumentMap";

const scenarioTitle = "Summarize Document";
describeE2EDocsRuntime(scenarioTitle, (getTestObjectProvider, getDocumentInfo) => {
	let documentMap: DocumentMap;
	let provider: ITestObjectProvider;
	let docData: DescribeE2EDocInfo | undefined;
	let summaryVersion: string;

	async function waitForSummary(summarizer: ISummarizer): Promise<string> {
		// Wait for all pending ops to be processed by all clients.
		await provider.ensureSynchronized();
		const summaryResult = await summarizeNow(summarizer);
		return summaryResult.summaryVersion;
	}

	before(async () => {
		provider = getTestObjectProvider();
		assert(getDocumentInfo !== undefined, "documentType needs to be defined.");
		docData = getDocumentInfo();

		documentMap = DocumentCreator.create({
			testName: `${scenarioTitle} - ${docData.testTitle}`,
			provider,
			documentType: docData.documentType,
			driverEndpointName: provider.driver.endpointName,
			driverType: provider.driver.type,
			benchmarkType: "E2ETime",
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
		summaryVersion = await waitForSummary(summarizerClient);
		assert(summaryVersion !== undefined, "summaryVersion needs to be defined.");
		summarizerClient.close();
	});

	benchmark({
		title: scenarioTitle,
		benchmarkFnAsync: async () => {
			const container = await documentMap.loadDocument();
			await provider.ensureSynchronized();

			const { summarizer: summarizerClient } = await createSummarizer(
				provider,
				container,
				summaryVersion,
				undefined,
				undefined,
				documentMap.logger,
			);
			assert(summarizerClient !== undefined, "summarizer needs to be defined.");

			summaryVersion = await waitForSummary(summarizerClient);
			assert(summaryVersion !== undefined, "summaryVersion needs to be defined.");
			summarizerClient.close();
		},
	});
});
