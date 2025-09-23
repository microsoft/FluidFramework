/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import {
	loadSummarizerContainerAndMakeSummary,
	ILoadExistingContainerProps,
} from "@fluidframework/container-loader/internal";
import type {
	SubmitSummaryResult,
	SubmitSummaryFailureData,
	ISubmitSummaryOpResult,
	IBroadcastSummaryResult,
	IAckSummaryResult,
	INackSummaryResult,
	SummarizeResultPart,
} from "@fluidframework/container-runtime/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	createLoaderProps,
	ITestContainerConfig,
	ITestFluidObject,
	DataObjectFactoryType,
} from "@fluidframework/test-utils/internal";

function isSubmitOpResult(data: SubmitSummaryResult): data is ISubmitSummaryOpResult {
	return data.stage === "submit";
}
function isAckSuccess(
	data: IAckSummaryResult | INackSummaryResult,
): data is IAckSummaryResult {
	return (data as IAckSummaryResult).summaryAckOp !== undefined;
}

describeCompat("on-demand summarizer api", "NoCompat", (getTestObjectProvider, apis) => {
	let logger: MockLogger;

	beforeEach(() => {
		logger = new MockLogger();
	});

	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
	};

	async function buildLoadProps(): Promise<ILoadExistingContainerProps> {
		const provider = getTestObjectProvider();
		const container = await provider.makeTestContainer(testContainerConfig);
		const entry = (await container.getEntryPoint()) as ITestFluidObject;
		assert(entry !== undefined, "entry point must resolve");
		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "container must have url");
		const loaderProps = createLoaderProps(
			[[provider.defaultCodeDetails, provider.createFluidEntryPoint(testContainerConfig)]],
			provider.documentServiceFactory,
			provider.urlResolver,
		);
		return { ...loaderProps, request: { url }, logger };
	}

	it("summarizes successfully (gate off)", async () => {
		const props = await buildLoadProps();
		const result = await loadSummarizerContainerAndMakeSummary(props);
		assert(result.success, "expected summarization success");
		assert(result.summaryResults !== undefined, "expected summaryResults");
		const submit = result.summaryResults.summarySubmitted as SummarizeResultPart<
			SubmitSummaryResult,
			SubmitSummaryFailureData
		>;
		assert(submit.success, "expected submit stage success");
		assert(submit.data.stage === "submit", "submit stage value");
		assert(isSubmitOpResult(submit.data), "expected submit op result");
		assert(submit.data.summaryTree !== undefined, "summary tree should exist");
		const broadcast = result.summaryResults
			.summaryOpBroadcasted as SummarizeResultPart<IBroadcastSummaryResult>;
		assert(broadcast.success, "expected broadcast stage success");
		const ackNack = result.summaryResults.receivedSummaryAckOrNack as SummarizeResultPart<
			IAckSummaryResult,
			INackSummaryResult
		>;
		assert(ackNack.success, "expected ack/nack stage success");
		assert(isAckSuccess(ackNack.data), "expected ack variant (no summaryAckOp)");
		assert(ackNack.data.summaryAckOp.contents.handle, "ack should have summaryAckOp handle");
		const created = logger.events.filter(
			(e) => e.eventName === "fluid:telemetry:SummarizerOnDemand:summarizerContainer_created",
		);
		const closed = logger.events.filter(
			(e) => e.eventName === "fluid:telemetry:SummarizerOnDemand:summarizerContainer_closed",
		);
		assert.strictEqual(created.length, 1, "created telemetry missing");
		assert.strictEqual(closed.length, 1, "closed telemetry missing");
		assert.strictEqual(closed[0].success, true, "closed event should indicate success");
	});

	it("summarizes successfully with fullTree gate on", async () => {
		const props = await buildLoadProps();
		const configProvider = {
			getRawConfig: (key: string) =>
				key === "Fluid.Summarizer.FullTree.OnDemand" ? true : undefined,
		};
		const result = await loadSummarizerContainerAndMakeSummary({
			...props,
			logger,
			configProvider,
		});
		assert(result.success, "expected summarization success with gate");
		assert(result.summaryResults !== undefined, "expected summaryResults with gate");
		const submit = result.summaryResults.summarySubmitted as SummarizeResultPart<
			SubmitSummaryResult,
			SubmitSummaryFailureData
		>;
		assert(submit.success, "expected submit stage success (gate)");
		assert(submit.data.stage === "submit", "submit stage value (gate)");
		assert(isSubmitOpResult(submit.data), "expected submit op result (gate)");
		assert(submit.data.summaryTree !== undefined, "summary tree should exist (gate)");
		const broadcast = result.summaryResults
			.summaryOpBroadcasted as SummarizeResultPart<IBroadcastSummaryResult>;
		assert(broadcast.success, "expected broadcast stage success (gate)");
		const ackNack = result.summaryResults.receivedSummaryAckOrNack as SummarizeResultPart<
			IAckSummaryResult,
			INackSummaryResult
		>;
		assert(ackNack.success, "expected ack/nack stage success (gate)");
		assert(isAckSuccess(ackNack.data), "expected ack success variant (gate)");
		assert(
			ackNack.data.summaryAckOp.contents.handle,
			"ack should have summaryAckOp handle (gate)",
		);
		const closed = logger.events.filter(
			(e) => e.eventName === "fluid:telemetry:SummarizerOnDemand:summarizerContainer_closed",
		);
		assert.strictEqual(closed.length, 1, "closed telemetry missing (gate)");
		assert.strictEqual(closed[0].success, true, "closed event should indicate success (gate)");
	});
});
