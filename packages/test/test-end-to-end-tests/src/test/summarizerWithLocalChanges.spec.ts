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
import { IContainerRuntimeOptions, ISummarizer } from "@fluidframework/container-runtime";
import {
	ITestObjectProvider,
	waitForContainerConnection,
	summarizeNow,
	createSummarizerCore,
	defaultSummaryOptions,
	mockConfigProvider,
} from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluid-internal/test-version-utils";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { FluidDataStoreRuntime, mixinSummaryHandler } from "@fluidframework/datastore";
import { SummaryType } from "@fluidframework/protocol-definitions";

const runtimeOptions: IContainerRuntimeOptions = {
	summaryOptions: {
		summaryConfigOverrides: { state: "disabled" },
	},
};
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

	public createdDataStoreId?: string;

	protected async hasInitialized() {
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		this.init();
	}

	private async init() {
		const dataObject2 = await rootDataObjectFactory.createInstance(
			this.context.containerRuntime,
		);
		this.root.set(this.datastoreKey, dataObject2.handle);
		this.createdDataStoreId = dataObject2.id;
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
const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
	rootDataObjectFactory,
	registryStoreEntries,
	undefined,
	[],
	runtimeOptions,
);

async function createSummarizer(
	provider: ITestObjectProvider,
	container: IContainer,
	summaryVersion?: string,
) {
	const summarizerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
		rootDataObjectFactory,
		registryStoreEntries,
		undefined,
		[],
		{ summaryOptions: defaultSummaryOptions },
	);
	const loader = provider.createLoader(
		[[provider.defaultCodeDetails, summarizerRuntimeFactory]],
		{
			configProvider: mockConfigProvider(),
		},
	);
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return createSummarizerCore(container, loader, summaryVersion);
}

describeNoCompat(
	"Data store realized between startSummary and summarize",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;

		const createContainer = async (): Promise<IContainer> => {
			return provider.createContainer(runtimeFactory);
		};

		async function waitForSummary(summarizer: ISummarizer, refreshLatestAck?: boolean) {
			// Wait for all pending ops to be processed by all clients.
			await provider.ensureSynchronized();
			const summaryResult = await summarizeNow(summarizer, "test", refreshLatestAck);
			return summaryResult;
		}

		beforeEach(async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
		});

		itExpects(
			"NodeDidNotRunGC error",
			[
				{ eventName: "fluid:telemetry:SummarizerNode:NodeDidNotRunGC" },
				{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel" },
				{ eventName: "fluid:telemetry:Summarizer:Running:gcUnknownOutboundReferences" },
			],
			async () => {
				const container = await createContainer();
				await waitForContainerConnection(container);
				const rootDataObject = await requestFluidObject<RootTestDataObject>(container, "/");
				const dataObject = await dataStoreFactory1.createInstance(
					rootDataObject.containerRuntime,
				);
				rootDataObject._root.set("store", dataObject.handle);
				const { summarizer } = await createSummarizer(provider, container);

				// This should not fail
				await assert.rejects(
					waitForSummary(summarizer),
					(error) => {
						return error.message === "NodeDidNotRunGC";
					},
					"expected NodeDidNotRunGC",
				);

				const secondSummary = await waitForSummary(summarizer, true /* refreshLatestAck */);
				const tree = secondSummary.summaryTree;
				const runtimeSummary = tree.tree[".channels"];
				assert(
					runtimeSummary.type === SummaryType.Tree,
					"DataStores summary should be a tree",
				);
				assert(
					dataObject.createdDataStoreId !== undefined,
					"expected a datastore to be created!",
				);
				const datastoreSummary = runtimeSummary.tree[dataObject.createdDataStoreId];
				assert(
					datastoreSummary.type === SummaryType.Tree,
					"DataStore summary should be a tree",
				);
				// The datastore should be referenced instead of unreferenced
				assert(
					datastoreSummary.unreferenced !== undefined,
					"Data store should be unreferenced",
				);
			},
		);
	},
);
