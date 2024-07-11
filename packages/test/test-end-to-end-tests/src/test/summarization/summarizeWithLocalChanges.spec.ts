/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITestDataObject, describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	DefaultSummaryConfiguration,
	IContainerRuntimeOptions,
	ISummaryConfiguration,
} from "@fluidframework/container-runtime/internal";
import {
	ISummarizeEventProps,
	defaultMaxAttemptsForSubmitFailures,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/container-runtime/internal/test/summary";
import {
	IFluidHandle,
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import type { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import {
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	ITestObjectProvider,
	createSummarizer,
	createSummarizerFromFactory,
	createTestConfigProvider,
	summarizeNow,
	timeoutAwait,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

const configProvider = createTestConfigProvider();

async function waitForSummaryOp(container: IContainer): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		container.deltaManager.on("op", (op: ISequencedDocumentMessage) => {
			if (op.type === MessageType.Summarize) {
				resolve(true);
			}
		});
	});
}

describeCompat("Summarizer with local changes", "NoCompat", (getTestObjectProvider, apis) => {
	const { DataObject, DataObjectFactory } = apis.dataRuntime;
	const { mixinSummaryHandler } = apis.dataRuntime.packages.datastore;
	const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;

	/**
	 * Data object that creates another data object during initialization. This is used to create a scenario
	 * where data objects are created during summarization.
	 */
	class TestDataObject1 extends DataObject {
		public get _root() {
			return this.root;
		}

		public get _context() {
			return this.context;
		}

		private readonly datastoreKey = "TestDataObject2";

		protected async hasInitialized() {
			this.initSync().catch((error) => {});
		}

		/**
		 * This function is called during initialization. It creates a data store in summarizer client only if one doesn't
		 * already exists. The idea behind this is to have data store created during summarization and validate that it
		 * is handled correctly.
		 */
		protected async initSync() {
			// For non-summarizer (interactive) clients, don't do anything.
			if (this.context.clientDetails.capabilities.interactive === true) {
				return;
			}

			// If the second data store already exists, don't create another one. This ensures that we don't create data
			// stores endlessly during summarization.
			let dataObject2: RootTestDataObject | undefined;
			const dataObject2Handle = this.root.get<IFluidHandle<RootTestDataObject>>(
				this.datastoreKey,
			);
			if (dataObject2Handle !== undefined) {
				dataObject2 = await dataObject2Handle.get();
			}
			if (dataObject2 !== undefined) {
				return;
			}

			const newDataObject = await rootDataObjectFactory.createInstance(
				this.context.containerRuntime,
			);
			this.root.set(this.datastoreKey, newDataObject.handle);
		}
	}

	/**
	 * Data object that sends ops during initialization. This is used to create a scenario where ops are generated
	 * during summarization.
	 */
	class TestDataObject2 extends DataObject {
		public get _root() {
			return this.root;
		}

		public get _context() {
			return this.context;
		}

		protected async hasInitialized() {
			this.root.set("key", "value");
		}
	}

	class RootTestDataObject extends DataObject {
		public get _root() {
			return this.root;
		}
		public get containerRuntime() {
			return this.context.containerRuntime;
		}
	}

	// Search does something similar to this, where it loads the data object.
	const getDataObject = async (runtime: FluidDataStoreRuntime) => {
		await DataObject.getDataObject(runtime);
		return undefined;
	};

	// Search does something similar to this, where it loads the data object.
	const getDataObjectAndSendOps = async (runtime: FluidDataStoreRuntime) => {
		const dataObject = (await DataObject.getDataObject(runtime)) as TestDataObject2;
		dataObject._root.set("op", "value");
		return undefined;
	};

	const rootDataObjectFactory = new DataObjectFactory(
		"RootDataObject",
		RootTestDataObject,
		[],
		[],
		[],
	);
	const dataStoreFactory1 = new DataObjectFactory(
		"TestDataObject1",
		TestDataObject1,
		[],
		[],
		[],
		mixinSummaryHandler(getDataObject),
	);
	const dataStoreFactory2 = new DataObjectFactory(
		"TestDataObject2",
		TestDataObject2,
		[],
		[],
		[],
		mixinSummaryHandler(getDataObjectAndSendOps),
	);
	const dataStoreFactory3 = new DataObjectFactory(
		"TestDataObject3",
		class extends DataObject {},
		[],
		[],
		[],
		mixinSummaryHandler(async () => {
			throw new Error("Mixed-in summary handler threw!");
		}),
	);

	const registryStoreEntries = new Map<string, Promise<IFluidDataStoreFactory>>([
		[rootDataObjectFactory.type, Promise.resolve(rootDataObjectFactory)],
		[dataStoreFactory1.type, Promise.resolve(dataStoreFactory1)],
		[dataStoreFactory2.type, Promise.resolve(dataStoreFactory2)],
		[dataStoreFactory3.type, Promise.resolve(dataStoreFactory3)],
	]);

	/** Creates a container with Summary Options overridden to ensure Summarization happens promptly (unless disabled) */
	const createContainer = async (
		testObjectProvider: ITestObjectProvider,
		disableSummary: boolean = true,
		logger?: ITelemetryBaseLogger,
	): Promise<IContainer> => {
		let summaryConfigOverrides: ISummaryConfiguration;
		if (disableSummary) {
			summaryConfigOverrides = { state: "disabled" };
		} else {
			const IdleDetectionTimeMs = 20;
			summaryConfigOverrides = {
				...DefaultSummaryConfiguration,
				...{
					minIdleTime: IdleDetectionTimeMs,
					maxIdleTime: IdleDetectionTimeMs * 2,
					maxTime: IdleDetectionTimeMs * 12,
					initialSummarizerDelayMs: 0,
				},
			};
		}
		const runtimeOptions: IContainerRuntimeOptions = {
			summaryOptions: {
				summaryConfigOverrides,
			},
		};
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: rootDataObjectFactory,
			registryEntries: registryStoreEntries,
			runtimeOptions,
		});
		return testObjectProvider.createContainer(runtimeFactory, {
			logger,
			configProvider,
		});
	};

	let provider: ITestObjectProvider;

	beforeEach("setup", async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });

		// These tests validate client logic. Testing against multiple services won't make a difference.
		if (provider.driver.type !== "local") {
			this.skip();
		}

		configProvider.set("Fluid.ContainerRuntime.Test.CloseSummarizerDelayOverrideMs", 0);
		configProvider.set("Fluid.Summarizer.PendingOpsRetryDelayMs", 5);
	});

	afterEach(() => {
		configProvider.clear();
	});

	itExpects(
		"Summary should fail before generate stage when data store is created during summarize",
		[
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				error: "NodeDidNotRunGC",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed",
				clientType: "noninteractive/summarizer",
				error: "NodeDidNotRunGC",
			},
		],
		async () => {
			const container = await createContainer(provider);
			await waitForContainerConnection(container);
			const rootDataObject = (await container.getEntryPoint()) as RootTestDataObject;
			const dataObject = await dataStoreFactory1.createInstance(
				rootDataObject.containerRuntime,
			);
			rootDataObject._root.set("dataStore2", dataObject.handle);
			const { summarizer } = await createSummarizerFromFactory(
				provider,
				container,
				rootDataObjectFactory,
				undefined /* summaryVersion */,
				undefined /* containerRuntimeFactoryType */,
				registryStoreEntries,
				undefined /* logger */,
				configProvider,
			);
			await provider.ensureSynchronized();

			// Summarization should fail because of a data store created during summarization which does not run GC.
			await assert.rejects(
				async () => summarizeNow(summarizer),
				(error: any) => {
					// The summary should have failed because of "NodeDidNotRunGC" error.
					return error.message === "NodeDidNotRunGC";
				},
				"expected NodeDidNotRunGC",
			);
		},
	);

	itExpects(
		"Summary should fail if ops are sent before summarize",
		[
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				error: "PendingOpsWhileSummarizing",
				beforeGenerate: true,
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed",
				clientType: "noninteractive/summarizer",
				error: "PendingOpsWhileSummarizing",
			},
		],
		async () => {
			// Wait for 100 ms for pending ops to be saved.
			const pendingOpsTimeoutMs = 100;
			configProvider.set("Fluid.Summarizer.waitForPendingOpsTimeoutMs", pendingOpsTimeoutMs);
			const mockLogger = new MockLogger();
			const container1 = await provider.makeTestContainer();
			const { summarizer, container: summarizerContainer } = await createSummarizer(
				provider,
				container1,
				{ loaderProps: { configProvider } },
				undefined /* summaryVersion */,
				mockLogger,
			);

			const runtime = (summarizer as any).runtime as ContainerRuntime;
			const entryPoint = (await runtime.getAliasedDataStoreEntryPoint("default")) as
				| IFluidHandle<ITestDataObject>
				| undefined;
			if (entryPoint === undefined) {
				throw new Error("default dataStore must exist");
			}
			const defaultDataStore1 = await entryPoint.get();

			// Pause op processing and send ops so there are pending ops in the summarizer.
			const pendingOpCount = 10;
			await provider.opProcessingController.pauseProcessing(summarizerContainer);
			for (let i = 0; i < pendingOpCount; i++) {
				defaultDataStore1._root.set(`key${i}`, `value${i}`);
			}

			await assert.rejects(
				async () => {
					await summarizeNow(summarizer);
				},
				(error: any) => {
					// The summary should have failed because of "PendingOpsWhileSummarizing" error.
					return error.message === "PendingOpsWhileSummarizing";
				},
				"expected PendingOpsWhileSummarizing",
			);

			// We should have received a PendingOpsWhileSummarizing event with all the pending ops not saved.
			mockLogger.assertMatch([
				{
					eventName: "fluid:telemetry:Summarizer:Running:PendingOpsWhileSummarizing",
					saved: false,
					countBefore: pendingOpCount,
					countAfter: pendingOpCount,
					timeout: pendingOpsTimeoutMs,
				},
			]);
		},
	);

	itExpects(
		"Summary should fail if ops are sent during summarize",
		[
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				error: "PendingOpsWhileSummarizing",
				beforeGenerate: false,
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed",
				clientType: "noninteractive/summarizer",
				error: "PendingOpsWhileSummarizing",
			},
		],
		async () => {
			const mockLogger = new MockLogger();
			const container = await createContainer(provider);
			await waitForContainerConnection(container);

			const rootDataObject = (await container.getEntryPoint()) as RootTestDataObject;

			// This data object will send ops during summarization because the factory uses mixinSummaryHandler
			// to do so on every summarize.
			const dataObject2 = await dataStoreFactory2.createInstance(
				rootDataObject.containerRuntime,
			);
			rootDataObject._root.set("dataStore2", dataObject2.handle);
			dataObject2._root.set("op", "value");

			const { summarizer } = await createSummarizerFromFactory(
				provider,
				container,
				rootDataObjectFactory,
				undefined /* summaryVersion */,
				undefined /* containerRuntimeFactoryType */,
				registryStoreEntries,
				mockLogger,
				configProvider,
			);
			await provider.ensureSynchronized();

			await assert.rejects(
				async () => {
					await summarizeNow(summarizer);
				},
				(error: any) => {
					// The summary should have failed because of "PendingOpsWhileSummarizing" error.
					return error.message === "PendingOpsWhileSummarizing";
				},
				"expected PendingOpsWhileSummarizing",
			);
		},
	);

	itExpects(
		"Heuristic based summaries should pass on retry when NodeDidNotRunGC is hit",
		[
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				error: "NodeDidNotRunGC",
			},
		],
		async () => {
			const logger = new MockLogger();
			const mainContainer = await createContainer(
				provider,
				false /* disableSummary */,
				logger,
			);
			const rootDataObject = (await mainContainer.getEntryPoint()) as RootTestDataObject;
			const dataObject = await dataStoreFactory1.createInstance(
				rootDataObject.containerRuntime,
			);
			rootDataObject._root.set("store", dataObject.handle);
			await waitForContainerConnection(mainContainer);

			const summarySucceeded = await timeoutAwait(waitForSummaryOp(mainContainer), {
				errorMsg: "Timeout on waiting for summary op",
			});
			assert(summarySucceeded === true, "Summary should have been successful");

			// The sequence of events that should happen:
			// 1. First summarize attempt starts, i.e., summaryAttempts = 1.
			// 2. Data store is created in summarizer.
			// 3. Summarize cancels with NodeDidNotRunGC error.
			// 4. Second summarize attempts starts, i.e., summaryAttempts = 2.
			// 5. Summary is successfully generated.
			const clientType = "noninteractive/summarizer";
			const expectedEventsInSequence: Omit<ITelemetryBaseEvent, "category">[] = [
				{
					eventName: "fluid:telemetry:Summarizer:Running:Summarize_start",
					clientType,
					summaryAttempts: 1,
				},
				{
					eventName: "fluid:telemetry:FluidDataStoreContext:DataStoreCreatedInSummarizer",
					clientType,
				},
				{
					eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
					clientType,
					error: "NodeDidNotRunGC",
					summaryAttempts: 1,
				},
				{
					eventName: "fluid:telemetry:Summarizer:Running:Summarize_start",
					clientType,
					summaryAttempts: 2,
				},
				{
					eventName: "fluid:telemetry:Summarizer:Running:Summarize_generate",
					clientType,
					summaryAttempts: 2,
				},
			];

			logger.assertMatch(expectedEventsInSequence, "Unexpected sequence of events");
		},
	);

	itExpects(
		"All heuristics summary attempts should fail when ops are sent during summarize",
		[
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				summaryAttempts: 1,
				finalAttempt: false,
				error: "PendingOpsWhileSummarizing",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				summaryAttempts: 2,
				finalAttempt: false,
				error: "PendingOpsWhileSummarizing",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				summaryAttempts: 3,
				finalAttempt: false,
				error: "PendingOpsWhileSummarizing",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				summaryAttempts: 4,
				finalAttempt: false,
				error: "PendingOpsWhileSummarizing",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				summaryAttempts: 5,
				finalAttempt: true,
				error: "PendingOpsWhileSummarizing",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed",
				clientType: "noninteractive/summarizer",
				error: "PendingOpsWhileSummarizing",
			},
		],
		async () => {
			const container = await createContainer(provider, false /* disableSummary */);
			await waitForContainerConnection(container);

			const rootDataObject = (await container.getEntryPoint()) as RootTestDataObject;
			const containerRuntime = rootDataObject.containerRuntime as ContainerRuntime;

			const summarizePromiseP = new Promise<ISummarizeEventProps>((resolve) => {
				const handler = (eventProps: ISummarizeEventProps) => {
					if (eventProps.result !== "failure") {
						containerRuntime.off("summarize", handler);
						resolve(eventProps);
					} else {
						assert(
							eventProps.error?.message === "PendingOpsWhileSummarizing",
							"Unexpected summarization failure",
						);
						if (eventProps.currentAttempt === eventProps.maxAttempts) {
							containerRuntime.off("summarize", handler);
							resolve(eventProps);
						}
					}
				};
				containerRuntime.on("summarize", handler);
			});

			const dataObject2 = await dataStoreFactory2.createInstance(
				rootDataObject.containerRuntime,
			);
			rootDataObject._root.set("dataStore2", dataObject2.handle);
			dataObject2._root.set("op", "value");
			await provider.ensureSynchronized();

			const props = await summarizePromiseP;
			assert.strictEqual(props.result, "failure", "Summarization did not fail as expected");
			assert.strictEqual(
				props.maxAttempts,
				defaultMaxAttemptsForSubmitFailures,
				`Unexpected summarize attempts`,
			);
		},
	);

	itExpects(
		"SkipFailingIncorrectSummary = true. Final summary attempt should pass when ops are sent during summarize",
		[
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				summaryAttempts: 1,
				finalAttempt: false,
				error: "PendingOpsWhileSummarizing",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				summaryAttempts: 2,
				finalAttempt: false,
				error: "PendingOpsWhileSummarizing",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				summaryAttempts: 3,
				finalAttempt: false,
				error: "PendingOpsWhileSummarizing",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				summaryAttempts: 4,
				finalAttempt: false,
				error: "PendingOpsWhileSummarizing",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:SkipFailingIncorrectSummary",
				summaryAttempts: 5,
				finalAttempt: true,
				error: "Pending ops during summarization",
			},
		],
		async () => {
			configProvider.set("Fluid.Summarizer.SkipFailingIncorrectSummary", true);
			configProvider.set("Fluid.Summarizer.PendingOpsRetryDelayMs", 5);
			const container = await createContainer(provider, false /* disableSummary */);
			await waitForContainerConnection(container);

			const rootDataObject = (await container.getEntryPoint()) as RootTestDataObject;
			const containerRuntime = rootDataObject.containerRuntime as ContainerRuntime;

			const summarizePromiseP = new Promise<ISummarizeEventProps>((resolve) => {
				const handler = (eventProps: ISummarizeEventProps) => {
					if (eventProps.result !== "failure") {
						containerRuntime.off("summarize", handler);
						resolve(eventProps);
					} else {
						assert(
							eventProps.error?.message === "PendingOpsWhileSummarizing",
							"Unexpected summarization failure",
						);
						if (eventProps.currentAttempt === eventProps.maxAttempts) {
							containerRuntime.off("summarize", handler);
							resolve(eventProps);
						}
					}
				};
				containerRuntime.on("summarize", handler);
			});

			const dataObject2 = await dataStoreFactory2.createInstance(
				rootDataObject.containerRuntime,
			);
			rootDataObject._root.set("dataStore2", dataObject2.handle);
			dataObject2._root.set("op", "value");
			await provider.ensureSynchronized();

			const props = await summarizePromiseP;
			assert.strictEqual(props.result, "success", "Summarization did not succeed as expected");
			assert.strictEqual(
				props.maxAttempts,
				defaultMaxAttemptsForSubmitFailures,
				`Unexpected summarize attempts`,
			);
		},
	);

	itExpects(
		"Errors thrown from mixinSummaryHandler are tagged as DataProcessingError",
		[
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				error: "Mixed-in summary handler threw!",
				errorType: "dataProcessingError",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed",
				clientType: "noninteractive/summarizer",
				error: "Mixed-in summary handler threw!",
			},
		],
		async () => {
			const container = await createContainer(provider, false /* disableSummary */);
			await waitForContainerConnection(container);

			const rootDataObject = (await container.getEntryPoint()) as RootTestDataObject;
			const containerRuntime = rootDataObject.containerRuntime as ContainerRuntime;

			try {
				const firstSummaryResultP = new Promise<ISummarizeEventProps>((resolve) => {
					containerRuntime.on("summarize", resolve);
				});

				// Create and reference the dataObject 3 and wait for Summary
				// Summary should fail due to mixed-in summary handler throwing
				const dataObject3 = await dataStoreFactory3.createInstance(
					rootDataObject.containerRuntime,
				);
				rootDataObject._root.set("referenced", dataObject3.handle);
				await provider.ensureSynchronized();
				const summarizeResult = await firstSummaryResultP;

				assert.equal(
					summarizeResult.result,
					"failure",
					"Expected summary to fail due to mixed-in summary handler",
				);
				assert.equal(
					summarizeResult.error?.errorType,
					FluidErrorTypes.dataProcessingError,
					"Expected the error to be wrapped as DataProcessingError",
				);
			} finally {
				// This will remove all listeners (including "summarize" one above)
				containerRuntime.dispose();
			}
		},
	);
});
