/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
	IDataObjectProps,
	getDefaultObjectFromContainer,
} from "@fluidframework/aqueduct";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { IFluidHandle, IRequestHeader } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import {
	createAndAttachContainer,
	createLoader,
	createDocumentId,
	LoaderContainerTracker,
	ITestObjectProvider,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { ContainerRuntime, ISummarizer, Summarizer } from "@fluidframework/container-runtime";

const counterKey = "count";

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

// REVIEW: enable compat testing?
describeNoCompat("LoadModes", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	before(() => {
		provider = getTestObjectProvider();
	});

	const loaderContainerTracker = new LoaderContainerTracker();

	let documentId: string;
	let container1: IContainer;
	let dataObject1: TestDataObject;

	beforeEach(async () => {
		documentId = createDocumentId();
		container1 = await createContainer();
		dataObject1 = await getDefaultObjectFromContainer<TestDataObject>(container1);
	});

	afterEach(() => {
		loaderContainerTracker.reset();
	});

	async function createContainer(): Promise<IContainer> {
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
			testDataObjectFactory,
			[[testDataObjectFactory.type, Promise.resolve(testDataObjectFactory)]],
			undefined,
		);
		const loader = createLoader(
			[[provider.defaultCodeDetails, runtimeFactory]],
			provider.documentServiceFactory,
			provider.urlResolver,
			provider.logger,
		);
		loaderContainerTracker.add(loader);
		const container = await createAndAttachContainer(
			provider.defaultCodeDetails,
			loader,
			provider.driver.createCreateNewRequest(documentId),
		);
		return container;
	}

	async function loadContainer(
		containerUrl: IResolvedUrl | undefined,
		factory: IFluidDataStoreFactory,
		headers?: IRequestHeader,
	): Promise<IContainer> {
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
			factory,
			[[factory.type, Promise.resolve(factory)]],
			undefined,
		);
		const loader = createLoader(
			[[provider.defaultCodeDetails, runtimeFactory]],
			provider.documentServiceFactory,
			provider.urlResolver,
			provider.logger,
		);
		loaderContainerTracker.add(loader);
		return loader.resolve({
			url: await provider.driver.createContainerUrl(documentId, containerUrl),
			headers,
		});
	}

	async function createSummarizerFromContainer(container: IContainer): Promise<ISummarizer> {
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
			testDataObjectFactory,
			[[testDataObjectFactory.type, Promise.resolve(testDataObjectFactory)]],
			undefined,
		);
		const loader = createLoader(
			[[provider.defaultCodeDetails, runtimeFactory]],
			provider.documentServiceFactory,
			provider.urlResolver,
			provider.logger,
		);
		loaderContainerTracker.add(loader);
		const absoluteUrl = await container.getAbsoluteUrl("");
		if (absoluteUrl === undefined) {
			throw new Error("URL could not be resolved");
		}
		const summarizer = await Summarizer.create(loader, absoluteUrl);
		await waitForSummarizerConnection(summarizer);
		return summarizer;
	}

	async function waitForSummarizerConnection(summarizer: ISummarizer): Promise<void> {
		const runtime = (summarizer as any).runtime as ContainerRuntime;
		if (!runtime.connected) {
			return new Promise((resolve) => runtime.once("connected", () => resolve()));
		}
	}

	it("Can load a paused container", async () => {
		const headers: IRequestHeader = {
			[LoaderHeader.loadMode]: {
				pauseAfterLoad: true,
			},
		};
		const container2 = await loadContainer(
			container1.resolvedUrl,
			testDataObjectFactory,
			headers,
		);
		const initialSequenceNumber = container2.deltaManager.lastSequenceNumber;
		const dataObject2 = await getDefaultObjectFromContainer<TestDataObject>(container2);
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

		const headers: IRequestHeader = {
			[LoaderHeader.loadMode]: {
				pauseAfterLoad: true,
				opsBeforeReturn: "sequenceNumber",
			},
			[LoaderHeader.sequenceNumber]: sequenceNumber,
		};
		const container2 = await loadContainer(
			container1.resolvedUrl,
			testDataObjectFactory,
			headers,
		);
		const dataObject2 = await getDefaultObjectFromContainer<TestDataObject>(container2);

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
		const summarizer = await createSummarizerFromContainer(container1);
		// Send 5 ops
		const numIncrement = 5;
		for (let i = 0; i < numIncrement; i++) {
			dataObject1.increment();
		}
		await loaderContainerTracker.ensureSynchronized(container1);
		const result = summarizer.summarizeOnDemand({ reason: "test" });
		const submitResult = await result.receivedSummaryAckOrNack;
		assert.ok(submitResult);

		// Record sequence number we want to pause at, and the expected value at that sequence number
		const sequenceNumber = container1.deltaManager.lastSequenceNumber;
		const expectedValue = dataObject1.value;

		const headers: IRequestHeader = {
			[LoaderHeader.loadMode]: {
				pauseAfterLoad: true,
				opsBeforeReturn: "sequenceNumber",
			},
			[LoaderHeader.sequenceNumber]: sequenceNumber,
		};
		const container2 = await loadContainer(
			container1.resolvedUrl,
			testDataObjectFactory,
			headers,
		);
		const dataObject2 = await getDefaultObjectFromContainer<TestDataObject>(container2);

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

	describe("Expected error cases", () => {
		it("Throw if sequence number not provided", async () => {
			const headers: IRequestHeader = {
				[LoaderHeader.loadMode]: {
					opsBeforeReturn: "sequenceNumber",
				},
			};
			await assert.rejects(
				loadContainer(container1.resolvedUrl, testDataObjectFactory, headers),
				{ message: "sequenceNumber must be set to a non-negative integer" },
			);
		});

		it('Throw if sequence number is a negative integer"', async () => {
			const headers: IRequestHeader = {
				[LoaderHeader.loadMode]: {
					opsBeforeReturn: "sequenceNumber",
				},
				[LoaderHeader.sequenceNumber]: -1,
			};
			await assert.rejects(
				loadContainer(container1.resolvedUrl, testDataObjectFactory, headers),
				{ message: "sequenceNumber must be set to a non-negative integer" },
			);
		});

		it('Throw if opsBeforeReturn is not set to "sequenceNumber"', async () => {
			const headers: IRequestHeader = {
				[LoaderHeader.sequenceNumber]: 0, // Actual value doesn't matter
			};
			await assert.rejects(
				loadContainer(container1.resolvedUrl, testDataObjectFactory, headers),
				{ message: 'opsBeforeReturn must be set to "sequenceNumber"' },
			);
		});

		it("Throw if attempting to pause at a sequence number before the latest summary", async () => {
			const summarizer = await createSummarizerFromContainer(container1);
			// Send 5 ops
			const numIncrement = 5;
			for (let i = 0; i < numIncrement; i++) {
				dataObject1.increment();
			}
			await loaderContainerTracker.ensureSynchronized(container1);
			const result = summarizer.summarizeOnDemand({ reason: "test" });
			const submitResult = await result.receivedSummaryAckOrNack;
			assert.ok(submitResult);

			// Try to pause at sequence number 1 (before snapshot)
			const sequenceNumber = 3;
			const headers: IRequestHeader = {
				[LoaderHeader.loadMode]: {
					pauseAfterLoad: true,
					opsBeforeReturn: "sequenceNumber",
				},
				[LoaderHeader.sequenceNumber]: sequenceNumber,
			};
			await assert.rejects(
				loadContainer(container1.resolvedUrl, testDataObjectFactory, headers),
				{
					message:
						"Cannot satisfy request to pause the container at the specified sequence number. Most recent snapshot is newer than the specified sequence number.",
				},
			);
		});
	});
});
