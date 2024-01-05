/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";

import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import {
	DefaultSummaryConfiguration,
	IAckedSummary,
	IContainerRuntimeOptions,
	SummaryCollection,
	ISummaryConfiguration,
} from "@fluidframework/container-runtime";
import { MockLogger, createChildLogger } from "@fluidframework/telemetry-utils";
import {
	ITestObjectProvider,
	createContainerRuntimeFactoryWithDefaultDataStore,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";

describeCompat("Generate Summary Stats", "NoCompat", (getTestObjectProvider, apis) => {
	const {
		dataRuntime: { DataObject, DataObjectFactory },
		containerRuntime: { ContainerRuntimeFactoryWithDefaultDataStore },
	} = apis;
	class TestDataObject extends DataObject {
		public get _root() {
			return this.root;
		}

		public get containerRuntime() {
			return this.context.containerRuntime;
		}
	}

	let provider: ITestObjectProvider;
	const dataObjectFactory = new DataObjectFactory("TestDataObject", TestDataObject, [], []);

	const IdleDetectionTime = 100;
	const summaryConfigOverrides: ISummaryConfiguration = {
		...DefaultSummaryConfiguration,
		...{
			minIdleTime: IdleDetectionTime,
			maxIdleTime: IdleDetectionTime,
			maxTime: IdleDetectionTime * 12,
			initialSummarizerDelayMs: 10,
		},
	};
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides,
		},
		gcOptions: {
			gcAllowed: true,
		},
	};
	const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
		ContainerRuntimeFactoryWithDefaultDataStore,
		{
			defaultFactory: dataObjectFactory,
			registryEntries: [[dataObjectFactory.type, Promise.resolve(dataObjectFactory)]],
			runtimeOptions,
		},
	);

	let mainContainer: IContainer;
	let mainDataStore: TestDataObject;
	let createContainerTimestamp: number;
	let createContainerRuntimeVersion: number;
	let summaryCollection: SummaryCollection;
	let mockLogger: MockLogger;

	const loadContainer = async (summaryVersion?: string): Promise<IContainer> => {
		const requestHeader = {
			[LoaderHeader.version]: summaryVersion,
		};
		return provider.loadContainer(runtimeFactory, { logger: mockLogger }, requestHeader);
	};

	/**
	 * Waits for a summary with the current state of the document (including all in-flight changes). It basically
	 * synchronizes all containers and waits for a summary that contains the last processed sequence number.
	 * @returns the version of this summary. This version can be used to load a Container with the summary associated
	 * with it.
	 */
	async function waitForSummary(): Promise<string> {
		// Send an op which should trigger a summary.
		mainDataStore._root.set("test", "value");
		await provider.ensureSynchronized();
		const ackedSummary: IAckedSummary = await summaryCollection.waitSummaryAck(
			mainContainer.deltaManager.lastSequenceNumber,
		);
		return ackedSummary.summaryAck.contents.handle;
	}

	function validateLoadStats(
		summaryNumber: number,
		containerLoadDataStoreCount: number,
		referencedDataStoreCount: number,
		message: string,
		summarizer: boolean = false,
	) {
		mockLogger.assertMatch(
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:ContainerLoadStats",
					summaryNumber,
					containerLoadDataStoreCount,
					referencedDataStoreCount,
					createContainerTimestamp,
					createContainerRuntimeVersion,
					clientType: summarizer ? "noninteractive/summarizer" : "interactive",
				},
			],
			message,
		);
	}

	beforeEach(async function () {
		provider = getTestObjectProvider();
		if (provider.driver.type === "odsp") {
			this.skip();
		}

		mockLogger = new MockLogger();

		// Create and set up a container for the first client.
		mainContainer = await provider.createContainer(runtimeFactory, { logger: mockLogger });
		mainDataStore = await getContainerEntryPointBackCompat<TestDataObject>(mainContainer);
		// Create and setup a summary collection that will be used to track and wait for summaries.
		summaryCollection = new SummaryCollection(mainContainer.deltaManager, createChildLogger());

		const loadStatEvents = mockLogger.events.filter(
			(event) => event.eventName === "fluid:telemetry:ContainerRuntime:ContainerLoadStats",
		);
		assert(
			loadStatEvents.length === 1,
			"There should only be one event for the created container",
		);
		createContainerTimestamp = loadStatEvents[0].createContainerTimestamp as number;
		createContainerRuntimeVersion = loadStatEvents[0].createContainerRuntimeVersion as number;

		// Validate that the first container's stats are correct. It should load from summaryNumber 0 because it was
		// just created and it shouldn't have loaded any data stores.
		validateLoadStats(0, 0, 0, "First container stats incorrect");
	});

	it("should load summarizer with correct create stats", async function () {
		// Wait for summarizer to load and submit a summary. Validate that it loads from summaryNumber 1 and has
		// 1 data store which is referenced.
		await waitForSummary();
		validateLoadStats(
			1,
			1,
			1,
			"Summarizer should load with correct create stats",
			true /* summarizer */,
		);
	});

	it("should load container with correct create stats", async function () {
		// Wait for summarizer to load and submit a summary. Validate that it loads from summaryNumber 1 and has
		// 1 data store which is referenced.
		const summaryVersion = await waitForSummary();
		validateLoadStats(
			1,
			1,
			1,
			"Summarizer should load with correct create stats",
			true /* summarizer */,
		);

		// Load a new container with the above summary and validate that it loads from summaryNumber 2.
		await loadContainer(summaryVersion);
		validateLoadStats(2, 1, 1, "Second container should load with correct create stats");
	});

	it("should load container with correct data store load stats", async function () {
		// Create another data store so that the data store stats are updated.
		const dataStore2 = await dataObjectFactory.createInstance(mainDataStore.containerRuntime);
		mainDataStore._root.set("dataStore2", dataStore2.handle);

		// Wait for summarizer to load and submit a summary. Validate that it loads from summaryNumber 1. It loads
		// from the first summary which does not have the newly created data store.
		const summaryVersion = await waitForSummary();
		validateLoadStats(
			1,
			1,
			1,
			"Summarizer should load with correct data store stats",
			true /* summarizer */,
		);

		// Load a new container with the above summary and validate that it loads with summaryNumber 2, has 2 data
		// stores and both are referenced.
		await loadContainer(summaryVersion);
		validateLoadStats(2, 2, 2, "Second container should load with correct data store stats");
	});

	it("should load second summarizer with correct stats", async function () {
		// Wait for summarizer to load and submit a summary. Validate that it loads from summaryNumber 1.
		const summaryVersion = await waitForSummary();
		validateLoadStats(
			1,
			1,
			1,
			"Summarizer should load with correct data store stats",
			true /* summarizer */,
		);

		// Close the main container which should also close the summarizer.
		mainContainer.close();

		// Load and set up a new main container with the above summary and validate that it loads with summaryNumber 2.
		mainContainer = await loadContainer(summaryVersion);
		mainDataStore = await getContainerEntryPointBackCompat<TestDataObject>(mainContainer);
		// Create and setup a summary collection that will be used to track and wait for summaries.
		summaryCollection = new SummaryCollection(mainContainer.deltaManager, createChildLogger());
		validateLoadStats(2, 1, 1, "Second container should load with correct data store stats");

		// Wait for summary and validate that the new summarizer loads from summary number 2 as well.
		await waitForSummary();
		validateLoadStats(
			2,
			1,
			1,
			"Summarizer should load with correct data store stats",
			true /* summarizer */,
		);
	});
});
