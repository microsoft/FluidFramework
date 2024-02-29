/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	ITestObjectProvider,
	TestContainerRuntimeFactory,
	TestFluidObjectFactory,
	TestFluidObject,
	TestObjectProvider,
	summarizeNow,
	createSummarizerCore,
} from "@fluidframework/test-utils";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IContainer, IHostLoader } from "@fluidframework/container-definitions";
import {
	IContainerRuntimeOptions,
	ISummarizer,
	ISummaryRuntimeOptions,
	SummaryCollection,
	DataStoresFactory,
} from "@fluidframework/container-runtime";
import { LocalServerTestDriver } from "@fluid-private/test-drivers";
import { describeCompat } from "@fluid-private/test-version-utils";
import { Loader } from "@fluidframework/container-loader";
import { createChildLogger } from "@fluidframework/telemetry-utils";
import { IFluidDataStoreChannel } from "@fluidframework/runtime-definitions";

interface IDataStores extends IFluidDataStoreChannel {
	_createFluidDataStoreContext(
		pkg: string[],
		id: string,
		props?: any,
		loadingGroupId?: string,
	): unknown;
}

describeCompat("Nested DataStores", "NoCompat", (_getTestObjectProvider, apis) => {
	const { SharedMap } = apis.dds;

	let provider: ITestObjectProvider;
	let containers: IContainer[] = [];
	let summaryCollection: SummaryCollection | undefined;
	let summarizer: ISummarizer | undefined;
	let loader: IHostLoader | undefined;
	let seed: number;

	const summaryOptionsToDisableHeuristics: ISummaryRuntimeOptions = {
		summaryConfigOverrides: {
			state: "disableHeuristics",
			maxAckWaitTime: 20000,
			maxOpsSinceLastSummary: 7000,
			initialSummarizerDelayMs: 0,
		},
	};

	const runtimeOptions: IContainerRuntimeOptions = {
		enableGroupedBatching: true,
		summaryOptions: summaryOptionsToDisableHeuristics, // Force summarizer heuristics to be disabled so we can control when to summarize.
	};

	const testObjectFactory: TestFluidObjectFactory = new TestFluidObjectFactory(
		[["test", SharedMap.getFactory()]],
		"testObjectFactoryType",
	);

	const dataStoreFactory = new DataStoresFactory(
		[[testObjectFactory.type, Promise.resolve(testObjectFactory)]],
		async (runtime: IFluidDataStoreChannel) => {
			return runtime;
		},
	);

	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataStoreFactory,
		registryEntries: [[dataStoreFactory.type, Promise.resolve(dataStoreFactory)]],
		runtimeOptions,
	});

	async function addContainer(container: IContainer) {
		containers.push(container);
		const dataStores = (await container.getEntryPoint()) as IDataStores;

		await provider.ensureSynchronized();

		return { container, dataStores };
	}

	const createContainer = async () => {
		const container = await provider.createContainer(runtimeFactory);
		return addContainer(container);
	};

	async function addContainerInstance() {
		const container = await provider.loadContainer(runtimeFactory);
		return addContainer(container);
	}

	beforeEach("getTestObjectProvider", async () => {
		const driver = new LocalServerTestDriver();
		const registry = [];
		seed = 1;
		provider = new TestObjectProvider(
			Loader,
			driver,
			() =>
				new TestContainerRuntimeFactory(
					"@fluid-experimental/test-dataStores",
					new TestFluidObjectFactory(registry),
				),
		);
		provider.resetLoaderContainerTracker(true); // syncSummarizerClients

		loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory]]);
	});

	afterEach(() => {
		provider.reset();
		for (const container of containers) {
			container.close();
		}
		containers = [];
		summaryCollection = undefined;
		summarizer = undefined;
		loader = undefined;
	});

	async function waitForSummary(): Promise<string> {
		// ensure that all changes made it through
		await provider.ensureSynchronized();

		assert(summaryCollection !== undefined, "summary setup properly");
		// create promise before we call summarizeNow, as otherwise we might miss summary and will wait
		// forever for next one to happen
		const wait = summaryCollection.waitSummaryAck(
			containers[0].deltaManager.lastSequenceNumber,
		);
		assert(summarizer !== undefined, "The summarizer should be initialized");
		const summaryResult = await summarizeNow(summarizer);
		assert(summaryResult.summaryVersion !== undefined, "summary result");
		const ackedSummary = await wait;
		assert(ackedSummary.summaryAck.contents.handle !== undefined, "summary acked");
		return summaryResult.summaryVersion;
	}

	/**
	 * Creates a pair of containers and initializes them with initial state
	 * @returns collab space
	 */
	async function initialize() {
		const { container, dataStores } = await createContainer();

		// Create and setup a summary collection that will be used to track and wait for summaries.
		summaryCollection = new SummaryCollection(container.deltaManager, createChildLogger());

		assert(loader !== undefined, "The loader should be initialized");
		const summarizerRes = await createSummarizerCore(container, loader);
		summarizer = summarizerRes.summarizer;

		// Have a second container that follows passively the first one
		await addContainerInstance();

		await provider.ensureSynchronized();

		return dataStores;
	}

	it("Basic test", async () => {
		const dataStores = await initialize();

		const res1 = dataStores._createFluidDataStoreContext([testObjectFactory.type], "test");
		const res2 = await (res1 as any).realize();
		res2.makeVisibleAndAttachGraph();
		const testObject1 = (await dataStores.request({ url: "/test" })).value as TestFluidObject;
		testObject1.root.set("testKey", 100);

		await waitForSummary();
		const dataStores2 = (await addContainerInstance()).dataStores;

		await provider.ensureSynchronized();

		const testObject2 = (await dataStores2.request({ url: "/test" })).value as TestFluidObject;
		const value = testObject2.root.get("testKey");
		assert(value === 100, "same value");
	});
});
