/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	createSummarizer,
	ITestObjectProvider,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import {
	describeFullCompat,
	describeNoCompat,
	ITestDataObject,
	TestDataObjectType,
} from "@fluid-internal/test-version-utils";
import { defaultGCConfig } from "./gcTestConfigs.js";
import { getGCStateFromSummary } from "./gcTestSummaryUtils.js";

/**
 * Validates this scenario: When a datastore is aliased it is always referenced.
 */
describeFullCompat("GC Data Store Aliased Full Compat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;

	beforeEach(async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	async function waitForSummary(container: IContainer) {
		const dataStore = await requestFluidObject<ITestDataObject>(container, "default");
		return (dataStore._context.containerRuntime as ContainerRuntime).summarize({
			runGC: true,
			trackState: false,
		});
	}

	it("An unreferenced datastore when aliased becomes referenced.", async () => {
		const container1 = await provider.makeTestContainer(defaultGCConfig);
		const container2 = await provider.loadTestContainer(defaultGCConfig);
		const mainDataStore1 = await requestFluidObject<ITestDataObject>(container1, "default");
		const mainDataStore2 = await requestFluidObject<ITestDataObject>(container2, "default");
		await waitForContainerConnection(container1);
		await waitForContainerConnection(container2);

		const dataStore2 = await mainDataStore1._context.containerRuntime.createDataStore(
			TestDataObjectType,
		);
		const dataObject2 = (await dataStore2.entryPoint?.get()) as ITestDataObject;
		// Make dataStore2 visible but unreferenced by referencing/unreferencing it.
		mainDataStore1._root.set("dataStore2", dataObject2);
		mainDataStore1._root.delete("dataStore2");
		await provider.ensureSynchronized();

		// We run the summary so await this.getInitialSnapshotDetails() is called before the datastore is aliased
		// and after the datastore is attached. This sets the isRootDataStore to false.
		let summaryWithStats = await waitForSummary(container2);
		const gcStatePreAlias = getGCStateFromSummary(summaryWithStats.summary);
		assert(gcStatePreAlias !== undefined, "Should get gc pre state from summary!");
		assert(
			gcStatePreAlias.gcNodes[dataObject2.handle.absolutePath].unreferencedTimestampMs !==
				undefined,
			"dataStore2 should be unreferenced as it is not aliased and not root!",
		);

		// Alias a datastore
		const alias = "alias";
		const aliasResult1 = await dataStore2.trySetAlias(alias);
		assert(aliasResult1 === "Success", `Expected an successful aliasing. Got: ${aliasResult1}`);
		await provider.ensureSynchronized();

		// Should be able to retrieve root datastore from remote
		const containerRuntime2 = mainDataStore2._context
			.containerRuntime as unknown as IContainerRuntime;
		assert.doesNotThrow(
			async () => containerRuntime2.getAliasedDataStoreEntryPoint(alias),
			"Aliased datastore should be root as it is aliased!",
		);
		summaryWithStats = await waitForSummary(container2);
		const gcStatePostAlias = getGCStateFromSummary(summaryWithStats.summary);
		assert(gcStatePostAlias !== undefined, "Should get gc post state from summary!");
		assert(
			gcStatePostAlias.gcNodes[dataObject2.handle.absolutePath].unreferencedTimestampMs ===
				undefined,
			"dataStore2 should be referenced as it is aliased and thus a root datastore!",
		);
	});
});

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
