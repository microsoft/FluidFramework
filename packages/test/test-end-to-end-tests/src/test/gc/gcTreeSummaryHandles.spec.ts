/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	TestDataObjectType,
	describeCompat,
	itExpects,
} from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	type ISummarizer,
} from "@fluidframework/container-runtime/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import {
	type ISummaryContext,
	type ISummaryTree,
	type SummaryObject,
} from "@fluidframework/driver-definitions/internal";
import { gcTreeKey } from "@fluidframework/runtime-definitions/internal";
import {
	ITestFluidObject,
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
	waitForContainerConnection,
	type ITestContainerConfig,
} from "@fluidframework/test-utils/internal";

/**
 * Validates whether or not a GC Tree Summary Handle should be written to the summary.
 */
describeCompat(
	"GC Tree stored as a handle in summaries",
	"NoCompat",
	(getTestObjectProvider) => {
		const testContainerConfig: ITestContainerConfig = {
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: { state: "disabled" },
				},
			},
		};

		let provider: ITestObjectProvider;
		let mainContainer: IContainer;
		let summarizer1: ISummarizer;
		let dataStoreA: ITestFluidObject;
		let dataStoreB: ITestFluidObject;
		let dataStoreC: ITestFluidObject;

		async function submitSummaryAndValidateState(summarizer: ISummarizer, isHandle: boolean) {
			await provider.ensureSynchronized();
			const { summaryTree, summaryVersion } = await summarizeNow(summarizer);
			const gcObject: SummaryObject | undefined = summaryTree.tree[gcTreeKey];

			if (isHandle) {
				assert(gcObject.type === SummaryType.Handle, "Expected a gc handle!");
			} else {
				assert(gcObject.type === SummaryType.Tree, "Expected a gc blob!");
			}

			return { summaryTree, summaryVersion };
		}

		async function submitFailingSummary(summarizer: ISummarizer) {
			await provider.ensureSynchronized();
			const containerRuntime = (summarizer as any).runtime as ContainerRuntime;

			const errorMessage = "Upload summary force failure";
			const uploadSummaryUploaderFunc = containerRuntime.storage.uploadSummaryWithContext;
			const func = async (summary: ISummaryTree, context: ISummaryContext) => {
				throw new Error(errorMessage);
			};
			containerRuntime.storage.uploadSummaryWithContext = func;
			await assert.rejects(summarizeNow(summarizer), (e: Error) => e.message === errorMessage);
			containerRuntime.storage.uploadSummaryWithContext = uploadSummaryUploaderFunc;
		}

		beforeEach("setup", async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
			mainContainer = await provider.makeTestContainer(testContainerConfig);
			dataStoreA = (await mainContainer.getEntryPoint()) as ITestFluidObject;

			// Create data stores B and C, and mark them as referenced.
			const containerRuntime = dataStoreA.context.containerRuntime;
			dataStoreB = (await (
				await containerRuntime.createDataStore(TestDataObjectType)
			).entryPoint.get()) as ITestFluidObject;
			dataStoreA.root.set("dataStoreB", dataStoreB.handle);
			dataStoreC = (await (
				await containerRuntime.createDataStore(TestDataObjectType)
			).entryPoint.get()) as ITestFluidObject;
			dataStoreA.root.set("dataStoreC", dataStoreC.handle);

			await waitForContainerConnection(mainContainer);

			// A gc blob should be submitted as this is the first summary
			({ summarizer: summarizer1 } = await createSummarizer(provider, mainContainer));
			await submitSummaryAndValidateState(summarizer1, false /* isHandle */);
		});

		it("summarizes with GC handle when data store has changes but no reference is modified", async () => {
			// Make a change in dataStoreA.
			dataStoreA.root.set("key", "value");

			// Summarize and validate that a GC blob handle is generated.
			const summaryResult1 = await submitSummaryAndValidateState(
				summarizer1,
				true /* isHandle */,
			);
			summarizer1.close();

			// Load a new summarizerClient
			const { summarizer: summarizer2 } = await createSummarizer(
				provider,
				mainContainer,
				undefined /* config */,
				summaryResult1.summaryVersion,
			);

			// Summarize on a new summarizer client and validate that a GC blob handle is generated.
			const summaryResult2 = await submitSummaryAndValidateState(
				summarizer2,
				true /* isHandle */,
			);
			const tree1: SummaryObject | undefined = summaryResult1.summaryTree.tree[gcTreeKey];
			const tree2: SummaryObject | undefined = summaryResult2.summaryTree.tree[gcTreeKey];
			assert.deepEqual(
				tree1,
				tree2,
				"GC trees between containers should be the regardless of handle!",
			);
		});

		it("New gc blobs are submitted when handles are added and deleted", async () => {
			// Make a change in dataStoreA.
			dataStoreA.root.set("key", "value");

			// A gc blob handle should be submitted as there are no gc changes
			await submitSummaryAndValidateState(summarizer1, true /* isHandle */);

			// A new gc blob should be submitted as there is a deleted gc reference
			dataStoreA.root.delete("dataStoreC");

			// Summarize and validate that all data store entries are trees since a datastore reference has changed.
			await submitSummaryAndValidateState(summarizer1, false /* isHandle */);

			// A gc blob handle should be submitted as there are no gc changes
			await submitSummaryAndValidateState(summarizer1, true /* isHandle */);

			// Add a handle reference to dataStore C
			dataStoreA.root.set("dataStoreC", dataStoreC.handle);
			// A new gc blob should be submitted as there is a new gc reference
			await submitSummaryAndValidateState(summarizer1, false /* isHandle */);
		});

		itExpects(
			"GC blob handle written when summary fails",
			[
				{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel" },
				{ eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed" },
			],
			async () => {
				// Make a change in dataStoreA.
				dataStoreA.root.set("key", "value");

				await submitFailingSummary(summarizer1);

				// GC blob handle expected
				await submitSummaryAndValidateState(summarizer1, true /* isHandle */);
			},
		);

		itExpects(
			"GC blob written when summary fails",
			[
				{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel" },
				{ eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed" },
			],
			async () => {
				// Make a reference change by deleting a handle
				dataStoreA.root.delete("dataStoreB");

				await submitFailingSummary(summarizer1);

				// GC blob expected as the summary had changed
				await submitSummaryAndValidateState(summarizer1, false /* isHandle */);
			},
		);

		itExpects(
			"GC blob handle written when new summarizer loaded from last summary summarizes",
			[
				{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel" },
				{ eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed" },
			],
			async () => {
				await submitSummaryAndValidateState(summarizer1, true /* isHandle */);

				// Make a reference change by deleting a handle
				dataStoreA.root.delete("dataStoreB");

				await submitFailingSummary(summarizer1);

				// GC blob expected as the summary had changed
				const { summaryVersion } = await submitSummaryAndValidateState(
					summarizer1,
					false /* isHandle */,
				);

				summarizer1.close();
				const { summarizer: summarizer2 } = await createSummarizer(
					provider,
					mainContainer,
					undefined /* config */,
					summaryVersion,
				);

				// GC blob expected to be the same as the summary has not changed
				await submitSummaryAndValidateState(summarizer2, true /* isHandle */);
			},
		);
	},
);
