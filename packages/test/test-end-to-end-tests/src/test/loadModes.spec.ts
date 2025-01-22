/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { type CompatApis, describeCompat, itExpects } from "@fluid-private/test-version-utils";
import type { IDataObjectProps } from "@fluidframework/aqueduct/internal";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions/internal";
import { loadContainerPaused } from "@fluidframework/container-loader/internal";
import { IFluidHandle, IRequestHeader } from "@fluidframework/core-interfaces";
import type { SharedCounter } from "@fluidframework/counter/internal";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import { IResolvedUrl } from "@fluidframework/driver-definitions/internal";
import type { ISharedMap } from "@fluidframework/map/internal";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";
import {
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	LoaderContainerTracker,
	createAndAttachContainer,
	createDocumentId,
	createLoader,
	createLoaderProps,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils/internal";

const counterKey = "count";

// REVIEW: enable compat testing?
describeCompat("LoadModes", "NoCompat", (getTestObjectProvider, apis: CompatApis) => {
	const { SharedCounter } = apis.dds;
	const { DataObject, DataObjectFactory } = apis.dataRuntime;
	const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;

	/**
	 * Implementation of counter dataObject for testing.
	 */
	class TestDataObject extends DataObject {
		public static readonly type = "@fluid-example/test-dataObject";

		public static getFactory() {
			return TestDataObject.factory;
		}

		private static readonly factory = new DataObjectFactory(
			TestDataObject.type,
			TestDataObject,
			[],
			{},
		);

		private counter!: SharedCounter;

		/**
		 * Expose the runtime for testing purposes.
		 */

		public runtime: IFluidDataStoreRuntime;

		public constructor(props: IDataObjectProps) {
			super(props);
			this.runtime = props.runtime;
		}

		/**
		 * Gets the current counter value.
		 */
		public get value(): number {
			return this.counter.value;
		}

		/**
		 * Increments the counter value by 1.
		 */
		public increment() {
			this.counter.increment(1);
		}

		protected async initializingFirstTime() {
			const counter = SharedCounter.create(this.runtime);
			this.root.set(counterKey, counter.handle);
		}

		protected async hasInitialized() {
			const counterHandle = this.root.get<IFluidHandle<SharedCounter>>(counterKey);
			assert(counterHandle);
			this.counter = await counterHandle.get();
		}
	}

	const testDataObjectFactory = new DataObjectFactory(
		TestDataObject.type,
		TestDataObject,
		[SharedCounter.getFactory()],
		{},
	);

	let provider: ITestObjectProvider;
	before(() => {
		provider = getTestObjectProvider();
	});

	const loaderContainerTracker = new LoaderContainerTracker();

	let documentId: string;
	let container1: IContainer;
	let dataObject1: TestDataObject;

	beforeEach("setup", async () => {
		documentId = createDocumentId();
		container1 = await createContainer();
		dataObject1 = (await container1.getEntryPoint()) as TestDataObject;
	});

	afterEach(() => {
		loaderContainerTracker.reset();
	});

	async function createContainer(): Promise<IContainer> {
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: testDataObjectFactory,
			registryEntries: [[testDataObjectFactory.type, Promise.resolve(testDataObjectFactory)]],
		});
		const loader = createLoader(
			[[provider.defaultCodeDetails, runtimeFactory]],
			provider.documentServiceFactory,
			provider.urlResolver,
			provider.logger,
		);
		const container = await createAndAttachContainer(
			provider.defaultCodeDetails,
			loader,
			provider.driver.createCreateNewRequest(documentId),
		);
		loaderContainerTracker.addContainer(container);
		return container;
	}

	async function loadContainer(
		containerUrl: IResolvedUrl | undefined,
		defaultFactory: IFluidDataStoreFactory,
		headers?: IRequestHeader,
		loadToSequenceNumber?: number,
	): Promise<IContainer> {
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory,
			registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
		});
		const loaderProps = createLoaderProps(
			[[provider.defaultCodeDetails, runtimeFactory]],
			provider.documentServiceFactory,
			provider.urlResolver,
			provider.logger,
		);

		const container = await loadContainerPaused(
			loaderProps,
			{
				url: await provider.driver.createContainerUrl(documentId, containerUrl),
				headers,
			},
			loadToSequenceNumber,
		);
		loaderContainerTracker.addContainer(container);
		return container;
	}

	it("Can load a paused container", async () => {
		const headers: IRequestHeader = {};
		const container2 = await loadContainer(
			container1.resolvedUrl,
			testDataObjectFactory,
			headers,
		);
		const initialSequenceNumber = container2.deltaManager.lastSequenceNumber;
		const dataObject2 = (await container2.getEntryPoint()) as TestDataObject;
		const initialValue = dataObject2.value;

		assert.strictEqual(dataObject1.value, dataObject2.value, "counter values should be equal");

		dataObject1.increment();
		await loaderContainerTracker.ensureSynchronized(container1);

		assert.notStrictEqual(
			dataObject1.value,
			dataObject2.value,
			"counter values should not be equal",
		);
		assert.notStrictEqual(
			container1.deltaManager.lastSequenceNumber,
			container2.deltaManager.lastSequenceNumber,
			"container sequence numbers should not be equal",
		);
		assert.strictEqual(
			initialValue,
			dataObject2.value,
			"sharedCounter2 should still be the initial value",
		);
		assert.strictEqual(
			initialSequenceNumber,
			container2.deltaManager.lastSequenceNumber,
			"container2 should still be at the initial sequence number",
		);
	});

	it("Can load a paused container at a specific sequence number", async () => {
		// Min 5 ops
		const numIncrement = 5;
		for (let i = 0; i < numIncrement; i++) {
			dataObject1.increment();
		}
		await loaderContainerTracker.ensureSynchronized(container1);

		// Record sequence number we want to pause at, and the expected value at that sequence number
		const sequenceNumber = container1.deltaManager.lastSequenceNumber;
		const expectedValue = dataObject1.value;

		const headers: IRequestHeader = {};
		const container2 = await loadContainer(
			container1.resolvedUrl,
			testDataObjectFactory,
			headers,
			sequenceNumber,
		);
		const dataObject2 = (await container2.getEntryPoint()) as TestDataObject;

		assert.strictEqual(
			sequenceNumber,
			container2.deltaManager.lastSequenceNumber,
			"container2 should be at the specified sequence number",
		);
		assert.strictEqual(
			expectedValue,
			dataObject2.value,
			"sharedCounter2 should still be the expected value",
		);
		assert.strictEqual(dataObject1.value, dataObject2.value, "counter values should be equal");

		for (let i = 0; i < numIncrement; i++) {
			dataObject1.increment();
		}
		await loaderContainerTracker.ensureSynchronized(container1);

		assert.notStrictEqual(
			dataObject1.value,
			dataObject2.value,
			"counter values should not be equal",
		);
		assert.notStrictEqual(
			container1.deltaManager.lastSequenceNumber,
			container2.deltaManager.lastSequenceNumber,
			"container sequence numbers should not be equal",
		);

		assert.strictEqual(
			sequenceNumber,
			container2.deltaManager.lastSequenceNumber,
			"container2 should still be at the specified sequence number",
		);
	});

	it("Can load a paused container after a summary", async () => {
		const { summarizer } = await createSummarizerFromFactory(
			provider,
			container1,
			testDataObjectFactory,
		);
		// Send 5 ops
		const numIncrement = 5;
		for (let i = 0; i < numIncrement; i++) {
			dataObject1.increment();
		}
		await loaderContainerTracker.ensureSynchronized(container1);
		const result = await summarizeNow(summarizer);

		// Record sequence number we want to pause at, and the expected value at that sequence number
		const sequenceNumber = container1.deltaManager.lastSequenceNumber;
		const expectedValue = dataObject1.value;

		const headers: IRequestHeader = {
			// Force the container to load from the latest created summary instead of using the cached version. Latest snapshot is in cache is updated async so could cause test flakiness.
			[LoaderHeader.version]: result.summaryVersion,
		};
		const container2 = await loadContainer(
			container1.resolvedUrl,
			testDataObjectFactory,
			headers,
			sequenceNumber,
		);
		const dataObject2 = (await container2.getEntryPoint()) as TestDataObject;

		assert.strictEqual(
			sequenceNumber,
			container2.deltaManager.lastSequenceNumber,
			"container2 should be at the specified sequence number",
		);
		assert.strictEqual(
			expectedValue,
			dataObject2.value,
			"sharedCounter2 should still be the expected value",
		);

		for (let i = 0; i < numIncrement; i++) {
			dataObject1.increment();
		}
		await loaderContainerTracker.ensureSynchronized(container1);

		assert.notStrictEqual(
			dataObject1.value,
			dataObject2.value,
			"counter values should not be equal",
		);
		assert.notStrictEqual(
			container1.deltaManager.lastSequenceNumber,
			container2.deltaManager.lastSequenceNumber,
			"container sequence numbers should not be equal",
		);

		assert.strictEqual(
			sequenceNumber,
			container2.deltaManager.lastSequenceNumber,
			"container2 should still be at the specified sequence number",
		);
	});

	it("forceReadonly works", async () => {
		const mapId = "mapKey";
		const testContainerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry: [[mapId, apis.dds.SharedMap.getFactory()]],
		};
		const created = await provider.makeTestContainer(testContainerConfig);
		const do1 = (await created.getEntryPoint()) as ITestFluidObject;
		const map1 = await do1.getSharedObject<ISharedMap>(mapId);

		const headers: IRequestHeader = {
			[LoaderHeader.cache]: false,
			[LoaderHeader.loadMode]: { deltaConnection: "delayed" },
		};

		const loader = provider.makeTestLoader(testContainerConfig);
		const loaded = await loader.resolve({
			url: await provider.driver.createContainerUrl(provider.documentId),
			headers,
		});
		const do2 = (await loaded.getEntryPoint()) as ITestFluidObject;
		loaded.connect();
		loaded.forceReadonly?.(true);
		const map2 = await do2.getSharedObject<ISharedMap>(mapId);
		map2.set("key1", "1");
		map2.set("key2", "2");
		await provider.ensureSynchronized();

		// The container is in read-only mode, its changes haven't been sent
		assert.strictEqual(map1.get("key1"), undefined);
		assert.strictEqual(map1.get("key2"), undefined);

		// The container's read-only mode is cleared, so the pending ops must be sent
		loaded.forceReadonly?.(false);
		await provider.ensureSynchronized();
		assert.strictEqual(map1.get("key1"), "1");
		assert.strictEqual(map1.get("key2"), "2");
	});

	describe("Expected error cases", () => {
		itExpects(
			"Throw if attempting to pause at a sequence number before the latest summary",
			[{ eventName: "fluid:telemetry:Container:ContainerClose" }],
			async () => {
				const { summarizer } = await createSummarizerFromFactory(
					provider,
					container1,
					testDataObjectFactory,
				);
				// Send 5 ops
				const numIncrement = 5;
				for (let i = 0; i < numIncrement; i++) {
					dataObject1.increment();
				}
				await loaderContainerTracker.ensureSynchronized(container1);
				const result = await summarizeNow(summarizer);

				const headers: IRequestHeader = {
					// Force the container to load from the latest created summary instead of using the cached version. Latest snapshot is in cache is updated async so could cause test flakiness.
					[LoaderHeader.version]: result.summaryVersion,
				};
				// Try to pause at sequence number 1 (before snapshot)
				const loadUptoSeqNumber = 1;
				await assert.rejects(
					loadContainer(
						container1.resolvedUrl,
						testDataObjectFactory,
						headers,
						loadUptoSeqNumber,
					),
					{
						message:
							"Cannot satisfy request to pause the container at the specified sequence number. Most recent snapshot is newer than the specified sequence number.",
					},
				);
			},
		);
	});
});
