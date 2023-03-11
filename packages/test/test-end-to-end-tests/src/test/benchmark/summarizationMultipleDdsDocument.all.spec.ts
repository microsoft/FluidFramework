/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ISummarizer } from "@fluidframework/container-runtime";
import {
	createSummarizerFromFactory,
	ITestObjectProvider,
	summarizeNow,
} from "@fluidframework/test-utils";
import { describeE2EDocRun, getCurrentBenchmarkType } from "@fluidframework/test-version-utils";
import { benchmarkAll, createDocument } from "./DocumentCreator";
import { DocumentMultipleDds } from "./DocumentMultipleDds";

const scenarioTitle = "Summarize Multiple DDSs Document";
describeE2EDocRun(
	scenarioTitle,
	(getTestObjectProvider, getDocumentInfo) => {
		let documentMultipleDDS: DocumentMultipleDds;
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
			documentMultipleDDS = createDocument({
				testName: `${scenarioTitle} - ${docData.testTitle}`,
				provider,
				documentType: docData.documentType,
				benchmarkType,
			}) as DocumentMultipleDds;
			await documentMultipleDDS.initializeDocument();
			assert(
				documentMultipleDDS.mainContainer !== undefined,
				"mainContainer needs to be defined.",
			);
			assert(
				documentMultipleDDS.dataObjectFactory !== undefined,
				"dataObjectFactory needs to be defined.",
			);

			await provider.ensureSynchronized();

			const { summarizer: summarizer1 } = await createSummarizerFromFactory(
				provider,
				documentMultipleDDS.mainContainer,
				documentMultipleDDS.dataObjectFactory,
			);

			summaryVersion = await waitForSummary(summarizer1);
			assert(summaryVersion !== undefined, "summary version needs to be valid");
			summarizer1.close();
		});

		class BenchmarkObj {
			container: IContainer | undefined;
			summarizerClient: { container: IContainer; summarizer: ISummarizer } | undefined;
			minSampleCount = 1;
		}
		const obj = new BenchmarkObj();

		benchmarkAll<BenchmarkObj>(scenarioTitle, benchmarkType, {
			run: async () => {
				obj.container = await documentMultipleDDS.loadDocument();
				assert(obj.container !== undefined, "container needs to be defined.");
				console.log("Before summarizer");
				obj.summarizerClient = await createSummarizerFromFactory(
					provider,
					obj.container,
					documentMultipleDDS.dataObjectFactory,
					summaryVersion,
					undefined,
					undefined,
					documentMultipleDDS.logger,
				);
				console.log("Waiting for summarizer");

				summaryVersion = await waitForSummary(obj.summarizerClient.summarizer);
				console.log("Done Waiting for summarizer");
				assert(summaryVersion !== undefined, "summaryVersion needs to be defined.");
				obj.summarizerClient.summarizer.close();
			},
			obj,
			beforeIteration: () => {
				obj.container = undefined;
				obj.summarizerClient = undefined;
			},
		});
	},
	[
		{
			testTitle: "1500 DDSs",
			documentType: "MediumDocumentMultipleDDSs",
		},
		{
			testTitle: "2000 DDSs",
			documentType: "LargeDocumentMultipleDDSs",
		},
	],
);
