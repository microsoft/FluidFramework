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
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import {
	ITestObjectProvider,
	mockConfigProvider,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluid-internal/test-version-utils";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { FluidDataStoreRuntime, mixinSummaryHandler } from "@fluidframework/datastore";
import { ISummaryContent, MessageType } from "@fluidframework/protocol-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { Deferred, delay } from "@fluidframework/common-utils";
import {
	ContainerRuntime,
	IContainerRuntimeOptions,
	ISummaryConfigurationHeuristics,
} from "@fluidframework/container-runtime";

export const rootDataObjectType = "@fluid-example/rootDataObject";
export const TestDataObjectType1 = "@fluid-example/test-dataStore1";

class TestDataObject1 extends DataObject {
	public get _root() {
		return this.root;
	}

	public get _context() {
		return this.context;
	}

	private readonly key1 = "1";
	private readonly key2 = "2";

	protected async initializingFromExisting(): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		this.init();
	}

	private async init() {
		const handle1 = this.root.get<IFluidHandle<RootTestDataObject>>(this.key1);
		const handle2 = this.root.get<IFluidHandle<RootTestDataObject>>(this.key2);
		if (handle1 !== undefined && handle2 !== undefined) {
			await handle1.get();
			await handle2.get();
			return;
		}
		const dataObject1 = await rootDataObjectFactory.createInstance(
			this.context.containerRuntime,
		);
		this.root.set(this.key1, dataObject1.handle);

		await delay(100);

		const dataObject2 = await rootDataObjectFactory.createInstance(
			this.context.containerRuntime,
		);
		this.root.set(this.key2, dataObject2.handle);
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
const getComponent = async (runtime: FluidDataStoreRuntime) => {
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
	mixinSummaryHandler(getComponent),
);

const registryStoreEntries = new Map<string, Promise<IFluidDataStoreFactory>>([
	[rootDataObjectFactory.type, Promise.resolve(rootDataObjectFactory)],
	[dataStoreFactory1.type, Promise.resolve(dataStoreFactory1)],
]);

const summaryConfigOverrides: ISummaryConfigurationHeuristics = {
	state: "enabled",
	minIdleTime: 0,
	maxIdleTime: 1000, // 1 sec.
	maxTime: 60 * 1000, // 1 min.
	maxOps: 2, // Summarize if x weighted ops received since last snapshot.
	minOpsForLastSummaryAttempt: 10,
	maxAckWaitTime: 3 * 60 * 1000, // 3 mins.
	maxOpsSinceLastSummary: 7000,
	initialSummarizerDelayMs: 0, // 0 secs.
	nonRuntimeOpWeight: 0.1,
	runtimeOpWeight: 1.0,
	nonRuntimeHeuristicThreshold: 20,
};

const runtimeOptions: IContainerRuntimeOptions = {
	summaryOptions: {
		summaryConfigOverrides,
	},
};

const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
	rootDataObjectFactory,
	registryStoreEntries,
	undefined,
	[],
	runtimeOptions,
);

/**
 * Validates the scenario in which, during summarization, a data store is loaded out of order.
 */
describeNoCompat("Summary where data store is loaded out of order", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	const settings = {};
	settings["Fluid.ContainerRuntime.Test.SummaryStateUpdateMethod"] = "restart";
	settings["Fluid.ContainerRuntime.Test.CloseSummarizerDelayOverrideMs"] = 0;
	const createContainer = async (): Promise<IContainer> => {
		return provider.createContainer(runtimeFactory, {
			configProvider: mockConfigProvider(settings),
		});
	};

	const loadContainer = async (summaryVersion?: string): Promise<IContainer> => {
		return provider.loadContainer(
			runtimeFactory,
			{ configProvider: mockConfigProvider(settings) },
			{
				[LoaderHeader.version]: summaryVersion,
			},
		);
	};

	async function waitForSummary(containerRuntime: ContainerRuntime) {
		// Wait for all pending ops to be processed by all clients.
		const deferred = new Deferred<ISummaryContent>();
		containerRuntime.deltaManager.on("op", (op) => {
			if (op.type === MessageType.Summarize) {
				deferred.resolve(op.contents as ISummaryContent);
			}
		});
		return deferred.promise;
	}

	beforeEach(async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	itExpects(
		"No Summary Upload Error when DS gets realized between summarize and completeSummary",
		[
			{ eventName: "fluid:telemetry:SummarizerNode:NodeDidNotRunGC" },
			{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel" },
			{ eventName: "fluid:telemetry:Summarizer:Running:FailToSummarize" },
			{ eventName: "fluid:telemetry:SummarizerNode:NodeDidNotRunGC" },
			{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel" },
			{ eventName: "fluid:telemetry:Summarizer:Running:FailToSummarize" },
			{ eventName: "fluid:telemetry:SummarizerNode:NodeDidNotRunGC" },
			{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel" },
			{ eventName: "fluid:telemetry:Summarizer:Running:FailToSummarize" },
			{ eventName: "fluid:telemetry:SummarizerNode refreshLatestSummary_cancel" },
		],
		async () => {
			const container = await createContainer();
			await waitForContainerConnection(container);
			const rootDataObject = await requestFluidObject<RootTestDataObject>(container, "/");
			const childDataObject = await dataStoreFactory1.createInstance(
				rootDataObject.containerRuntime,
			);
			rootDataObject._root.set("store", childDataObject.handle);
			await waitForSummary(rootDataObject.containerRuntime as ContainerRuntime);
			childDataObject._root.set("an", "op");
			await waitForSummary(rootDataObject.containerRuntime as ContainerRuntime);
			childDataObject._root.set("another", "op");
			const summaryContent = await waitForSummary(
				rootDataObject.containerRuntime as ContainerRuntime,
			);
			await provider.ensureSynchronized();
			const latestContainer = await loadContainer(summaryContent.handle);
			const rootDataObjectInLatest = await requestFluidObject<RootTestDataObject>(
				latestContainer,
				"/",
			);
			const handle = rootDataObjectInLatest._root.get<IFluidHandle<TestDataObject1>>("store");
			assert(handle !== undefined, "Should have childDataObject handle");
			const dataObject = await handle.get();
			assert(dataObject._root.get("another") === "op", "container should be progressing");
		},
	);
});
