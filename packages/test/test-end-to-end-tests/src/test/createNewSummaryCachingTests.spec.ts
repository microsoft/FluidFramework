/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
	ITestObjectProvider,
	createContainerRuntimeFactoryWithDefaultDataStore,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import {
	IContainerRuntimeOptions,
	ISummaryConfiguration,
	DefaultSummaryConfiguration,
} from "@fluidframework/container-runtime";
import { AttachState } from "@fluidframework/container-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { wrapObjectAndOverride } from "../mocking.js";

describeCompat("Cache CreateNewSummary", "NoCompat", (getTestObjectProvider, apis) => {
	const {
		dataRuntime: { DataObject, DataObjectFactory },
		containerRuntime: { ContainerRuntimeFactoryWithDefaultDataStore },
	} = apis;
	class TestDataObject extends DataObject {
		public get _root() {
			return this.root;
		}
		public get _context() {
			return this.context;
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

	let mockLogger: MockLogger;

	beforeEach("getTestObjectProvider", function () {
		provider = getTestObjectProvider();
		// Currently, only ODSP caches new summary.
		if (provider.driver.type !== "odsp") {
			this.skip();
		}
	});

	it("should fetch from cache when second client loads the container", async function () {
		// GitHub issue: #9534
		if (provider.driver.type === "odsp") {
			this.skip();
		}

		mockLogger = new MockLogger();

		// Create a container for the first client.
		const mainContainer = await provider.createContainer(runtimeFactory, {
			logger: mockLogger,
		});
		assert.strictEqual(
			mainContainer.attachState,
			AttachState.Attached,
			"container was not attached",
		);

		// getting default data store and create a new data store
		const mainDataStore = (await mainContainer.getEntryPoint()) as TestDataObject;
		const dataStore2 = await dataObjectFactory.createInstance(
			mainDataStore._context.containerRuntime,
		);
		mainDataStore._root.set("dataStore2", dataStore2.handle);

		// second client loads the container
		const container2 = await provider.loadContainer(runtimeFactory, { logger: mockLogger });
		const defaultDataStore = (await container2.getEntryPoint()) as TestDataObject;

		await provider.ensureSynchronized();

		// getting the non-default data store and validate it is loaded
		const handle2 = defaultDataStore._root.get("dataStore2");
		const testDataStore: TestDataObject = await handle2.get();
		assert(testDataStore !== undefined, "2nd data store within loaded container is not loaded");

		// validate the snapshot was fetched from cache
		const fetchEvent = mockLogger.events.find(
			(event) => event.eventName === "fluid:telemetry:OdspDriver:ObtainSnapshot_end",
		);
		assert(fetchEvent !== undefined, "odsp obtain snapshot event does not exist ");
		assert.strictEqual(
			fetchEvent.method,
			"cache",
			`second client fetched snapshot with ${fetchEvent.method} method instead of from cache`,
		);
	});

	it("should fetch from cache when second client loads the container in offline mode", async function () {
		// GitHub issue: #9534
		if (provider.driver.type === "odsp") {
			this.skip();
		}
		mockLogger = new MockLogger();

		// Create a container for the first client. While attaching the odsp driver will cache the summary
		// in persisted cache.
		const mainContainer = await provider.createContainer(runtimeFactory, {
			logger: mockLogger,
		});
		assert.strictEqual(
			mainContainer.attachState,
			AttachState.Attached,
			"container was not attached",
		);

		// getting default data store and create a new data store
		const mainDataStore = (await mainContainer.getEntryPoint()) as TestDataObject;
		const dataStore2 = await dataObjectFactory.createInstance(
			mainDataStore._context.containerRuntime,
		);
		mainDataStore._root.set("dataStore2", dataStore2.handle);

		provider.documentServiceFactory = wrapObjectAndOverride<
			IDocumentServiceFactory & { getStorageToken?() }
		>(provider.documentServiceFactory, {
			getStorageToken: () => () => {
				throw new Error("TokenFail");
			},
		});

		const container2 = await provider.loadContainer(runtimeFactory, { logger: mockLogger });
		const defaultDataStore = (await container2.getEntryPoint()) as TestDataObject;

		await provider.ensureSynchronized();

		// getting the non-default data store and validate it is loaded
		const handle2 = defaultDataStore._root.get("dataStore2");
		const testDataStore: TestDataObject = await handle2.get();
		assert(testDataStore !== undefined, "2nd data store within loaded container is not loaded");

		// validate the snapshot was fetched from cache
		const fetchEvent = mockLogger.events.find(
			(event) => event.eventName === "fluid:telemetry:OdspDriver:ObtainSnapshot_end",
		);
		assert(fetchEvent !== undefined, "odsp obtain snapshot event does not exist ");
		assert.strictEqual(
			fetchEvent.method,
			"cache",
			`second client fetched snapshot with ${fetchEvent.method} method instead of from cache`,
		);
	});
});
