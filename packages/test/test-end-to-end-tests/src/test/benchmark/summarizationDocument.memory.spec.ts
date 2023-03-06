/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ISummarizer } from "@fluidframework/container-runtime";
import { createSummarizer, ITestObjectProvider, summarizeNow } from "@fluidframework/test-utils";
import { benchmarkMemory, IMemoryTestObject } from "@fluid-tools/benchmark";
import { SharedMap } from "@fluidframework/map";
import { describeE2EDocsMemory, DescribeE2EDocInfo } from "@fluidframework/test-version-utils";
import { DocumentCreator } from "./DocumentCreator";
import { DocumentMap } from "./DocumentMap";

const scenarioTitle = "Summarize Document";
describeE2EDocsMemory(scenarioTitle, (getTestObjectProvider, getDocumentInfo) => {
	let documentMap: DocumentMap;
	let provider: ITestObjectProvider;
	let docData: DescribeE2EDocInfo;
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
			benchmarkType: "E2EMemory",
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

	benchmarkMemory(
		new (class implements IMemoryTestObject {
			title = scenarioTitle;
			dataObject2map: SharedMap | undefined;
			container: IContainer | undefined;
			summarizerClient: { container: IContainer; summarizer: ISummarizer } | undefined;
			async run() {
				this.container = await documentMap.loadDocument();
				assert(this.container !== undefined, "container needs to be defined.");
				await provider.ensureSynchronized();

				this.summarizerClient = await createSummarizer(
					provider,
					this.container,
					summaryVersion,
					undefined,
					undefined,
					documentMap.logger,
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
