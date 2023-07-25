/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import {
	DefaultSummaryConfiguration,
	IContainerRuntimeOptions,
	ISummaryConfiguration,
} from "@fluidframework/container-runtime";
import {
	ITestObjectProvider,
	waitForContainerConnection,
	summarizeNow,
	createSummarizerFromFactory,
	mockConfigProvider,
	timeoutAwait,
} from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluid-internal/test-version-utils";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { FluidDataStoreRuntime, mixinSummaryHandler } from "@fluidframework/datastore";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import {
	ITelemetryBaseEvent,
	IFluidHandle,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";

export const rootDataObjectType = "@fluid-example/rootDataObject";
export const TestDataObjectType1 = "@fluid-example/test-dataStore1";

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

const rootDataObjectFactory = new DataObjectFactory(
	rootDataObjectType,
	RootTestDataObject,
	[],
	[],
	[],
);
const dataStoreFactory1 = new DataObjectFactory(
	TestDataObjectType1,
	TestDataObject1,
	[],
	[],
	[],
	mixinSummaryHandler(getDataObject),
);

const registryStoreEntries = new Map<string, Promise<IFluidDataStoreFactory>>([
	[rootDataObjectFactory.type, Promise.resolve(rootDataObjectFactory)],
	[dataStoreFactory1.type, Promise.resolve(dataStoreFactory1)],
]);

let settings = {};

const createContainer = async (
	provider: ITestObjectProvider,
	disableSummary: boolean = true,
	logger?: ITelemetryBaseLogger,
): Promise<IContainer> => {
	let summaryConfigOverrides: ISummaryConfiguration;
	if (disableSummary) {
		summaryConfigOverrides = { state: "disabled" };
	} else {
		const IdleDetectionTime = 10;
		summaryConfigOverrides = {
			...DefaultSummaryConfiguration,
			...{
				maxIdleTime: IdleDetectionTime,
				maxTime: IdleDetectionTime * 12,
				initialSummarizerDelayMs: 0,
			},
		};
	}
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides,
		},
	};
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
		rootDataObjectFactory,
		registryStoreEntries,
		undefined /* dependencyContainer */,
		undefined /* requestHandlers */,
		runtimeOptions,
	);
	return provider.createContainer(runtimeFactory, {
		logger,
		configProvider: mockConfigProvider(settings),
	});
};

async function createSummarizer(
	provider: ITestObjectProvider,
	container: IContainer,
	summaryVersion?: string,
) {
	return createSummarizerFromFactory(
		provider,
		container,
		rootDataObjectFactory,
		summaryVersion,
		undefined /* containerRuntimeFactoryType */,
		registryStoreEntries,
		undefined /* logger */,
		mockConfigProvider(settings),
	);
}

async function waitForSummaryOp(container: IContainer): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		container.deltaManager.on("op", (op: ISequencedDocumentMessage) => {
			if (op.type === MessageType.Summarize) {
				resolve(true);
			}
		});
	});
}

describeNoCompat("Summarizer with local data stores", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;

	beforeEach(async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
		settings = [];
		settings["Fluid.ContainerRuntime.Test.SummaryStateUpdateMethodV2"] = "restart";
		settings["Fluid.ContainerRuntime.Test.CloseSummarizerDelayOverrideMs"] = 0;
	});

	itExpects(
		"with ValidateSummaryBeforeUpload true, summary should fail before generate stage when data store is created during summarize",
		[
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				error: "NodeDidNotRunGC",
			},
		],
		async () => {
			settings["Fluid.ContainerRuntime.Test.ValidateSummaryBeforeUpload"] = true;
			const container = await createContainer(provider);
			await waitForContainerConnection(container);
			const rootDataObject = await requestFluidObject<RootTestDataObject>(container, "/");
			const dataObject = await dataStoreFactory1.createInstance(
				rootDataObject.containerRuntime,
			);
			rootDataObject._root.set("dataStore2", dataObject.handle);
			const { summarizer } = await createSummarizer(provider, container);
			await provider.ensureSynchronized();

			// Summarization should fail because of a data store created during summarization which does not run GC.
			await assert.rejects(
				async () => summarizeNow(summarizer),
				(error: any) => {
					// The summary should have failed because of "NodeDidNotRunGC" error before it was generated,
					// i.e., "base" stage.
					return error.message === "NodeDidNotRunGC" && error.data.stage === "base";
				},
				"expected NodeDidNotRunGC",
			);
		},
	);

	itExpects(
		"with ValidateSummaryBeforeUpload false, summary should fail after upload when data store is created during summarize",
		[
			{
				eventName: "fluid:telemetry:SummarizerNode:NodeDidNotRunGC",
				clientType: "noninteractive/summarizer",
				error: "NodeDidNotRunGC",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				error: "NodeDidNotRunGC",
			},
		],
		async () => {
			settings["Fluid.ContainerRuntime.Test.ValidateSummaryBeforeUpload"] = false;
			const container = await createContainer(provider);
			await waitForContainerConnection(container);
			const rootDataObject = await requestFluidObject<RootTestDataObject>(container, "/");
			const dataObject = await dataStoreFactory1.createInstance(
				rootDataObject.containerRuntime,
			);
			rootDataObject._root.set("dataStore2", dataObject.handle);
			const { summarizer } = await createSummarizer(provider, container);
			await provider.ensureSynchronized();

			// Summarization should fail because of a data store created during summarization which does not run GC.
			await assert.rejects(
				async () => {
					await summarizeNow(summarizer);
				},
				(error: any) => {
					// The summary should have failed because of "NodeDidNotRunGC" error after it was uploaded,
					// i.e., "upload" stage.
					return error.message === "NodeDidNotRunGC" && error.data.stage === "upload";
				},
				"expected NodeDidNotRunGC",
			);
		},
	);

	/**
	 * This test results in gcUnknownOutboundReferences error - A data store is created in summarizer and its handle
	 * is stored in the root data store's DDS. This results in a reference to the new data store but it is not
	 * explicitly notified to GC. The notification to GC happens when op containing handle is processed and the
	 * handle is parsed in remote clients. Local clients do not parse handle as its not serialized in it.
	 */
	itExpects(
		"with ValidateSummaryBeforeUpload true, heuristic based summaries should pass on retry when NodeDidNotRunGC is hit",
		[
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				error: "NodeDidNotRunGC",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:gcUnknownOutboundReferences",
				clientType: "noninteractive/summarizer",
			},
		],
		async () => {
			settings["Fluid.ContainerRuntime.Test.ValidateSummaryBeforeUpload"] = true;
			const logger = new MockLogger();
			const mainContainer = await createContainer(
				provider,
				false /* disableSummary */,
				logger,
			);
			const rootDataObject = await requestFluidObject<RootTestDataObject>(mainContainer, "/");
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
			// 1. First summarize attempt starts for the first phase, i.e., summarizeAttemptPerPhase = 1.
			// 2. Data store is created in summarizer.
			// 3. Summarize cancels with NodeDidNotRunGC error.
			// 4. Second summarize attempts starts for the first phase, i.e., summarizeAttemptPerPhase = 2.
			// 5. Summary is successfully generated.
			const clientType = "noninteractive/summarizer";
			const expectedEventsInSequence: Omit<ITelemetryBaseEvent, "category">[] = [
				{
					eventName: "fluid:telemetry:Summarizer:Running:Summarize_start",
					clientType,
					summaryAttemptPhase: 1,
					summaryAttempts: 1,
					summaryAttemptsPerPhase: 1,
				},
				{
					eventName: "fluid:telemetry:FluidDataStoreContext:DataStoreCreatedInSummarizer",
					clientType,
				},
				{
					eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
					clientType,
					error: "NodeDidNotRunGC",
					summaryAttemptPhase: 1,
					summaryAttempts: 1,
					summaryAttemptsPerPhase: 1,
				},
				{
					eventName: "fluid:telemetry:Summarizer:Running:Summarize_start",
					clientType,
					summaryAttemptPhase: 1,
					summaryAttempts: 2,
					summaryAttemptsPerPhase: 2,
				},
				{
					eventName: "fluid:telemetry:Summarizer:Running:Summarize_generate",
					clientType,
					summaryAttemptPhase: 1,
					summaryAttempts: 2,
					summaryAttemptsPerPhase: 2,
				},
			];

			logger.assertMatch(expectedEventsInSequence, "Unexpected sequence of events");
		},
	);
});
