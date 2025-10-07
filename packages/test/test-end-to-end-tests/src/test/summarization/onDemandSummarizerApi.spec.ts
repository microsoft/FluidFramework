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
} from "@fluidframework/container-loader/internal";
import { ISummaryConfigurationWithSummaryOnRequest } from "@fluidframework/container-runtime/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	createLoaderProps,
	ITestContainerConfig,
	ITestFluidObject,
	DataObjectFactoryType,
} from "@fluidframework/test-utils/internal";

describeCompat("on-demand summarizer api", "NoCompat", (getTestObjectProvider, apis) => {
	let logger: MockLogger;

	beforeEach(() => {
		logger = new MockLogger();
	});

	const summarizerEventName = "fluid:telemetry:SummarizerOnDemand:SummarizerOnDemandSummary";

	function getPerformanceEvents(suffix: "start" | "end" | "cancel") {
		return logger.events.filter((e) => e.eventName === `${summarizerEventName}_${suffix}`);
	}

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
		assert(summaryResults.summarySubmitted, "summary not submitted");
		assert(summaryResults.summaryOpBroadcasted, "summary op not broadcasted");
		const data = summaryResults.summaryInfo;
		assert.strictEqual(data.stage, "submit", "submit stage value");
		assert(data.handle !== undefined, "summary handle should exist");

		// Verify - telemetry
		const startEvents = getPerformanceEvents("start");
		const endEvents = getPerformanceEvents("end");
		assert.strictEqual(startEvents.length, 1, "start telemetry missing");
		assert.strictEqual(endEvents.length, 1, "end telemetry missing");
		const endEvent = endEvents[0];
		assert.strictEqual(endEvent.category, "performance", "end event should be performance");
		assert.strictEqual(endEvent.success, true, "end event should indicate success");
		assert.strictEqual(
			typeof endEvent.duration,
			"number",
			"end event should report duration in ms",
		);
	});

	it("summarizes successfully with fullTree gate on", async () => {
		const props = await buildLoadProps();
		const configProvider = {
			getRawConfig: (key: string) =>
				key === "Fluid.Summarizer.FullTree.OnDemand" ? true : undefined,
			getBoolean: (key: string) =>
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
		assert(summaryResults.summarySubmitted, "summary not submitted");
		assert(summaryResults.summaryOpBroadcasted, "summary op not broadcasted");
		const data = summaryResults.summaryInfo;
		assert.strictEqual(data.stage, "submit", "submit stage value");
		assert(data.handle !== undefined, "summary handle should exist");

		// Verify - telemetry
		const startEvents = getPerformanceEvents("start");
		const endEvents = getPerformanceEvents("end");
		assert.strictEqual(startEvents.length, 1, "start telemetry missing");
		assert.strictEqual(endEvents.length, 1, "end telemetry missing");
		const endEvent = endEvents[0];
		assert.strictEqual(endEvent.success, true, "end event should indicate success");
		assert.strictEqual(
			endEvent.summarySubmitted,
			true,
			"end event should capture summarySubmitted",
		);
		assert.strictEqual(
			endEvent.summaryOpBroadcasted,
			true,
			"end event should capture summaryOpBroadcasted",
		);
		assert(!("receivedSummaryAck" in endEvent), "end event should omit receivedSummaryAck");
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
			getBoolean: (key: string) =>
				key === "Fluid.Summarizer.FullTree.OnDemand" ? true : undefined,
		};
		const result: LoadSummarizerSummaryResult = await loadSummarizerContainerAndMakeSummary({
			...loaderProps,
			request: { url },
			logger,
			configProvider,
		});

		// Verify - summary success
		assert(result.success, "expected summarization success");
		const summaryResults = result.summaryResults;
		assert(summaryResults.summarySubmitted, "summary not submitted");
		assert(summaryResults.summaryOpBroadcasted, "summary op not broadcasted");
		const data = summaryResults.summaryInfo;
		assert.strictEqual(data.stage, "submit", "submit stage value");
		assert(data.handle !== undefined, "summary handle should exist");

		// Verify - telemetry
		const startEvents = getPerformanceEvents("start");
		const endEvents = getPerformanceEvents("end");
		assert.strictEqual(startEvents.length, 1, "summarizer should log start once");
		assert.strictEqual(endEvents.length, 1, "summarizer should log end once");
		assert.strictEqual(endEvents[0].success, true, "summarizer should complete successfully");

		// Verify - new clients can load from the uploaded summary handle and see client edits.
		const containerFromSummary = await provider.loadTestContainer(clientConfig, {
			[LoaderHeader.version]: data.handle,
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
