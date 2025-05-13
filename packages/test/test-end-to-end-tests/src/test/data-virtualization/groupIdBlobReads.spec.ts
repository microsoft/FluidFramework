/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	describeCompat,
	TestDataObjectType,
	type ITestDataObject,
} from "@fluid-private/test-version-utils";
import { type IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import type { IContainerRuntimeBase } from "@fluidframework/runtime-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	type ITestObjectProvider,
	createSummarizer,
	createTestConfigProvider,
	summarizeNow,
} from "@fluidframework/test-utils/internal";

import { TestPersistedCache } from "../../testPersistedCache.js";

describeCompat("Odsp Network calls", "NoCompat", (getTestObjectProvider) => {
	// Allow us to control summaries
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
	};
	const configProvider = createTestConfigProvider({
		"Fluid.Container.UseLoadingGroupIdForSnapshotFetch2": true,
		"Fluid.Container.enableOfflineLoad": true,
	});

	let provider: ITestObjectProvider;
	const testPersistedCache = new TestPersistedCache();

	beforeEach("setup", async function () {
		provider = getTestObjectProvider({ persistedCache: testPersistedCache });
		if (provider.driver.type !== "odsp") {
			this.skip();
		}
	});

	const loadingGroupId = "loadingGroupId";
	const createDataObjectsWithGroupIds = async (
		mainObject: ITestDataObject,
		containerRuntime: IContainerRuntimeBase,
	) => {
		const dataStoreA = await containerRuntime.createDataStore(
			TestDataObjectType,
			loadingGroupId,
		);
		const dataStoreB = await containerRuntime.createDataStore(
			TestDataObjectType,
			loadingGroupId,
		);

		mainObject._root.set("dataObjectA", dataStoreA.entryPoint);
		mainObject._root.set("dataObjectB", dataStoreB.entryPoint);
	};

	it("Should not make odsp network calls", async () => {
		const container = await provider.makeTestContainer({
			runtimeOptions,
			loaderProps: { configProvider },
		});
		const mainObject = (await container.getEntryPoint()) as ITestDataObject;
		const containerRuntime = mainObject._context.containerRuntime;

		// Testing all apis for creating a data store with a loadingGroupId
		await createDataObjectsWithGroupIds(mainObject, containerRuntime);
		const { summarizer } = await createSummarizer(provider, container, {
			loaderProps: { configProvider },
		});
		await provider.ensureSynchronized();
		await summarizeNow(summarizer);

		testPersistedCache.clearCache();
		const logger = new MockLogger();
		await provider.loadTestContainer({
			loaderProps: { configProvider, logger },
		});
		if (provider.driver.type === "odsp") {
			logger.assertMatchNone(
				[
					{
						eventName: "fluid:telemetry:OdspDriver:readDataBlob_end",
					},
				],
				"Should not have any odps network calls",
			);
		}
	});
});
