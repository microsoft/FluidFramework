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
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import {
	ITestObjectProvider,
	waitForContainerConnection,
	summarizeNow,
	createSummarizerFromFactory,
} from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluid-private/test-version-utils";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { FluidDataStoreRuntime, mixinSummaryHandler } from "@fluidframework/datastore";
import { requestFluidObject } from "@fluidframework/runtime-utils";

class TestDataObject extends DataObject {
	public get _root() {
		return this.root;
	}
	public get _context() {
		return this.context;
	}
}

const testKey = "key";
class RootTestDataObject1 extends DataObject {
	public get _root() {
		return this.root;
	}
	public get containerRuntime() {
		return this.context.containerRuntime;
	}
}
class RootTestDataObject2 extends DataObject {
	public get _root() {
		return this.root;
	}
	public get containerRuntime() {
		return this.context.containerRuntime;
	}
	protected async hasInitialized() {
		if (this.root.has(testKey)) {
			console.log("skip");
			return;
		}
		console.log("create");
		const testObject = await testObjectFactory.createInstance(this.context.containerRuntime);
		this.root.set(testKey, testObject.handle);
	}
}
// Search does something similar to this, where it loads the data object.
const getDataObject = async (runtime: FluidDataStoreRuntime) => {
	await DataObject.getDataObject(runtime);
	return undefined;
};
const rootDataObjectFactory1 = new DataObjectFactory(
	"RootDataObject",
	RootTestDataObject1,
	[],
	[],
	[],
	mixinSummaryHandler(getDataObject),
);
const rootDataObjectFactory2 = new DataObjectFactory(
	"RootDataObject",
	RootTestDataObject2,
	[],
	[],
	[],
	mixinSummaryHandler(getDataObject),
);
const testObjectFactory = new DataObjectFactory(
	"TestDataObject2",
	TestDataObject,
	[],
	[],
	[],
	mixinSummaryHandler(getDataObject),
);

const registry1 = new Map<string, Promise<IFluidDataStoreFactory>>([
	[rootDataObjectFactory1.type, Promise.resolve(rootDataObjectFactory1)],
	[testObjectFactory.type, Promise.resolve(testObjectFactory)],
]);
const registry2 = new Map<string, Promise<IFluidDataStoreFactory>>([
	[rootDataObjectFactory2.type, Promise.resolve(rootDataObjectFactory2)],
	[testObjectFactory.type, Promise.resolve(testObjectFactory)],
]);
const runtimeOptions: IContainerRuntimeOptions = {
	summaryOptions: {
		summaryConfigOverrides: { state: "disabled" },
	},
};
const runtimeFactory1 = new ContainerRuntimeFactoryWithDefaultDataStore({
	defaultFactory: rootDataObjectFactory1,
	registryEntries: registry1,
	runtimeOptions,
});

describeNoCompat("Summarizer with local changes", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;

	beforeEach(async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	itExpects(
		"ValidateSummaryBeforeUpload = true. Summary should fail before generate stage when data store is created during summarize",
		[
			{
				eventName: "fluid:telemetry:Summarizer:Running:GarbageCollection_cancel",
				clientType: "noninteractive/summarizer",
				error: "0x589",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				clientType: "noninteractive/summarizer",
				error: "0x589",
			},
		],
		async () => {
			const container = await provider.createContainer(runtimeFactory1);
			await waitForContainerConnection(container);
			const rootDataObject = (await container.getEntryPoint()) as RootTestDataObject1;
			console.log(rootDataObject._root.get(testKey));

			const { container: summarizingContainer, summarizer } =
				await createSummarizerFromFactory(
					provider,
					container,
					rootDataObjectFactory1,
					undefined /* summaryVersion */,
					undefined /* containerRuntimeFactoryType */,
					registry1,
				);
			await provider.ensureSynchronized();
			const { summaryVersion } = await summarizeNow(summarizer);
			summarizingContainer.close();

			const { container: summarizingContainer2, summarizer: newSummarizer } =
				await createSummarizerFromFactory(
					provider,
					container,
					rootDataObjectFactory2,
					summaryVersion,
					undefined /* containerRuntimeFactoryType */,
					registry2,
				);
			await requestFluidObject<RootTestDataObject2>(summarizingContainer2, "/");

			// Summarization should fail because of a data store created during summarization which does not run GC.
			await assert.rejects(
				async () => summarizeNow(newSummarizer),
				(error: any) => {
					return error.message === "0x589" && error.data.stage === "base";
				},
				"expected 0x589",
			);
		},
	);
});
