/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, type ITestDataObject } from "@fluid-private/test-version-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions/internal";
import {
	IContainerRuntimeOptions,
	ISummarizer,
	type ContainerRuntime,
	type ISubmitSummaryOptions,
} from "@fluidframework/container-runtime/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import type { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type { ISharedMap } from "@fluidframework/map/internal";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";
import {
	ITestObjectProvider,
	createContainerRuntimeFactoryWithDefaultDataStore,
	createSummarizerFromFactory,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

const runtimeOptions: IContainerRuntimeOptions = {
	summaryOptions: {
		summaryConfigOverrides: { state: "disabled" },
	},
};
export const TestDataObjectType1 = "@fluid-example/test-dataStore1";
export const TestDataObjectType2 = "@fluid-example/test-dataStore2";

/**
 * Validates the scenario in which, during summarization, a data store is loaded out of order.
 */
describeCompat(
	"Summary where data store is loaded out of order",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { DataObject, DataObjectFactory, FluidDataStoreRuntime } = apis.dataRuntime;
		const { mixinSummaryHandler } = apis.dataRuntime.packages.datastore;
		const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;
		const { SharedMap } = apis.dds;

		function createDataStoreRuntime(
			factory: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
		) {
			return mixinSummaryHandler(async (runtime: FluidDataStoreRuntime) => {
				await DataObject.getDataObject(runtime);
				return undefined;
			}, factory);
		}

		class TestDataObject2 extends DataObject {
			public get _root() {
				return this.root;
			}
			public get _context() {
				return this.context;
			}

			public get _runtime() {
				return this.runtime;
			}
		}

		class TestDataObject1 extends DataObject {
			public get _root() {
				return this.root;
			}

			public get _context() {
				return this.context;
			}

			protected async initializingFirstTime() {
				const dataStore2 =
					await this._context.containerRuntime.createDataStore(TestDataObjectType2);
				this.root.set("ds2", dataStore2.entryPoint);
			}

			protected async hasInitialized() {
				const dataStore2Handle = this.root.get<IFluidHandle<TestDataObject2>>("ds2");
				await dataStore2Handle?.get();
			}
		}
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
		);

		const registryStoreEntries = new Map<string, Promise<IFluidDataStoreFactory>>([
			[dataStoreFactory1.type, Promise.resolve(dataStoreFactory1)],
			[dataStoreFactory2.type, Promise.resolve(dataStoreFactory2)],
		]);

		const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
			ContainerRuntimeFactoryWithDefaultDataStore,
			{
				defaultFactory: dataStoreFactory1,
				registryEntries: registryStoreEntries,
				runtimeOptions,
			},
		);

		async function createSummarizerWithVersion(summaryVersion?: string): Promise<ISummarizer> {
			const createSummarizerResult = await createSummarizerFromFactory(
				provider,
				mainContainer,
				dataStoreFactory1,
				summaryVersion,
				ContainerRuntimeFactoryWithDefaultDataStore,
				registryStoreEntries,
			);
			return createSummarizerResult.summarizer;
		}

		let provider: ITestObjectProvider;
		let mainContainer: IContainer;
		let mainDataStore: TestDataObject1;

		async function waitForSummary(summarizer: ISummarizer): Promise<string> {
			// Wait for all pending ops to be processed by all clients.
			await provider.ensureSynchronized();
			const summaryResult = await summarizeNow(summarizer);
			return summaryResult.summaryVersion;
		}

		beforeEach("setup", async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
			mainContainer = await provider.createContainer(runtimeFactory);
			// Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
			// re-sent. Do it here so that the extra events don't mess with rest of the test.
			mainDataStore = (await mainContainer.getEntryPoint()) as TestDataObject1;
			mainDataStore._root.set("anytest", "anyvalue");
			await waitForContainerConnection(mainContainer);
		});

		it("No Summary Upload Error when DS gets realized between summarize and completeSummary", async function () {
			// Skip this test for standard r11s as its summarization timing is flaky and non-reproducible.
			// This test is covering client logic and the coverage from other drivers/endpoints is sufficient.
			if (provider.driver.type === "r11s" && provider.driver.endpointName !== "frs") {
				this.skip();
			}

			const summarizerClient = await createSummarizerWithVersion();
			await provider.ensureSynchronized();
			mainDataStore._root.set("1", "2");

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

			mainDataStore._root.set("2", "3");
			// The new summarization would immediately trigger bug 1633.
			const summaryVersion1 = await waitForSummary(summarizerClient);
			assert(summaryVersion1, "Summary version should be defined");

			// Make sure the next summarization succeeds.
			mainDataStore._root.set("3", "4");
			const summaryVersion2 = await waitForSummary(summarizerClient);
			assert(summaryVersion2, "Summary version should be defined");

			summarizerClient.close();

			// Just make sure new summarizer will be able to load and execute successfully.
			const summarizerClient2 = await createSummarizerWithVersion(summaryVersion2);

			mainDataStore._root.set("4", "5");
			const summaryVersion3 = await waitForSummary(summarizerClient2);
			assert(summaryVersion3, "Summary version should be defined");
		});

		// This test was written to prevent future regressions to this scenario.
		it("Summarization should still succeed when a datastore and its DDSes are realized between submit and ack", async () => {
			const summarizer1 = await createSummarizerWithVersion();

			// create a datastore with a dds as the default one is always realized
			const dataObject1 = await dataStoreFactory2.createInstance(
				mainDataStore._context.containerRuntime,
			);
			// create a dds
			const dds1 = SharedMap.create(dataObject1._runtime);
			// store the dds
			dataObject1._root.set("handle", dds1.handle);
			// store the datastore
			mainDataStore._root.set("handle", dataObject1.handle);

			// Generate the summary to load from
			await provider.ensureSynchronized();
			const { summaryVersion: summaryVersion1 } = await summarizeNow(summarizer1);
			summarizer1.close();

			// Load a summarizer that hasn't realized the datastore yet
			const summarizer2 = await createSummarizerWithVersion(summaryVersion1);

			// Override the submit summary function to realize a datastore before receiving an ack
			const summarizerRuntime = (summarizer2 as any).runtime as ContainerRuntime;
			const submitSummaryFunc = summarizerRuntime.submitSummary;
			const func = async (options: ISubmitSummaryOptions) => {
				const submitSummaryFuncBound = submitSummaryFunc.bind(summarizerRuntime);
				const result = await submitSummaryFuncBound(options);

				const entryPoint = (await summarizerRuntime.getAliasedDataStoreEntryPoint(
					"default",
				)) as IFluidHandle<ITestDataObject> | undefined;
				if (entryPoint === undefined) {
					throw new Error("default dataStore must exist");
				}
				const defaultDatastore2 = await entryPoint.get();
				const handle2 = defaultDatastore2._root.get("handle");
				// this realizes the datastore before we get the ack
				await handle2.get();
				return result;
			};

			summarizerRuntime.submitSummary = func;
			// create an op that will realize the /dataObject/dds, but not the /dataObject/root dds when summarizing
			dds1.set("a", "op");

			// Note: summarizeOnDemand was used here so the submitSummary function would properly bind to its containerRuntime.
			// summarize, this causes the paths to become incorrect on the summarizer nodes
			const summaryResults2 = summarizer2.summarizeOnDemand({ reason: "test" });

			// During the regression, when the container runtime processed this ack, it would improperly create the root dds summarizer
			// node with the wrong path - the regression made the summary handle path /dataObject instead of /dataObject/root
			const ackOrNack2 = await summaryResults2.receivedSummaryAckOrNack;
			assert(ackOrNack2.success, "should have successfully summarized!");
			await new Promise((resolve) => process.nextTick(resolve));

			// In the regression, the summarizer node state was incorrect, but in order to cause issues it needed to submit another summary that generates the incorrect handle path
			const { summaryVersion: summaryVersion3 } = await summarizeNow(summarizer2);

			// This verifies that we can correctly load the container in the right state
			const container3 = await provider.loadContainer(
				runtimeFactory,
				undefined,
				/* loaderProps */ {
					[LoaderHeader.version]: summaryVersion3,
				},
			);
			const defaultDatastore3 = (await container3.getEntryPoint()) as ITestDataObject;
			const handle3 = defaultDatastore3._root.get<IFluidHandle<ITestDataObject>>("handle");
			assert(
				handle3 !== undefined,
				"Should be able to retrieve stored datastore Fluid handle",
			);

			// Realize the datastore and root dds
			const dataObject3 = await handle3.get();
			const ddsHandle3 = dataObject3._root.get<IFluidHandle<ISharedMap>>("handle");
			assert(ddsHandle3 !== undefined, "Should be able to retrieve stored dds Fluid handle");
			// Realize the dds and verify it acts as expected
			const dds3 = await ddsHandle3.get();
			assert(dds3.get("a") === "op", "DDS state should be consistent across clients");
		});
	},
);
