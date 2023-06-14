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
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IRequest } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, mixinSummaryHandler } from "@fluidframework/datastore";
import { IContainerRuntimeBase, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ITestObjectProvider,
	waitForContainerConnection,
	createSummarizerFromFactory,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluid-internal/test-version-utils";

function createDataStoreRuntime(factory: typeof FluidDataStoreRuntime = FluidDataStoreRuntime) {
	return mixinSummaryHandler(async (runtime: FluidDataStoreRuntime) => {
		await DataObject.getDataObject(runtime);
		return undefined;
	}, factory);
}

export const TestDataObjectType1 = "@fluid-example/test-dataStore1";
export const TestDataObjectType2 = "@fluid-example/test-dataStore2";
class TestDataObject2 extends DataObject {
	public get _root() {
		return this.root;
	}
	public get _context() {
		return this.context;
	}
}
class TestDataObject1 extends DataObject {
	public get _root() {
		return this.root;
	}

	public get _context() {
		return this.context;
	}

	protected async initializingFirstTime() {}

	protected async hasInitialized() {
		const dsFactory2 = await requestFluidObject<TestDataObject2>(
			await this._context.containerRuntime.createDataStore(TestDataObjectType2),
			"",
		);
		assert(dsFactory2 !== undefined);
	}
}

/**
 * Validates whether or not a GC Tree Summary Handle should be written to the summary.
 */
describeNoCompat("Prepare for Summary with Search Blobs", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	const dataStoreFactory1 = new DataObjectFactory(
		TestDataObjectType1,
		TestDataObject1,
		[],
		[],
		[],
		createDataStoreRuntime(),
	);
	const dataStoreFactory2 = new DataObjectFactory(
		TestDataObjectType2,
		TestDataObject2,
		[],
		[],
		[],
		createDataStoreRuntime(),
	);
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: { state: "disabled" },
		},
	};
	const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
		runtime.IFluidHandleContext.resolveHandle(request);
	const registryStoreEntries = new Map<string, Promise<IFluidDataStoreFactory>>([
		[dataStoreFactory1.type, Promise.resolve(dataStoreFactory1)],
		[dataStoreFactory2.type, Promise.resolve(dataStoreFactory2)],
	]);
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
		dataStoreFactory1,
		registryStoreEntries,
		undefined,
		[innerRequestHandler],
		runtimeOptions,
	);

	let mainContainer: IContainer;
	let mainDataStore: TestDataObject1;

	const createContainer = async (): Promise<IContainer> => {
		return provider.createContainer(runtimeFactory);
	};

	describe("Realize DataStore during Search while waiting for Summary Ack", () => {
		beforeEach(async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
			mainContainer = await createContainer();
			mainDataStore = await requestFluidObject<TestDataObject1>(mainContainer, "default");
			mainDataStore._root.set("mode", "write");
			await waitForContainerConnection(mainContainer);
		});

		it("fails summary on data store created during summarize", async () => {
			const { summarizer } = await createSummarizerFromFactory(
				provider,
				mainContainer,
				dataStoreFactory1,
				undefined,
				undefined,
				registryStoreEntries,
			);

			const result = summarizer.summarizeOnDemand({ reason: "test" });
			const submitResult = await result.summarySubmitted;
			assert(submitResult.success, "The summary should have passed");
		});
	});
});
