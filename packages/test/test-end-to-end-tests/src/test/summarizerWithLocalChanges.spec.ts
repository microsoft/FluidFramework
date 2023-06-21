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
import { ITelemetryBaseEvent, ITelemetryLogger } from "@fluidframework/common-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";

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

	protected async initSync() {
		if (this.context.clientDetails.capabilities.interactive === true) {
			return;
		}

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
		return Promise.resolve()
			.then(() => {
				this.root.set(this.datastoreKey, newDataObject.handle);
			})
			.catch(console.error);
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

const settings = {};
settings["Fluid.ContainerRuntime.Test.SummaryStateUpdateMethod"] = "restart";
settings["Fluid.ContainerRuntime.Test.CloseSummarizerDelayOverrideMs"] = 0;

const createContainer = async (
	provider: ITestObjectProvider,
	disableSummary: boolean = true,
	logger?: ITelemetryLogger,
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
		undefined,
		registryStoreEntries,
	);
}

async function waitForSummaryOp(container: IContainer) {
	await new Promise<void>((resolve) => {
		container.deltaManager.on("op", (op: ISequencedDocumentMessage) => {
			if (op.type === MessageType.Summarize) {
				resolve();
			}
		});
	});
}

describeNoCompat(
	"Data store realized between startSummary and summarize",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;

		beforeEach(async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
		});

		itExpects(
			"summarizeOnDemand should fail with NodeDidNotRunGC error when data store is created during summarize",
			[
				{
					eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
					clientType: "noninteractive/summarizer",
					error: "NodeDidNotRunGC",
				},
			],
			async () => {
				const container = await createContainer(provider);
				await waitForContainerConnection(container);
				const rootDataObject = await requestFluidObject<RootTestDataObject>(container, "/");
				const dataObject = await dataStoreFactory1.createInstance(
					rootDataObject.containerRuntime,
				);
				rootDataObject._root.set("store", dataObject.handle);
				const { summarizer } = await createSummarizer(provider, container);

				// This should not fail
				await assert.rejects(
					async () => {
						await provider.ensureSynchronized();
						await summarizeNow(summarizer);
					},
					(error) => {
						return error.message === "NodeDidNotRunGC";
					},
					"expected NodeDidNotRunGC",
				);
			},
		);

		itExpects(
			"Heuristic summaries should pass on second attempt when NodeDidNotRunGC is hit",
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
				const logger = new MockLogger();
				const mainContainer = await createContainer(
					provider,
					false /* disableSummary */,
					logger,
				);
				const rootDataObject = await requestFluidObject<RootTestDataObject>(
					mainContainer,
					"/",
				);
				const dataObject = await dataStoreFactory1.createInstance(
					rootDataObject.containerRuntime,
				);
				rootDataObject._root.set("store", dataObject.handle);
				await waitForContainerConnection(mainContainer);

				await timeoutAwait(waitForSummaryOp(mainContainer), {
					errorMsg: "Timeout on waiting for summary op",
				});

				const summaryEvents = logger.events.filter((event) => {
					return event.eventName.includes("summar") === true;
				});
				assert(summaryEvents !== undefined);

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
						eventName:
							"fluid:telemetry:FluidDataStoreContext:DataStoreCreatedInSummarizer",
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
	},
);
