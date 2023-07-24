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
} from "@fluidframework/aqueduct";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { IFluidHandle, IRequest, IRequestHeader } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IContainerRuntimeBase, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import {
	createAndAttachContainer,
	createLoader,
	createDocumentId,
	LoaderContainerTracker,
	ITestObjectProvider,
	ITestContainerConfig,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { DefaultSummaryConfiguration } from "@fluidframework/container-runtime";

const counterKey = "count";

/**
 * Implementation of counter dataObject for testing.
 */
export class TestDataObject extends DataObject {
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
	[SharedCounter.getFactory(), SharedString.getFactory()],
	{},
);

// REVIEW: enable compat testing?
describeNoCompat.only("LoadModes", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	before(() => {
		provider = getTestObjectProvider();
	});

	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: {
					...DefaultSummaryConfiguration,
					...{
						maxOps: 10,
						initialSummarizerDelayMs: 0,
						minIdleTime: 10,
						maxIdleTime: 10,
					},
				},
			},
		},
	};

	const loaderContainerTracker = new LoaderContainerTracker();

	let documentId: string;
	let container1: IContainer;
	let dataObject1: TestDataObject;

	beforeEach(async () => {
		documentId = createDocumentId();
		container1 = await createContainer();
		dataObject1 = await requestFluidObject<TestDataObject>(container1, "default");
	});

	afterEach(() => {
		loaderContainerTracker.reset();
	});

	async function createContainer(): Promise<IContainer> {
		const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
			runtime.IFluidHandleContext.resolveHandle(request);

		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
			testDataObjectFactory,
			[[testDataObjectFactory.type, Promise.resolve(testDataObjectFactory)]],
			undefined,
			[innerRequestHandler],
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
		const inner = async (request: IRequest, runtime: IContainerRuntimeBase) =>
			runtime.IFluidHandleContext.resolveHandle(request);
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
			factory,
			[[factory.type, Promise.resolve(factory)]],
			undefined,
			[inner],
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
		const dataObject2 = await requestFluidObject<TestDataObject>(container2, "default");
		const initialValue = dataObject2.value;

		assert.strictEqual(dataObject1.value, dataObject2.value, "counter values should be equal");

		dataObject1.increment();
		await loaderContainerTracker.ensureSynchronized(container1);

		assert.notEqual(dataObject1.value, dataObject2.value, "counter values should not be equal");
		assert.notEqual(
			container1.deltaManager.lastSequenceNumber,
			container2.deltaManager.lastSequenceNumber,
			"container sequence numbers should not be equal",
		);
		assert.strictEqual(
			initialValue,
			dataObject2.value,
			"sharedCounter2 should still be the initial value",
		);
	});

	it("Can load a paused container at a specific sequence number", async () => {
		// Min 5 ops, max 15 ops
		const numIncrement = Math.round(Math.random() * 10) + 5;
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
		const dataObject2 = await requestFluidObject<TestDataObject>(container2, "default");

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

		assert.notEqual(dataObject1.value, dataObject2.value, "counter values should not be equal");
		assert.notEqual(
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
			try {
				await loadContainer(container1.resolvedUrl, testDataObjectFactory, headers);
				assert.fail("Did not throw expected error");
			} catch (e: any) {
				const expectedError = "sequenceNumber must be set to a non-negative integer";
				assert.ok(e.message);
				assert.strictEqual(e.message, expectedError, "Did not get expected error message");
			}
		});

		it('Throw if sequence number is a negative integer"', async () => {
			const headers: IRequestHeader = {
				[LoaderHeader.loadMode]: {
					opsBeforeReturn: "sequenceNumber",
				},
				[LoaderHeader.sequenceNumber]: -1,
			};
			try {
				await loadContainer(container1.resolvedUrl, testDataObjectFactory, headers);
				assert.fail("Did not throw expected error");
			} catch (e: any) {
				const expectedError = "sequenceNumber must be set to a non-negative integer";
				assert.ok(e.message);
				assert.strictEqual(e.message, expectedError, "Did not get expected error message");
			}
		});

		it('Throw if opsBeforeReturn is not set to "sequenceNumber"', async () => {
			const headers: IRequestHeader = {
				[LoaderHeader.sequenceNumber]: 0, // Actual value doesn't matter
			};
			try {
				await loadContainer(container1.resolvedUrl, testDataObjectFactory, headers);
				assert.fail("Did not throw expected error");
			} catch (e: any) {
				const expectedError = 'opsBeforeReturn must be set to "sequenceNumber"';
				assert.ok(e.message);
				assert.strictEqual(e.message, expectedError, "Did not get expected error message");
			}
		});
	});
});
