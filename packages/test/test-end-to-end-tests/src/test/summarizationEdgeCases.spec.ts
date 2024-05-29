/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	ITestDataObject,
	TestDataObjectType,
	describeCompat,
} from "@fluid-private/test-version-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	ISubmitSummaryOptions,
} from "@fluidframework/container-runtime/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import type { ISharedMap } from "@fluidframework/map/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
} from "@fluidframework/test-utils/internal";

// These tests intend to ensure that summarization succeeds in edge case scenarios that rarely happen
describeCompat("Summarization edge cases", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap } = apis.dds;
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: { state: "disabled" },
			},
		},
	};

	let provider: ITestObjectProvider;
	const createContainer = async (): Promise<IContainer> => {
		return provider.makeTestContainer(testContainerConfig);
	};

	const loadContainer = async (summaryVersion?: string): Promise<IContainer> => {
		return provider.loadTestContainer(testContainerConfig, {
			[LoaderHeader.version]: summaryVersion,
		});
	};

	beforeEach("getTestObjectProvider", async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	// This test was written to prevent future regressions to this scenario.
	it("Summarization should still succeed when a datastore and its DDSes are realized between submit and ack", async () => {
		const container1 = await createContainer();
		const defaultDataStore1 = (await container1.getEntryPoint()) as ITestDataObject;
		const { summarizer: summarizer1 } = await createSummarizer(provider, container1);

		// create a datastore with a dds as the default one is always realized
		const containerRuntime1 = defaultDataStore1._context.containerRuntime;
		const nonDefaultDataStore1 = await containerRuntime1.createDataStore(TestDataObjectType);
		const dataObject1 = await (
			nonDefaultDataStore1.entryPoint as IFluidHandleInternal<ITestDataObject>
		).get();
		// create a dds
		const dds1 = SharedMap.create(dataObject1._runtime);
		// store the dds
		dataObject1._root.set("handle", dds1.handle);
		// store the datastore
		defaultDataStore1._root.set("handle", dataObject1.handle);

		// Generate the summary to load from
		await provider.ensureSynchronized();
		const { summaryVersion: summaryVersion1 } = await summarizeNow(summarizer1);
		summarizer1.close();

		// Load a summarizer that hasn't realized the datastore yet
		const { summarizer: summarizer2 } = await createSummarizer(
			provider,
			container1,
			undefined /* config */,
			summaryVersion1,
		);

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
		const container3 = await loadContainer(summaryVersion3);
		const defaultDatastore3 = (await container3.getEntryPoint()) as ITestDataObject;
		const handle3 = defaultDatastore3._root.get<IFluidHandle<ITestDataObject>>("handle");
		assert(handle3 !== undefined, "Should be able to retrieve stored datastore Fluid handle");

		// Realize the datastore and root dds
		const dataObject3 = await handle3.get();
		const ddsHandle3 = dataObject3._root.get<IFluidHandle<ISharedMap>>("handle");
		assert(ddsHandle3 !== undefined, "Should be able to retrieve stored dds Fluid handle");
		// Realize the dds and verify it acts as expected
		const dds3 = await ddsHandle3.get();
		assert(dds3.get("a") === "op", "DDS state should be consistent across clients");
	});
});
