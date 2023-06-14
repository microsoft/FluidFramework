/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions, ISummarizer } from "@fluidframework/container-runtime";
import { IRequest } from "@fluidframework/core-interfaces";
import { SharedMatrix } from "@fluidframework/matrix";
import { SharedMap } from "@fluidframework/map";
import {
	ITestObjectProvider,
	waitForContainerConnection,
	summarizeNow,
	createSummarizerFromFactory,
} from "@fluidframework/test-utils";
import { describeNoCompat, getContainerRuntimeApi } from "@fluid-internal/test-version-utils";
import { IContainerRuntimeBase, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { FluidDataStoreRuntime, mixinSummaryHandler } from "@fluidframework/datastore";
import { pkgVersion } from "../packageVersion";

const runtimeOptions: IContainerRuntimeOptions = {
	summaryOptions: {
		summaryConfigOverrides: { state: "disabled" },
	},
	gcOptions: { gcAllowed: true },
};
export const rootDataObjectType = "@fluid-example/rootDataObject";
export const TestDataObjectType1 = "@fluid-example/test-dataStore1";
export const TestDataObjectType2 = "@fluid-example/test-dataStore2";
class TestDataObject2 extends DataObject {
	public get _root() {
		return this.root;
	}
	public get _context() {
		return this.context;
	}
	// If this datastore created DDSes it would be even more nodes created without running gc
}

class TestDataObject1 extends DataObject {
	public get _root() {
		return this.root;
	}

	public get _context() {
		return this.context;
	}

	private readonly datastoreKey = "TestDataObject2";

	protected async hasInitialized() {
		// This can be fired synchronously as well, which would cause an even worse half state
		await this.init();
	}

	private async init() {
		const dataObject2 = await rootDataObjectFactory.createInstance(
			this.context.containerRuntime,
		);
		this.root.set(this.datastoreKey, dataObject2.handle);
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
	[SharedMap.getFactory(), SharedMatrix.getFactory()],
	[],
	[],
	// it would be nice to move away from this flow
	mixinSummaryHandler(getComponent),
);

const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
	runtime.IFluidHandleContext.resolveHandle(request);

const registryStoreEntries = new Map<string, Promise<IFluidDataStoreFactory>>([
	[rootDataObjectFactory.type, Promise.resolve(rootDataObjectFactory)],
	[dataStoreFactory1.type, Promise.resolve(dataStoreFactory1)],
]);
const containerRuntimeFactoryWithDefaultDataStore =
	getContainerRuntimeApi(pkgVersion).ContainerRuntimeFactoryWithDefaultDataStore;
const runtimeFactory = new containerRuntimeFactoryWithDefaultDataStore(
	rootDataObjectFactory,
	registryStoreEntries,
	undefined,
	[innerRequestHandler],
	runtimeOptions,
);

async function createSummarizer(
	provider: ITestObjectProvider,
	container: IContainer,
	summaryVersion?: string,
): Promise<ISummarizer> {
	const createSummarizerResult = await createSummarizerFromFactory(
		provider,
		container,
		dataStoreFactory1,
		summaryVersion,
		containerRuntimeFactoryWithDefaultDataStore,
		registryStoreEntries,
	);
	return createSummarizerResult.summarizer;
}

/**
 * Validates the scenario in which, during summarization, a data store is loaded out of order.
 */
describeNoCompat("Summary where data store is loaded out of order", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;

	const createContainer = async (): Promise<IContainer> => {
		return provider.createContainer(runtimeFactory);
	};

	async function waitForSummary(summarizer: ISummarizer) {
		// Wait for all pending ops to be processed by all clients.
		await provider.ensureSynchronized();
		const summaryResult = await summarizeNow(summarizer);
		return summaryResult;
	}

	beforeEach(async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	it("No Summary Upload Error when DS gets realized between summarize and completeSummary", async () => {
		const container = await createContainer();
		await waitForContainerConnection(container);
		const rootDataObject = await requestFluidObject<RootTestDataObject>(container, "default");
		const newDO = await dataStoreFactory1.createInstance(rootDataObject.containerRuntime);
		rootDataObject._root.set("store", newDO.handle);
		const summarizerClient = await createSummarizer(provider, container);

		await provider.ensureSynchronized();

		// This should not fail
		await assert.rejects(waitForSummary(summarizerClient), "expected NodeDidNotRunGC");
	});
});
