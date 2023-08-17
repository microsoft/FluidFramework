/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	createSummarizer,
	ITestObjectProvider,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import {
	describeNoCompat,
	ITestDataObject,
	TestDataObjectType,
} from "@fluid-internal/test-version-utils";
import { defaultGCConfig } from "./gcTestConfigs.js";
import { getGCStateFromSummary } from "./gcTestSummaryUtils.js";

describeNoCompat("GC Data Store Aliased No Compat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;

	beforeEach(async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	it("Aliased datastore is referenced even without storing handles", async () => {
		const container = await provider.makeTestContainer(defaultGCConfig);
		const remoteContainer = await provider.loadTestContainer(defaultGCConfig);
		await waitForContainerConnection(container);
		await waitForContainerConnection(remoteContainer);

		// Create and alias datastore
		const mainDatastore = await requestFluidObject<ITestDataObject>(container, "default");
		const aliasedDataStore = await mainDatastore._context.containerRuntime.createDataStore(
			TestDataObjectType,
		);
		const alias = "alias";
		await aliasedDataStore.trySetAlias(alias);

		// summarize
		const { summarizer } = await createSummarizer(provider, container);
		const { summaryTree } = await summarizeNow(summarizer);
		const gcState = getGCStateFromSummary(summaryTree);
		assert(
			aliasedDataStore.entryPoint !== undefined,
			"Expecting an entrypoint handle in a non-compat test!",
		);
		assert(
			gcState?.gcNodes[aliasedDataStore.entryPoint.absolutePath].unreferencedTimestampMs ===
				undefined,
			"Aliased datastores should always be referenced!",
		);
	});

	it("Aliased datastore is referenced when removing its stored handles", async () => {
		const container = await provider.makeTestContainer(defaultGCConfig);
		const remoteContainer = await provider.loadTestContainer(defaultGCConfig);
		await waitForContainerConnection(container);
		await waitForContainerConnection(remoteContainer);

		// Create and alias datastore
		const mainDatastore = await requestFluidObject<ITestDataObject>(container, "default");
		const aliasedDataStore = await mainDatastore._context.containerRuntime.createDataStore(
			TestDataObjectType,
		);
		const alias = "alias";
		const handleKey = "handle";
		await aliasedDataStore.trySetAlias(alias);
		assert(
			aliasedDataStore.entryPoint !== undefined,
			"We need a defined handle to reference the datastore!",
		);
		mainDatastore._root.set(handleKey, aliasedDataStore.entryPoint);
		mainDatastore._root.delete(handleKey);

		// summarize
		const { summarizer } = await createSummarizer(provider, container);
		const { summaryTree } = await summarizeNow(summarizer);
		const gcState = getGCStateFromSummary(summaryTree);
		assert(
			aliasedDataStore.entryPoint !== undefined,
			"Expecting an entrypoint handle in a non-compat test!",
		);
		assert(
			gcState?.gcNodes[aliasedDataStore.entryPoint.absolutePath].unreferencedTimestampMs ===
				undefined,
			"Aliased datastores should always be referenced!",
		);
	});
});
