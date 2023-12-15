/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DataObject, DataObjectFactory, PureDataObject } from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions, ISummarizer } from "@fluidframework/container-runtime";
import { FluidObject, IFluidHandle } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, mixinSummaryHandler } from "@fluidframework/datastore";
import { SharedMatrix } from "@fluidframework/matrix";
import { SharedMap } from "@fluidframework/map";
import {
	ITestObjectProvider,
	waitForContainerConnection,
	summarizeNow,
	createSummarizerFromFactory,
	createContainerRuntimeFactoryWithDefaultDataStore,
} from "@fluidframework/test-utils";
import { describeCompat, getContainerRuntimeApi } from "@fluid-private/test-version-utils";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { pkgVersion } from "../packageVersion.js";

interface ProvideSearchContent {
	SearchContent: SearchContent;
}
interface SearchContent extends ProvideSearchContent {
	getSearchContent(): Promise<string | undefined>;
}

// Note GC needs to be disabled.
const runtimeOptions: IContainerRuntimeOptions = {
	summaryOptions: {
		summaryConfigOverrides: { state: "disabled" },
	},
	gcOptions: { gcAllowed: false },
};
export const TestDataObjectType1 = "@fluid-example/test-dataStore1";
export const TestDataObjectType2 = "@fluid-example/test-dataStore2";
class TestDataObject2 extends DataObject {
	public get _root() {
		return this.root;
	}
	public get _context() {
		return this.context;
	}
	private readonly mapKey = "SharedMap";
	public map!: SharedMap;

	protected async initializingFirstTime() {
		const sharedMap = SharedMap.create(this.runtime, this.mapKey);
		this.root.set(this.mapKey, sharedMap.handle);
	}

	protected async hasInitialized() {
		const mapHandle = this.root.get<IFluidHandle<SharedMap>>(this.mapKey);
		assert(mapHandle !== undefined, "SharedMap not found");
		this.map = await mapHandle.get();
	}
}

class TestDataObject1 extends DataObject implements SearchContent {
	public async getSearchContent(): Promise<string | undefined> {
		// By this time, we are in the middle of the summarization process and
		// the DataStore should have been initialized with no child.
		// We will force it to be realized so when we invoke completeSummary on the SummarizerNode it would
		// cause bug https://dev.azure.com/fluidframework/internal/_workitems/edit/1633 to happen.
		const dataTestDataObject2Handle =
			this.root.get<IFluidHandle<TestDataObject2>>("dsFactory2");
		assert(dataTestDataObject2Handle, "dsFactory2 not located");
		const dataStore2 = await dataTestDataObject2Handle.get();
		dataStore2.map.set("mapkey", "value");

		return Promise.resolve("TestDataObject1 Search Blob");
	}

	public get SearchContent() {
		return this;
	}

	public get _root() {
		return this.root;
	}

	public get _context() {
		return this.context;
	}

	private readonly matrixKey = "SharedMatrix";
	public matrix!: SharedMatrix;

	protected async initializingFirstTime() {
		const sharedMatrix = SharedMatrix.create(this.runtime, this.matrixKey);
		this.root.set(this.matrixKey, sharedMatrix.handle);

		const dataStore = await this._context.containerRuntime.createDataStore(TestDataObjectType2);
		const dsFactory2 = (await dataStore.entryPoint.get()) as TestDataObject2;
		this.root.set("dsFactory2", dsFactory2.handle);
	}

	protected async hasInitialized() {
		const matrixHandle = this.root.get<IFluidHandle<SharedMatrix>>(this.matrixKey);
		assert(matrixHandle !== undefined, "SharedMatrix not found");
		this.matrix = await matrixHandle.get();

		this.matrix.insertRows(0, 3);
		this.matrix.insertCols(0, 3);
	}
}
const dataStoreFactory1 = new DataObjectFactory(
	TestDataObjectType1,
	TestDataObject1,
	[SharedMap.getFactory(), SharedMatrix.getFactory()],
	[],
	[],
	createDataStoreRuntime(),
);
const dataStoreFactory2 = new DataObjectFactory(
	TestDataObjectType2,
	TestDataObject2,
	[SharedMap.getFactory(), SharedMatrix.getFactory()],
	[],
	[],
	createDataStoreRuntime(),
);

const registryStoreEntries = new Map<string, Promise<IFluidDataStoreFactory>>([
	[dataStoreFactory1.type, Promise.resolve(dataStoreFactory1)],
	[dataStoreFactory2.type, Promise.resolve(dataStoreFactory2)],
]);
const containerRuntimeFactoryWithDefaultDataStore =
	getContainerRuntimeApi(pkgVersion).ContainerRuntimeFactoryWithDefaultDataStore;
const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
	containerRuntimeFactoryWithDefaultDataStore,
	{
		defaultFactory: dataStoreFactory1,
		registryEntries: registryStoreEntries,
		runtimeOptions,
	},
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

function createDataStoreRuntime(factory: typeof FluidDataStoreRuntime = FluidDataStoreRuntime) {
	return mixinSummaryHandler(async (runtime: FluidDataStoreRuntime) => {
		const obj: PureDataObject & FluidObject<SearchContent> =
			await DataObject.getDataObject(runtime);
		const searchObj = obj.SearchContent;
		if (searchObj === undefined) {
			return undefined;
		}

		// ODSP parser requires every search blob end with a line-feed character.
		const searchContent = await searchObj.getSearchContent();
		if (searchContent === undefined) {
			return undefined;
		}
		const content = searchContent.endsWith("\n") ? searchContent : `${searchContent}\n`;
		return {
			// This is the path in snapshot that ODSP expects search blob (in plain text) to be for components
			// that want to provide search content.
			path: ["_search", "01"],
			content,
		};
	}, factory);
}

/**
 * Validates the scenario in which, during summarization, a data store is loaded out of order.
 */
describeCompat(
	"Summary where data store is loaded out of order",
	"NoCompat",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;
		let mainContainer: IContainer;
		let mainDataStore: TestDataObject1;

		const createContainer = async (): Promise<IContainer> => {
			return provider.createContainer(runtimeFactory);
		};

		async function waitForSummary(summarizer: ISummarizer): Promise<string> {
			// Wait for all pending ops to be processed by all clients.
			await provider.ensureSynchronized();
			const summaryResult = await summarizeNow(summarizer);
			return summaryResult.summaryVersion;
		}

		beforeEach(async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
			mainContainer = await createContainer();
			// Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
			// re-sent. Do it here so that the extra events don't mess with rest of the test.
			mainDataStore = (await mainContainer.getEntryPoint()) as TestDataObject1;
			mainDataStore._root.set("anytest", "anyvalue");
			await waitForContainerConnection(mainContainer);
		});

		it("No Summary Upload Error when DS gets realized between summarize and completeSummary", async () => {
			const summarizerClient = await createSummarizer(provider, mainContainer);
			await provider.ensureSynchronized();
			mainDataStore.matrix.setCell(0, 0, "value");

			// Here are the steps that would cause bug to repro:
			// Additional info: https://github.com/microsoft/FluidFramework/pull/11697
			// 1) Summary starts
			// 2) The summarize method from the DataStore2 (TestDataObject2) will be executed but, as it has not
			//    been realized, it has no child nodes and hasn't changed, we will use a handle instead.
			// 3) During the summarization from the other DataStore1 (TestDataObject1),
			// due to the mixinSummaryHandler (search) we explicitly realize the DataStore2 and
			// new Summarizer Nodes are added to it.
			// 4) That would (without the fix) corrupt the pendingSummaries/lastSummary from one of the child nodes.
			// 5) Next Summarization starts, the lastSummary data would be used to upload the summary and we
			//  would get an error
			// "Cannot locate node with path '.app/.channels/guid1/root' under '<handle>'."
			//  instead of .app/.channels/guid1/.channels/root
			// Note: In this scenario, the corruption is caused due to the fact that the datastore's
			// summarizer node does not update the handle paths with ".channels" for its children when it is
			// summarized. This happens later when the data store is realized but its too late because
			// the work-in-progress path (wipLocalPath) has already been updated.

			const summaryVersion = await waitForSummary(summarizerClient);
			assert(summaryVersion, "Summary version should be defined");

			mainDataStore.matrix.setCell(0, 0, "value1");
			// The new summarization would immediately trigger bug 1633.
			const summaryVersion1 = await waitForSummary(summarizerClient);
			assert(summaryVersion1, "Summary version should be defined");

			// Make sure the next summarization succeeds.
			mainDataStore.matrix.setCell(0, 0, "value1");
			const summaryVersion2 = await waitForSummary(summarizerClient);
			assert(summaryVersion2, "Summary version should be defined");

			summarizerClient.close();

			// Just make sure new summarizer will be able to load and execute successfully.
			const summarizerClient2 = await createSummarizer(
				provider,
				mainContainer,
				summaryVersion2,
			);

			mainDataStore.matrix.setCell(0, 0, "value2");
			const summaryVersion3 = await waitForSummary(summarizerClient2);
			assert(summaryVersion3, "Summary version should be defined");
		});
	},
);
