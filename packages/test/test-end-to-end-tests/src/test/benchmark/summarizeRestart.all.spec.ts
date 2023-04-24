/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
	EventAndErrorTrackingLogger,
	ITestObjectProvider,
	mockConfigProvider,
} from "@fluidframework/test-utils";
import { describeE2EDocRun, getCurrentBenchmarkType } from "@fluid-internal/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import {
	ContainerRuntime,
	DefaultSummaryConfiguration,
	ISummaryConfigurationHeuristics,
	ISummaryRuntimeOptions,
} from "@fluidframework/container-runtime";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	benchmarkAll,
	createDocument,
	IBenchmarkParameters,
	IDocumentLoaderAndSummarizer,
} from "./DocumentCreator";

const title = "Summarize Restart performance over multiple restarts";

const waitForSummaryAttempt = async (container: IContainer) => {
	await new Promise<void>((resolve, reject) => {
		let summarized = false;
		container.on("op", (op) => {
			if (op.type === "summarize") {
				summarized = true;
			} else if (summarized && op.type === "summaryAck") {
				resolve();
			} else if (op.type === "summaryNack") {
				resolve();
			}
		});
	});
};

const summaryUploadFail = async (summary: ISummaryTree, context: ISummaryContext) => {
	throw new Error("Summary should fail");
};

const summaryOptions: ISummaryRuntimeOptions = {
	summaryConfigOverrides: {
		...(DefaultSummaryConfiguration as ISummaryConfigurationHeuristics),
		maxIdleTime: 1 * 1000, // 1 second
		maxOps: 1, // Summarize every op
		minOpsForLastSummaryAttempt: 1,
		maxOpsSinceLastSummary: 1,
		nonRuntimeOpWeight: 1.0,
		nonRuntimeHeuristicThreshold: 1,
	},
};

describeE2EDocRun(title, (getTestObjectProvider, getDocumentInfo) => {
	let documentWrapper: IDocumentLoaderAndSummarizer;
	let provider: ITestObjectProvider;
	let summaryVersion: string;
	const benchmarkType = getCurrentBenchmarkType(describeE2EDocRun);
	const settings = {};

	beforeEach(async function () {
		provider = getTestObjectProvider();
		const docData = getDocumentInfo();
		if (
			docData.supportedEndpoints &&
			!docData.supportedEndpoints?.includes(provider.driver.type)
		) {
			this.skip();
		}

		documentWrapper = createDocument({
			testName: `${title} - ${docData.testTitle}`,
			provider,
			documentType: docData.documentType,
			benchmarkType,
			configProvider: mockConfigProvider(settings),
		});

		(provider.logger as EventAndErrorTrackingLogger).registerExpectedEvent({
			eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
			error: "Summary should fail",
		});
	});

	class PerformanceTestWrapper implements IBenchmarkParameters {
		minSampleCount?: number | undefined;
		container: IContainer | undefined;
		constructor(private readonly recoveryMethod: string) {}
		async run() {
			settings["Fluid.ContainerRuntime.Test.SummarizationRecoveryMethod"] =
				this.recoveryMethod;

			if (this.recoveryMethod !== "restart") {
				(provider.logger as EventAndErrorTrackingLogger).registerExpectedEvent(
					{
						eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
						error: "Summary should fail",
					},
					{
						eventName: "fluid:telemetry:Summarizer:Running:FailToSummarize",
						error: "Summary should fail",
					},
				);
			}

			await documentWrapper.initializeDocument();
			// Summarize the first time.
			await documentWrapper.summarize();
			assert(
				documentWrapper.mainContainer !== undefined,
				"mainContainer needs to be defined.",
			);
			const summarizerClient1 = await documentWrapper.summarize(summaryVersion);
			assert(
				summarizerClient1.summaryVersion !== undefined,
				"summaryVersion needs to be defined.",
			);
			summarizerClient1.container.close();
			documentWrapper.mainContainer.close();

			this.container = await documentWrapper.loadDocument(summaryOptions);
			await provider.ensureSynchronized();
			const datastore2 = await requestFluidObject<any>(this.container, "/");
			datastore2.root.set("opValue1", "something");
			await provider.ensureSynchronized();
			await waitForSummaryAttempt(this.container);

			// container 2 should be the parent summarizer now
			const summarizer = (this.container as any).context?.runtime?.summaryManager?.summarizer;
			assert(summarizer !== undefined, "Summarizer should be elected!");
			const summarizerRuntime = summarizer.runtime as ContainerRuntime;
			summarizerRuntime.storage.uploadSummaryWithContext = summaryUploadFail;

			datastore2.root.set("opValue2", "something1");
			await waitForSummaryAttempt(this.container);

			datastore2.root.set("opValue3", "hack again");
			await waitForSummaryAttempt(this.container);
		}
	}

	benchmarkAll("Summarize with restart recovery", new PerformanceTestWrapper("restart"));
	benchmarkAll("Summarize with refresh latest recovery", new PerformanceTestWrapper("default"));
});
