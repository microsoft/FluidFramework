/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct/internal";
import {
	ITestDataObject,
	TestDataObjectType,
	describeCompat,
} from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import { SharedDirectory } from "@fluidframework/map/internal";
import {
	createTestConfigProvider,
	ITestContainerConfig,
	ITestObjectProvider,
} from "@fluidframework/test-utils/internal";

import { waitForContainerWriteModeConnectionWrite } from "./gcTestSummaryUtils.js";

const getSizeString = (size: number) => {
	const gb = size / (1024 * 1024 * 1024);
	const mb = size / (1024 * 1024);
	const kb = size / 1024;
	if (gb >= 1) {
		return `${gb.toFixed(3)} GB`;
	}
	if (mb >= 1) {
		return `${mb.toFixed(3)} MB`;
	}
	if (kb >= 1) {
		return `${kb.toFixed(3)} KB`;
	}
	return `${size} bytes`;
};

class TestDataObject extends DataObject {
	public get _root() {
		return this.root;
	}

	public get _runtime() {
		return this.runtime;
	}

	public get _context() {
		return this.context;
	}

	public get containerRuntime() {
		return this.context.containerRuntime as ContainerRuntime;
	}

	public async initializingFirstTime(): Promise<void> {
		this.root.set("dir1", SharedDirectory.create(this.runtime).handle);
		this.root.set("dir2", SharedDirectory.create(this.runtime).handle);
	}
}

describeCompat("Summary size", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	const configProvider = createTestConfigProvider();

	const testDataObjectType = "TestDataObject";
	const dataObjectFactory = new DataObjectFactory(testDataObjectType, TestDataObject, [], {});
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory,
		registryEntries: [dataObjectFactory.registryEntry],
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: {
					state: "disabled",
				},
			},
		},
	});

	beforeEach("setup", async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		// These tests validate the GC stats in summary. It disables heuristics and summarizes explicitly on a separate
		// container. They do not submits these summaries so it doesn't need to run against real services.
		if (provider.driver.type !== "local") {
			this.skip();
		}
	});

	afterEach(() => {
		configProvider.clear();
	});

	async function createNewDataStore(dataObject: TestDataObject) {
		const newDataStore =
			await dataObject._context.containerRuntime.createDataStore(testDataObjectType);
		const newDataObject = (await newDataStore.entryPoint.get()) as TestDataObject;
		return newDataObject;
	}

	const test = (dataStoreCount: number, useShortIds: boolean) => {
		it.only(`Data store count: ${dataStoreCount}. DDS count: ${dataStoreCount * 3}. UseShortIds: ${useShortIds}`, async () => {
			configProvider.set("Fluid.Runtime.UseShortIds", useShortIds);
			const container = await provider.createDetachedContainer(runtimeFactory, {
				configProvider,
			});
			const dataObject = (await container.getEntryPoint()) as TestDataObject;
			const containerRuntime = dataObject.containerRuntime;

			for (let i = 0; i < dataStoreCount; i++) {
				const dataStore = await createNewDataStore(dataObject);
				dataObject._root.set(`dataStore${i}`, dataStore.handle);
			}

			await provider.attachDetachedContainer(container);

			dataObject._root.set("mode", "write");
			await waitForContainerWriteModeConnectionWrite(container);

			await provider.ensureSynchronized();

			const summarizeResult = await containerRuntime.summarize({ fullTree: true });

			const summarySize = JSON.stringify(summarizeResult.summary).length;
			const gcSummarySize = JSON.stringify(summarizeResult.summary.tree["gc"]).length;
			const gcSummaryPercentage = ((gcSummarySize / summarySize) * 100).toFixed(2);

			console.log(
				`Short Ids: ${useShortIds}
Data store count: ${dataStoreCount}
DDS count: ${dataStoreCount * 3}
Summary size: ${getSizeString(summarySize)}
GC summary size: ${getSizeString(gcSummarySize)}
GC summary %: ${gcSummaryPercentage}%`,
			);
		});
	};

	const dataStoreCounts = [10, 100, 1000];
	dataStoreCounts.forEach((dataStoreCount) => {
		test(dataStoreCount, false /* useShortIds */);
		test(dataStoreCount, true /* useShortIds */);
	});
});
