/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LocalServerTestDriver } from "@fluid-private/test-drivers";
import { describeCompat } from "@fluid-private/test-version-utils";
import {
	IContainer,
	IHostLoader,
	DisconnectReason,
} from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import {
	ChannelCollection,
	ChannelCollectionFactory,
	ISummarizer,
	SummaryCollection,
	type IContainerRuntimeOptionsInternal,
} from "@fluidframework/container-runtime/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { IFluidDataStoreChannel } from "@fluidframework/runtime-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import {
	ITestObjectProvider,
	TestContainerRuntimeFactory,
	TestFluidObject,
	TestFluidObjectFactory,
	TestObjectProvider,
	createSummarizerCore,
	summarizeNow,
} from "@fluidframework/test-utils/internal";

/**
 * ADO:7302 This needs to be revisited after settling on a set of
 * unified creation APIs for the nested datastores and the container runtime.
 */
interface IDataStores extends IFluidDataStoreChannel {
	createDataStoreContext(pkg: string[], props?: any, loadingGroupId?: string): any;
}

describeCompat("Nested DataStores", "NoCompat", (getTestObjectProvider, apis) => {
	const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;
	const { SharedMap } = apis.dds;

	let provider: ITestObjectProvider;
	let containers: IContainer[] = [];
	let summaryCollection: SummaryCollection | undefined;
	let summarizer: ISummarizer | undefined;
	let loader: IHostLoader | undefined;

	const runtimeOptions: IContainerRuntimeOptionsInternal = {
		enableGroupedBatching: true,
		// Force summarizer heuristics to be disabled so we can control when to summarize
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disableHeuristics",
				maxAckWaitTime: 20000,
				maxOpsSinceLastSummary: 7000,
				initialSummarizerDelayMs: 0,
			},
		},
	};

	const testObjectFactory: TestFluidObjectFactory = new TestFluidObjectFactory(
		[["test", SharedMap.getFactory()]],
		"testObjectFactoryType",
	);

	const dataStoreFactory = new ChannelCollectionFactory(
		[[testObjectFactory.type, Promise.resolve(testObjectFactory)]],
		async (runtime: IFluidDataStoreChannel) => runtime,
		(...args: ConstructorParameters<typeof ChannelCollection>) =>
			new ChannelCollection(...args),
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
		// ADO:7302 We need another test object provider
		provider = new TestObjectProvider(
			Loader,
			driver,
			() =>
				new TestContainerRuntimeFactory(
					"@fluid-experimental/test-dataStores",
					new TestFluidObjectFactory(registry),
				),
		);
		provider.resetLoaderContainerTracker(true);
		loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory]]);
	});

	afterEach(() => {
		provider.reset();
		for (const container of containers) {
			container.close(DisconnectReason.Expected);
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

		const context = dataStores.createDataStoreContext([testObjectFactory.type]);
		const url = `/${context.id}`;
		const channel = await context.realize();
		channel.makeVisibleAndAttachGraph();
		const testObject1 = (await dataStores.request({ url })).value as TestFluidObject;
		testObject1.root.set("testKey", 100);

		await waitForSummary();
		const dataStores2 = (await addContainerInstance()).dataStores;

		await provider.ensureSynchronized();

		const testObject2 = (await dataStores2.request({ url })).value as TestFluidObject;
		const value = testObject2.root.get("testKey");
		assert(value === 100, "same value");
	});
});
