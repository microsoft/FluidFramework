/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions/internal";
import {
	loadSummarizerContainerAndMakeSummary,
	type ILoadSummarizerContainerProps,
	type LoadSummarizerSummaryResult,
} from "@fluidframework/container-loader/internal";
import {
	ISummarizeResults,
	ISummaryConfigurationWithSummaryOnRequest,
} from "@fluidframework/container-runtime/internal";
import type { ITelemetryBaseEvent } from "@fluidframework/core-interfaces/internal";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	createLoaderProps,
	ITestContainerConfig,
	ITestFluidObject,
	DataObjectFactoryType,
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
} from "@fluidframework/test-utils/internal";

import { wrapObjectAndOverride } from "../../mocking.js";

describeCompat("on-demand summarizer api", "NoCompat", (getTestObjectProvider, apis) => {
	let logger: MockLogger;
	let provider: ITestObjectProvider;

	beforeEach(() => {
		provider = getTestObjectProvider();
		logger = new MockLogger();
	});

	const summarizerEventName = "fluid:telemetry:SummarizerOnDemand:SummarizerOnDemandSummary";

	function getPerformanceEvents(suffix: "start" | "end" | "cancel"): ITelemetryBaseEvent[] {
		return logger.events.filter((e) => e.eventName === `${summarizerEventName}_${suffix}`);
	}

	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
	};

	async function buildLoadProps(): Promise<ILoadSummarizerContainerProps> {
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

	async function buildLoadPropsForExistingContainer(
		container: IContainer,
		containerConfig: ITestContainerConfig,
		loggerOverride: MockLogger = logger,
	): Promise<ILoadSummarizerContainerProps> {
		const entry = (await container.getEntryPoint()) as ITestFluidObject;
		assert(entry !== undefined, "entry point must resolve");
		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "container must have url");
		const loaderProps = createLoaderProps(
			[[provider.defaultCodeDetails, provider.createFluidEntryPoint(containerConfig)]],
			provider.documentServiceFactory,
			provider.urlResolver,
		);
		return { ...loaderProps, request: { url }, logger: loggerOverride };
	}

	it("summarizes successfully (fullTree gate off)", async function () {
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
	});

	it("summarizes successfully with fullTree gate on", async function () {
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
	});

	it("fails gracefully when summary upload throws", async () => {
		const props = await buildLoadProps();
		const uploadError = new Error("upload failure for test");
		const failingFactory = wrapObjectAndOverride<IDocumentServiceFactory>(
			props.documentServiceFactory,
			{
				createDocumentService: {
					connectToStorage: {
						uploadSummaryWithContext: () => {
							throw uploadError;
						},
					},
				},
			},
		);
		const result = await loadSummarizerContainerAndMakeSummary({
			...props,
			documentServiceFactory: failingFactory,
		});

		assert(!result.success, "expected summarization failure when upload fails");
		assert(result.error !== undefined, "error should be returned");
		assert.strictEqual(
			result.error.message,
			uploadError.message,
			"error message should propagate",
		);
	});

	it("on-demand summary succeeds after normal summary completes", async () => {
		const enabledSummarizerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
		};
		const mainContainer = await provider.makeTestContainer(enabledSummarizerConfig);
		const { summarizer } = await createSummarizer(
			provider,
			mainContainer,
			enabledSummarizerConfig,
		);
		const mainDataObject = (await mainContainer.getEntryPoint()) as ITestFluidObject;
		mainDataObject.root.set("normal", "summary");
		await provider.ensureSynchronized(mainContainer);
		await summarizeNow(summarizer, "normalSummaryBeforeOnDemand");

		const onDemandProps = await buildLoadPropsForExistingContainer(
			mainContainer,
			enabledSummarizerConfig,
		);
		const onDemandResult = await loadSummarizerContainerAndMakeSummary(onDemandProps);

		assert(onDemandResult.success, "on-demand summary should succeed after normal summary");
		const summaryResults = onDemandResult.summaryResults;
		assert(summaryResults.summarySubmitted, "on-demand summary not submitted");
		assert(summaryResults.summaryOpBroadcasted, "on-demand summary op not broadcasted");
	});
	/**
	 * Disabled: overlapping summaries occasionally exceed Mocha's 5s default timeout.
	 * Risk: `loadSummarizerContainerAndMakeSummary` is still an unused API but we temporarily lose coverage of the concurrent-summary scenario.
	 * Planned work: {@link https://dev.azure.com/fluidframework/internal/_workitems/edit/50613}
	 */
	it.skip("on-demand summary succeeds while normal summary is inflight", async () => {
		const enabledSummarizerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
		};
		const mainContainer = await provider.makeTestContainer(enabledSummarizerConfig);
		const { summarizer } = await createSummarizer(
			provider,
			mainContainer,
			enabledSummarizerConfig,
		);
		const mainDataObject = (await mainContainer.getEntryPoint()) as ITestFluidObject;
		mainDataObject.root.set("inflight", "summary");
		await provider.ensureSynchronized(mainContainer);

		const normalSummary: ISummarizeResults = summarizer.summarizeOnDemand({
			reason: "normalSummaryInFlight",
		});

		const onDemandProps = await buildLoadPropsForExistingContainer(
			mainContainer,
			enabledSummarizerConfig,
		);
		const onDemandResult = await loadSummarizerContainerAndMakeSummary(onDemandProps);

		assert(onDemandResult.success, "on-demand summary should succeed during normal summary");
		const summaryResults = onDemandResult.summaryResults;
		assert(summaryResults.summarySubmitted, "on-demand summary not submitted");
		assert(summaryResults.summaryOpBroadcasted, "on-demand summary op not broadcasted");

		const normalSubmit = await normalSummary.summarySubmitted;
		assert(normalSubmit.success, "normal summary should submit successfully");
		const normalBroadcast = await normalSummary.summaryOpBroadcasted;
		assert(normalBroadcast.success, "normal summary op should broadcast");
		const normalAck = await normalSummary.receivedSummaryAckOrNack;
		assert(normalAck.success, "normal summary should be acked");
	});

	it("clients with summaries disabled can make changes and load from on-demand summary handle", async function () {
		if (provider.driver.type !== "odsp") {
			this.skip();
		}
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
