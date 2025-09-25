/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import {
	loadSummarizerContainerAndMakeSummary,
	type ILoadExistingContainerProps,
	type LoadSummarizerSummaryResult,
	type SubmitSummaryResult,
	type ISubmitSummaryOpResult,
	type SummarizeResultPart,
} from "@fluidframework/container-loader/internal";
import { ISummaryConfigurationWithSummaryOnRequest } from "@fluidframework/container-runtime/internal";
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

function expectSummarySuccess<TSuccess, TFailure>(
	result: SummarizeResultPart<TSuccess, TFailure>,
	message: string,
): TSuccess {
	if (!result.success) {
		const details = result.message ?? "unknown failure";
		assert.fail(`${message}: ${details}`);
	}
	return result.data;
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

	it("summarizes successfully (fullTree gate off)", async () => {
		const props = await buildLoadProps();
		const result: LoadSummarizerSummaryResult =
			await loadSummarizerContainerAndMakeSummary(props);

		// Verify - summary success
		assert(result.success, "expected summarization success");
		const summaryResults = result.summaryResults;
		const submit = expectSummarySuccess(
			summaryResults.summarySubmitted,
			"expected submit stage success",
		);
		assert(submit.stage === "submit", "submit stage value");
		assert(isSubmitOpResult(submit), "expected submit op result");
		assert(submit.summaryTree !== undefined, "summary tree should exist");
		expectSummarySuccess(
			summaryResults.summaryOpBroadcasted,
			"expected broadcast stage success",
		);
		const ack = expectSummarySuccess(
			summaryResults.receivedSummaryAckOrNack,
			"expected ack/nack stage success",
		);
		assert(ack.summaryAckOp.contents.handle, "ack should have summaryAckOp handle");

		// Verify - telemetry
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
		const result: LoadSummarizerSummaryResult = await loadSummarizerContainerAndMakeSummary({
			...props,
			logger,
			configProvider,
		});

		// Verify - summary success
		assert(result.success, "expected summarization success");
		const summaryResults = result.summaryResults;
		const submit = expectSummarySuccess(
			summaryResults.summarySubmitted,
			"expected submit stage success",
		);
		assert(submit.stage === "submit", "submit stage value");
		assert(isSubmitOpResult(submit), "expected submit op result");
		assert(submit.summaryTree !== undefined, "summary tree should exist");
		expectSummarySuccess(
			summaryResults.summaryOpBroadcasted,
			"expected broadcast stage success (gate)",
		);
		const ack = expectSummarySuccess(
			summaryResults.receivedSummaryAckOrNack,
			"expected ack/nack stage success",
		);
		assert(ack.summaryAckOp.contents.handle, "ack should have summaryAckOp handle");

		// Verify - telemetry
		const closed = logger.events.filter(
			(e) => e.eventName === "fluid:telemetry:SummarizerOnDemand:summarizerContainer_closed",
		);
		assert.strictEqual(closed.length, 1, "closed telemetry missing");
		assert.strictEqual(closed[0].success, true, "closed event should indicate success");
	});

	it("clients with summaries disabled can make changes and load from on-demand summary", async () => {
		const provider = getTestObjectProvider();
		// Config for clients that opt out of summarization.
		const clientConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: {
						state: "disabled",
					},
				},
			},
		};
		const summaryOnRequestOverrides: ISummaryConfigurationWithSummaryOnRequest = {
			state: "summaryOnRequest",
			maxAckWaitTime: 20000,
			maxOpsSinceLastSummary: 7000,
			initialSummarizerDelayMs: 0,
		};
		// Config for on demand summarizer.
		const summarizerConfig: ITestContainerConfig = {
			...clientConfig,
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: summaryOnRequestOverrides,
				},
			},
		};
		// Create two collaborating clients (summaries disabled)
		const container1 = await provider.makeTestContainer(clientConfig);
		const container2 = await provider.loadTestContainer(clientConfig);
		const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
		const dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;
		dataObject1.root.set("client1", "value1");
		await provider.ensureSynchronized(container1, container2);
		dataObject2.root.set("client2", "value2");
		await provider.ensureSynchronized(container1, container2);
		const url = await container1.getAbsoluteUrl("");
		assert(url !== undefined, "container must have url for summarizer load");

		// Load summarizer container
		const loaderProps = createLoaderProps(
			[[provider.defaultCodeDetails, provider.createFluidEntryPoint(summarizerConfig)]],
			provider.documentServiceFactory,
			provider.urlResolver,
		);
		const configProvider = {
			getRawConfig: (key: string) =>
				key === "Fluid.Summarizer.FullTree.OnDemand" ? true : undefined,
		};
		const summaryResult: LoadSummarizerSummaryResult =
			await loadSummarizerContainerAndMakeSummary({
				...loaderProps,
				request: { url },
				logger,
				configProvider,
			});

		// Verify - summary success
		assert(summaryResult.success, "summarizer run should succeed");
		const summaryResults = summaryResult.summaryResults;
		const submit = expectSummarySuccess(
			summaryResults.summarySubmitted,
			"summary submit must succeed",
		);
		assert(isSubmitOpResult(submit), "summary should produce submit result");
		assert(submit.summaryTree !== undefined, "summary tree should exist");
		expectSummarySuccess(
			summaryResults.summaryOpBroadcasted,
			"summary broadcast must succeed",
		);
		const ack = expectSummarySuccess(
			summaryResults.receivedSummaryAckOrNack,
			"summary ack must succeed",
		);
		const summaryHandle = ack.summaryAckOp.contents.handle;
		assert(summaryHandle !== undefined, "summary ack should provide handle");

		// Verify - telemetry
		const createdEvents = logger.events.filter(
			(e) => e.eventName === "fluid:telemetry:SummarizerOnDemand:summarizerContainer_created",
		);
		const closedEvents = logger.events.filter(
			(e) => e.eventName === "fluid:telemetry:SummarizerOnDemand:summarizerContainer_closed",
		);
		assert.strictEqual(createdEvents.length, 1, "summarizer should log creation once");
		assert.strictEqual(closedEvents.length, 1, "summarizer should log closure once");
		assert.strictEqual(closedEvents[0].success, true, "summarizer should close successfully");

		// Verify - new clients can load from the uploaded summary handle and see client edits.
		const containerFromSummary = await provider.loadTestContainer(clientConfig, {
			[LoaderHeader.version]: summaryHandle,
			[LoaderHeader.cache]: false,
		});
		const dataObjectFromSummary =
			(await containerFromSummary.getEntryPoint()) as ITestFluidObject;
		assert.strictEqual(
			dataObjectFromSummary.root.get("client1"),
			"value1",
			"summary snapshot should capture first client changes",
		);
		assert.strictEqual(
			dataObjectFromSummary.root.get("client2"),
			"value2",
			"summary snapshot should capture second client changes",
		);
		containerFromSummary.close();
		container2.close();
		container1.close();
	});
});
